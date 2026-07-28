import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
} from './dto/auth.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UserRole } from '@prisma/client';

/** Roles only a SUPER_ADMIN may grant; an ADMIN cannot create peers or escalate to SUPER_ADMIN. */
const SUPER_ADMIN_ONLY_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Helper to generate unique Control Number for Farmers (MYD-XXXXX)
   */
  private async generateControlNumber(): Promise<string> {
    const prefix =
      this.configService.get<string>('CONTROL_NUMBER_PREFIX') || 'MYD';
    const lastFarmer = await this.prisma.farmer.findFirst({
      where: { controlNumber: { startsWith: prefix } },
      orderBy: { controlNumber: 'desc' },
    });

    if (!lastFarmer) {
      return `${prefix}-00001`;
    }

    const lastNumber = parseInt(
      lastFarmer.controlNumber.replace(`${prefix}-`, ''),
      10,
    );
    const nextNumber = lastNumber + 1;
    const padded = nextNumber.toString().padStart(5, '0');
    return `${prefix}-${padded}`;
  }

  /**
   * Helper to generate unique Employee Code for Field Officers (FO-XXXX)
   */
  private async generateEmployeeCode(): Promise<string> {
    const lastOfficer = await this.prisma.fieldOfficer.findFirst({
      orderBy: { employeeCode: 'desc' },
    });

    if (!lastOfficer) {
      return 'FO-0001';
    }

    const lastNumber = parseInt(
      lastOfficer.employeeCode.replace('FO-', ''),
      10,
    );
    const nextNumber = lastNumber + 1;
    const padded = nextNumber.toString().padStart(4, '0');
    return `FO-${padded}`;
  }

  /**
   * Helper to generate tokens and store refresh token
   */
  private async generateTokens(
    user: {
      id: string;
      phone: string;
      role: UserRole;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    },
    controlNumber?: string,
  ): Promise<AuthResponseDto> {
    const accessTokenPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    };

    const refreshTokenPayload = {
      sub: user.id,
      // Unique per issuance: two logins in the same second would otherwise
      // produce identical JWTs and violate the refresh-token unique constraint.
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload, {
        secret:
          this.configService.get<string>('JWT_SECRET') ||
          'mayode-super-secret-key-change-in-production-2026',
        expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') ||
          '15m') as any,
      }),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'mayode-refresh-secret-key-change-in-production-2026',
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ||
          '7d') as any,
      }),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email || undefined,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        role: user.role,
        controlNumber,
      },
    };
  }

  /**
   * Public self-registration. Always creates a FARMER account — this endpoint
   * is unauthenticated, so any other role (including staff and admin roles)
   * must be created through UsersService.createStaffAccount by an existing
   * SUPER_ADMIN/ADMIN. The `role` field on RegisterDto is intentionally
   * ignored here; it only still exists on the DTO for backward-compatible
   * request bodies (whitelist validation would otherwise reject it).
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { phone, email, password, firstName, lastName, language } =
      registerDto;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone }, { email: email || undefined }],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this phone number or email already exists',
      );
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let createdUser;
    let controlNumber: string | undefined = undefined;

    try {
      createdUser = await this.prisma.$transaction(async (prisma) => {
        const user = await prisma.user.create({
          data: {
            phone,
            email,
            passwordHash,
            firstName,
            lastName,
            role: UserRole.FARMER,
            language: language || 'sw',
          },
        });

        controlNumber = await this.generateControlNumber();
        await prisma.farmer.create({
          data: {
            userId: user.id,
            controlNumber,
            firstName,
            lastName,
          },
        });

        return user;
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to create user account: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }

    return this.generateTokens(createdUser, controlNumber);
  }

  /**
   * Staff/admin account creation — authenticated, SUPER_ADMIN/ADMIN only
   * (enforced by RolesGuard at the controller). Unlike public register(),
   * this accepts any role. A plain ADMIN may not create SUPER_ADMIN or ADMIN
   * accounts — only a SUPER_ADMIN can grant those, to prevent privilege
   * escalation via a compromised or careless ADMIN account.
   */
  async createStaffAccount(
    dto: CreateStaffUserDto,
    creatorRole: UserRole,
    creatorUserId: string,
  ) {
    if (
      SUPER_ADMIN_ONLY_ROLES.includes(dto.role) &&
      creatorRole !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only a SUPER_ADMIN can create SUPER_ADMIN or ADMIN accounts',
      );
    }

    // An AMCOS Secretary may only self-service Field Officer accounts for
    // their own cooperative — the mamcosId is resolved server-side and any
    // client-supplied value is ignored, so a secretary can never create an
    // officer under a different AMCOS.
    if (creatorRole === UserRole.MAMCOS_SECRETARY) {
      if (dto.role !== UserRole.FIELD_OFFICER) {
        throw new ForbiddenException(
          'AMCOS secretaries can only create Field Officer accounts',
        );
      }
      const secretary = await this.prisma.mamcosSecretary.findUnique({
        where: { userId: creatorUserId },
        select: { mamcosId: true },
      });
      if (!secretary) {
        throw new ForbiddenException('AMCOS secretary profile not found');
      }
      dto.mamcosId = secretary.mamcosId;
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ phone: dto.phone }, { email: dto.email || undefined }] },
    });
    if (existingUser) {
      throw new ConflictException(
        'User with this phone number or email already exists',
      );
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    return this.prisma.$transaction(async (prisma) => {
      const user = await prisma.user.create({
        data: {
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          language: dto.language || 'sw',
        },
        select: {
          id: true,
          phone: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });

      if (dto.role === UserRole.FARMER) {
        const controlNumber = await this.generateControlNumber();
        await prisma.farmer.create({
          data: {
            userId: user.id,
            controlNumber,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
      } else if (dto.role === UserRole.FIELD_OFFICER) {
        if (!dto.mamcosId) throw new BadRequestException('mamcosId is required for a Field Officer');
        const mamcos = await prisma.mamcos.findUnique({ where: { id: dto.mamcosId }, select: { id: true } });
        if (!mamcos) throw new NotFoundException('AMCOS not found');
        const employeeCode = await this.generateEmployeeCode();
        await prisma.fieldOfficer.create({
          data: {
            userId: user.id,
            employeeCode,
            firstName: dto.firstName,
            lastName: dto.lastName,
            assignedArea: dto.assignedArea,
            mamcosId: dto.mamcosId,
          },
        });
      } else if (dto.role === UserRole.MAMCOS_SECRETARY) {
        if (!dto.mamcosId) throw new BadRequestException('mamcosId is required for an AMCOS Leader');
        const mamcos = await prisma.mamcos.findUnique({ where: { id: dto.mamcosId }, select: { id: true } });
        if (!mamcos) throw new NotFoundException('AMCOS not found');
        const existing = await prisma.mamcosSecretary.findUnique({ where: { mamcosId: dto.mamcosId } });
        if (existing) throw new ConflictException('This AMCOS already has a Leader; reassign the current Leader instead');
        await prisma.mamcosSecretary.create({ data: { userId: user.id, mamcosId: dto.mamcosId, firstName: dto.firstName, lastName: dto.lastName } });
      }

      return user;
    });
  }

  /**
   * User Login
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { phone, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        farmer: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Invalid credentials or inactive account',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateTokens(user, user.farmer?.controlNumber);
  }

  /**
   * Refresh Access Token
   */
  async refresh(refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
    const { refreshToken } = refreshTokenDto;

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: { farmer: true },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw new UnauthorizedException('Refresh token has expired');
    }

    try {
      await this.jwtService.verifyAsync(refreshToken, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'mayode-refresh-secret-key-change-in-production-2026',
      });
    } catch {
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw new UnauthorizedException('Invalid refresh token signature');
    }

    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    return this.generateTokens(
      storedToken.user,
      storedToken.user.farmer?.controlNumber,
    );
  }

  /**
   * Logout (Revoke Refresh Token)
   */
  async logout(userId: string): Promise<{ success: boolean; message: string }> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
    return {
      success: true,
      message: 'Logged out successfully across all devices',
    };
  }
}
