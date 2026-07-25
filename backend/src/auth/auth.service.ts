import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, RefreshTokenDto, AuthResponseDto } from './dto/auth.dto';
import { UserRole } from '@prisma/client';

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
    const prefix = this.configService.get<string>('CONTROL_NUMBER_PREFIX') || 'MYD';
    const lastFarmer = await this.prisma.farmer.findFirst({
      where: { controlNumber: { startsWith: prefix } },
      orderBy: { controlNumber: 'desc' },
    });

    if (!lastFarmer) {
      return `${prefix}-00001`;
    }

    const lastNumber = parseInt(lastFarmer.controlNumber.replace(`${prefix}-`, ''), 10);
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

    const lastNumber = parseInt(lastOfficer.employeeCode.replace('FO-', ''), 10);
    const nextNumber = lastNumber + 1;
    const padded = nextNumber.toString().padStart(4, '0');
    return `FO-${padded}`;
  }

  /**
   * Helper to generate tokens and store refresh token
   */
  private async generateTokens(user: { id: string; phone: string; role: UserRole; email?: string | null }, controlNumber?: string): Promise<AuthResponseDto> {
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
        secret: this.configService.get<string>('JWT_SECRET') || 'mayode-super-secret-key-change-in-production-2026',
        expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') || '15m') as any,
      }),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'mayode-refresh-secret-key-change-in-production-2026',
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d') as any,
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
        role: user.role,
        controlNumber,
      },
    };
  }

  /**
   * User Registration with auto Control Number generation
   */
  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { phone, email, password, role, firstName, lastName, language } = registerDto;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone }, { email: email || undefined }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this phone number or email already exists');
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
            role: role as unknown as UserRole,
            language: language || 'sw',
          },
        });

        if (role === 'FARMER') {
          controlNumber = await this.generateControlNumber();
          await prisma.farmer.create({
            data: {
              userId: user.id,
              controlNumber,
              firstName,
              lastName,
            },
          });
        } else if (role === 'FIELD_OFFICER') {
          const employeeCode = await this.generateEmployeeCode();
          await prisma.fieldOfficer.create({
            data: {
              userId: user.id,
              employeeCode,
              firstName,
              lastName,
            },
          });
        }

        return user;
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to create user account: ' + (error instanceof Error ? error.message : String(error)));
    }

    return this.generateTokens(createdUser, controlNumber);
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
      throw new UnauthorizedException('Invalid credentials or inactive account');
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
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'mayode-refresh-secret-key-change-in-production-2026',
      });
    } catch {
      await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
      throw new UnauthorizedException('Invalid refresh token signature');
    }

    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    return this.generateTokens(storedToken.user, storedToken.user.farmer?.controlNumber);
  }

  /**
   * Logout (Revoke Refresh Token)
   */
  async logout(userId: string): Promise<{ success: boolean; message: string }> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
    return { success: true, message: 'Logged out successfully across all devices' };
  }
}
