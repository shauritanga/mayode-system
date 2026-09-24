import { assertAssignedRole } from './role-access';
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
  FarmerSelfRegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
} from './dto/auth.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UserRole, MamcosStaffRole } from '@prisma/client';
import { normalizeMsisdn } from '../messaging/sms.service';

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
  private async generateControlNumber(db: { farmer: { findMany: Function } } = this.prisma as any): Promise<string> {
    const prefix = (this.configService.get<string>('CONTROL_NUMBER_PREFIX') || 'MYD').replace(/-+$/, '');
    const rows = await db.farmer.findMany({
      where: { controlNumber: { startsWith: `${prefix}-` } },
      select: { controlNumber: true },
    });
    const nextNumber = rows.reduce((max: number, row: { controlNumber: string }) => {
      const match = row.controlNumber.match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    return `${prefix}-${nextNumber.toString().padStart(5, '0')}`;
  }

  /**
   * Helper to generate unique Employee Code for Field Officers (FO-XXXX)
   */
  private async generateEmployeeCode(): Promise<string> {
    const lastOfficer = await this.prisma.mamcosStaff.findFirst({
      where: { role: MamcosStaffRole.FIELD_OFFICER },
      orderBy: { employeeCode: 'desc' },
    });

    if (!lastOfficer || !lastOfficer.employeeCode) {
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
      profilePhotoUrl?: string | null;
      roleId?: string | null;
      customRole?: {
        id: string;
        name: string;
        isActive: boolean;
        isSystem: boolean;
        permissions: { action: string; resource: { key: string } }[];
      } | null;
    },
    controlNumber?: string,
  ): Promise<AuthResponseDto> {
    assertAssignedRole(user);
    // Flatten the custom-role matrix for clients: the web dashboard uses it
    // to hide navigation/routes the API would reject with 403. Empty for
    // Super Admin (the only built-in role).
    const permissions = (user.customRole?.permissions ?? []).map((p) => ({
      resource: p.resource.key,
      action: p.action,
    }));
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
        roleId: user.roleId || undefined,
        customRoleName: user.customRole?.name,
        permissions,
        controlNumber,
        profilePhotoUrl: user.profilePhotoUrl || undefined,
      },
    };
  }

  /**
   * Current-session profile for clients (nav guards, permission-aware UI).
   * Same user shape as login/refresh so the frontend has a single source.
   */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        farmer: true,
        customRole: {
          include: { permissions: { include: { resource: true } } },
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or unauthorized');
    }
    assertAssignedRole(user);
    const permissions = (user.customRole?.permissions ?? []).map((p) => ({
      resource: p.resource.key,
      action: p.action,
    }));
    return {
      id: user.id,
      phone: user.phone,
      email: user.email || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      role: user.role,
      roleId: user.roleId || undefined,
      customRoleName: user.customRole?.name,
      permissions,
      controlNumber: user.farmer?.controlNumber,
      profilePhotoUrl: user.profilePhotoUrl || undefined,
    };
  }

  async selfRegisterFarmer(dto: FarmerSelfRegisterDto): Promise<AuthResponseDto> {
    const configuredRoleId = this.configService.get<string>('FARMER_SELF_REGISTRATION_ROLE_ID');
    const roles = await this.prisma.role.findMany({
      where: {
        isActive: true,
        isSystem: false,
        systemRole: UserRole.FARMER,
        ...(configuredRoleId ? { id: configuredRoleId } : {}),
      },
      take: 2,
    });
    if (roles.length !== 1) {
      throw new BadRequestException(
        'Farmer registration is not configured. Please contact support.',
      );
    }
    // Only the server-selected Farmer role can be assigned through this route.
    return this.registerFarmerAccount({ ...dto, roleId: roles[0].id });
  }

  /** Super Admin provisions a farmer using an explicitly selected custom role. */
  async register(registerDto: RegisterDto, creatorRole: UserRole): Promise<AuthResponseDto> {
    if (creatorRole !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only Super Admin may assign roles');
    return this.registerFarmerAccount(registerDto);
  }

  private async registerFarmerAccount(registerDto: RegisterDto): Promise<AuthResponseDto> {
    if (!registerDto.roleId) throw new BadRequestException('A custom Farmer role is required');
    const customRole = await this.prisma.role.findUnique({
      where: { id: registerDto.roleId },
      include: { permissions: { include: { resource: true } } },
    });
    if (!customRole || !customRole.isActive || customRole.isSystem || customRole.systemRole !== UserRole.FARMER) {
      throw new BadRequestException('Select an active custom role with a Farmer operational profile');
    }
    const { email, password, firstName, lastName, language, dataShareConsent } =
      registerDto;
    const phone = normalizeMsisdn(registerDto.phone);

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

    for (let attempt = 0; attempt < 5; attempt += 1) {
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
            roleId: customRole.id,
            language: language || 'sw',
          },
        });

        controlNumber = await this.generateControlNumber(prisma as any);
        await prisma.farmer.create({
          data: {
            userId: user.id,
            controlNumber,
            firstName,
            lastName,
            dataShareConsent: dataShareConsent ?? false,
            consentedAt: dataShareConsent ? new Date() : null,
          },
        });

        return user;
        });
        break;
      } catch (error: any) {
        const target = Array.isArray(error?.meta?.target) ? error.meta.target : [];
        if (error?.code === 'P2002' && target.includes('control_number') && attempt < 4) continue;
        throw new InternalServerErrorException(
          'Failed to create user account: ' +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    return this.generateTokens({ ...createdUser, customRole }, controlNumber);
  }

  /** Only Super Admin can provision accounts and assign their access role. */
  async createStaffAccount(dto: CreateStaffUserDto, creatorRole: UserRole) {
    if (creatorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin may create accounts and assign roles');
    }
    if (dto.role && dto.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Select a custom role created by Super Admin using roleId');
    }
    if (dto.role === UserRole.SUPER_ADMIN && dto.roleId) {
      throw new BadRequestException('Choose either Super Admin or a custom role');
    }
    let accountProfile: UserRole = UserRole.SUPER_ADMIN;
    if (dto.role !== UserRole.SUPER_ADMIN) {
      if (!dto.roleId) throw new BadRequestException('A custom role is required');
      const customRole = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!customRole || !customRole.isActive || customRole.isSystem || customRole.systemRole === UserRole.SUPER_ADMIN) {
        throw new BadRequestException('Select an active, non-system role created by Super Admin');
      }
      accountProfile = customRole.systemRole ?? UserRole.CUSTOM;
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
          role: accountProfile,
          roleId: dto.roleId,
          language: dto.language || 'sw',
        },
        select: {
          id: true,
          phone: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          roleId: true,
          createdAt: true,
        },
      });

      if (accountProfile === UserRole.FARMER) {
        const controlNumber = await this.generateControlNumber();
        await prisma.farmer.create({
          data: {
            userId: user.id,
            controlNumber,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
      } else if (accountProfile === UserRole.FIELD_OFFICER) {
        if (!dto.mamcosId)
          throw new BadRequestException(
            'mamcosId is required for a Field Officer',
          );
        const mamcos = await prisma.mamcos.findUnique({
          where: { id: dto.mamcosId },
          select: { id: true },
        });
        if (!mamcos) throw new NotFoundException('AMCOS not found');
        const employeeCode = await this.generateEmployeeCode();
        await prisma.mamcosStaff.create({
          data: {
            userId: user.id,
            role: MamcosStaffRole.FIELD_OFFICER,
            employeeCode,
            firstName: dto.firstName,
            lastName: dto.lastName,
            assignedArea: dto.assignedArea,
            mamcosId: dto.mamcosId,
          },
        });
      } else if (accountProfile === UserRole.MAMCOS_SECRETARY) {
        if (!dto.mamcosId)
          throw new BadRequestException(
            'mamcosId is required for an AMCOS Leader',
          );
        const mamcos = await prisma.mamcos.findUnique({
          where: { id: dto.mamcosId },
          select: { id: true },
        });
        if (!mamcos) throw new NotFoundException('AMCOS not found');
        const existing = await prisma.mamcosStaff.findFirst({
          where: { mamcosId: dto.mamcosId, role: MamcosStaffRole.SECRETARY },
        });
        if (existing)
          throw new ConflictException(
            'This AMCOS already has a Leader; reassign the current Leader instead',
          );
        await prisma.mamcosStaff.create({
          data: {
            userId: user.id,
            role: MamcosStaffRole.SECRETARY,
            mamcosId: dto.mamcosId,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
      }

      return user;
    });
  }

  /**
   * User Login
   */
  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { password } = loginDto;
    const phone = normalizeMsisdn(loginDto.phone);

    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        farmer: true,
        customRole: {
          include: { permissions: { include: { resource: true } } },
        },
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
          include: {
            farmer: true,
            customRole: {
              include: { permissions: { include: { resource: true } } },
            },
          },
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

    if (!storedToken.user.isActive) throw new UnauthorizedException('Account is inactive');
    assertAssignedRole(storedToken.user);
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
