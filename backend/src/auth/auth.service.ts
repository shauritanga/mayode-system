import { assertAssignedRole } from './role-access';
import { isLegacyFarmerRole } from './farmer-role';
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
import { randomBytes, randomUUID } from 'crypto';
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
import { createRoleTemplates } from '../roles/role-templates';
import {
  assertWithinCeiling,
  DelegatingActor,
  grantsOfRole,
  isSuperAdmin,
  PLATFORM_ONLY_RESOURCES,
  requireTenant,
} from './delegation';
import { CreateCooperativeAdminDto } from './dto/create-cooperative-admin.dto';

const WEB_ONLY_ROLES = new Set<UserRole>([UserRole.BUYER, UserRole.AUDITOR, UserRole.FINANCIAL_PROVIDER]);
const COOPERATIVE_ADMIN_ROLE = 'Cooperative Admin';

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
      mamcosId?: string | null;
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
        mamcosId: user.mamcosId || undefined,
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
      mamcosId: user.mamcosId || undefined,
      customRoleName: user.customRole?.name,
      permissions,
      controlNumber: user.farmer?.controlNumber,
      profilePhotoUrl: user.profilePhotoUrl || undefined,
    };
  }

  async selfRegisterFarmer(dto: FarmerSelfRegisterDto): Promise<AuthResponseDto> {
    // Farmers are not a managed role: the account is a plain FARMER with no custom role attached.
    return this.registerFarmerAccount(dto);
  }

  /** Super Admin provisions a farmer account. */
  async register(registerDto: RegisterDto, creatorRole: UserRole): Promise<AuthResponseDto> {
    if (creatorRole !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only Super Admin may create farmer accounts');
    return this.registerFarmerAccount(registerDto);
  }

  /** Phone ownership was proved by a sign-in code: create the farmer with no usable password. */
  async registerVerifiedFarmer(
    dto: Omit<FarmerSelfRegisterDto, 'password'>,
  ): Promise<AuthResponseDto> {
    return this.registerFarmerAccount(dto);
  }

  /** Sign in an active account whose phone was just verified by a code. Null when there is no such account. */
  async loginVerifiedPhone(rawPhone: string): Promise<AuthResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone: normalizeMsisdn(rawPhone) },
      include: {
        farmer: true,
        customRole: { include: { permissions: { include: { resource: true } } } },
      },
    });
    if (!user) return null;
    if (!user.isActive) throw new UnauthorizedException('This account is inactive');
    // Buyers, auditors and lenders use the web portals, where the password stays the credential.
    if (WEB_ONLY_ROLES.has(user.role)) {
      throw new ForbiddenException('This account signs in on the web portal with its password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.generateTokens(user, user.farmer?.controlNumber);
  }

  private async registerFarmerAccount(
    registerDto: Omit<RegisterDto, 'password'> & { password?: string },
  ): Promise<AuthResponseDto> {
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
    // Code-verified sign-ups have no password; the random hash can never be matched.
    const passwordHash = await bcrypt.hash(password ?? randomBytes(32).toString('hex'), salt);

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
            region: registerDto.region,
            district: registerDto.district,
            ward: registerDto.ward,
            village: registerDto.village,
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

    return this.generateTokens({ ...createdUser, customRole: null }, controlNumber);
  }

  /**
   * Provision a staff account. Super Admin may create any account; a cooperative
   * admin (a non-super actor with a `mamcosId` and the `users` CREATE grant, checked
   * by the controller) may create accounts only inside their own AMCOS, from roles
   * of that AMCOS, and never with more permissions than they hold themselves.
   */
  async createStaffAccount(dto: CreateStaffUserDto, actor: DelegatingActor) {
    const superActor = isSuperAdmin(actor);
    const tenantId = superActor ? null : requireTenant(actor);

    if (dto.role && dto.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Select a custom role using roleId');
    }
    if (dto.role === UserRole.SUPER_ADMIN && dto.roleId) {
      throw new BadRequestException('Choose either Super Admin or a custom role');
    }
    if (dto.role === UserRole.SUPER_ADMIN && !superActor) {
      throw new ForbiddenException('Only Super Admin may create a Super Admin account');
    }

    // Super Admin manages the platform team. Cooperative staff belong to the cooperative admin;
    // the only cooperative account Super Admin creates is the admin itself (createCooperativeAdmin).
    if (superActor && (dto.staffType || dto.mamcosId)) {
      throw new BadRequestException(
        'Super Admin creates platform accounts only. A cooperative’s staff are created by its cooperative administrator.',
      );
    }

    let accountProfile: UserRole = UserRole.SUPER_ADMIN;
    let roleMamcosId: string | null = null;
    if (dto.role !== UserRole.SUPER_ADMIN) {
      if (!dto.roleId) throw new BadRequestException('A custom role is required');
      const customRole = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
        include: { permissions: { include: { resource: true } } },
      });
      if (!customRole || isLegacyFarmerRole(customRole) || !customRole.isActive || customRole.isSystem || customRole.systemRole === UserRole.SUPER_ADMIN) {
        throw new BadRequestException('Select an active, non-system role');
      }
      if (superActor) {
        if (customRole.mamcosId) {
          throw new BadRequestException('Select a platform role. A cooperative’s roles are for its own administrator to assign.');
        }
      } else {
        // Roles of other cooperatives (or platform roles) don't exist as far as a cooperative admin is concerned.
        if (customRole.mamcosId !== tenantId) throw new BadRequestException('Select a role from your cooperative');
        assertWithinCeiling(actor, grantsOfRole(customRole));
      }
      roleMamcosId = customRole.mamcosId;
      // The role only carries permissions. Field staff are marked on the account itself.
      accountProfile = dto.staffType ?? UserRole.CUSTOM;
    }

    // The account's cooperative: the creator's own AMCOS, else the role's AMCOS, else an explicit one.
    if (tenantId && dto.mamcosId && dto.mamcosId !== tenantId) {
      throw new ForbiddenException('You can only create accounts inside your own cooperative');
    }
    if (roleMamcosId && dto.mamcosId && dto.mamcosId !== roleMamcosId) {
      throw new BadRequestException('This role belongs to a different cooperative');
    }
    const mamcosId = tenantId ?? roleMamcosId ?? dto.mamcosId ?? null;
    if (mamcosId) {
      const mamcos = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { id: true } });
      if (!mamcos) throw new NotFoundException('AMCOS not found');
    }

    const phone = normalizeMsisdn(dto.phone);
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ phone }, { email: dto.email || undefined }] },
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
          phone,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: accountProfile,
          roleId: dto.roleId,
          mamcosId,
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
          mamcosId: true,
          createdAt: true,
        },
      });

      if (accountProfile === UserRole.FIELD_OFFICER) {
        if (!mamcosId)
          throw new BadRequestException(
            'mamcosId is required for a Field Officer',
          );
        const employeeCode = await this.generateEmployeeCode();
        await prisma.mamcosStaff.create({
          data: {
            userId: user.id,
            role: MamcosStaffRole.FIELD_OFFICER,
            employeeCode,
            firstName: dto.firstName,
            lastName: dto.lastName,
            assignedArea: dto.assignedArea,
            mamcosId,
          },
        });
      } else if (accountProfile === UserRole.MAMCOS_SECRETARY) {
        if (!mamcosId)
          throw new BadRequestException(
            'mamcosId is required for an AMCOS Leader',
          );
        const existing = await prisma.mamcosStaff.findFirst({
          where: { mamcosId, role: MamcosStaffRole.SECRETARY },
        });
        if (existing)
          throw new ConflictException(
            'This AMCOS already has a Leader; reassign the current Leader instead',
          );
        await prisma.mamcosStaff.create({
          data: {
            userId: user.id,
            role: MamcosStaffRole.SECRETARY,
            mamcosId,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
      }

      return user;
    });
  }

  /**
   * Super Admin registers the administrator of a cooperative. Creates (once) an AMCOS-scoped
   * "Cooperative Admin" role holding every grantable permission, and an account on it. That
   * admin then creates their own roles and staff from the cooperative portal.
   */
  async createCooperativeAdmin(dto: CreateCooperativeAdminDto) {
    const mamcos = await this.prisma.mamcos.findUnique({ where: { id: dto.mamcosId }, select: { id: true, name: true } });
    if (!mamcos) throw new NotFoundException('AMCOS not found');

    const phone = normalizeMsisdn(dto.phone);
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ phone }, { email: dto.email || undefined }] },
    });
    if (existingUser) throw new ConflictException('User with this phone number or email already exists');

    const passwordHash = await bcrypt.hash(dto.password, await bcrypt.genSalt(10));

    return this.prisma.$transaction(async (tx) => {
      let role = await tx.role.findFirst({ where: { name: COOPERATIVE_ADMIN_ROLE, mamcosId: mamcos.id } });
      if (!role) {
        role = await tx.role.create({
          data: {
            name: COOPERATIVE_ADMIN_ROLE,
            description: `Manages the roles and staff of ${mamcos.name}`,
            systemRole: UserRole.CUSTOM,
            mamcosId: mamcos.id,
          },
        });
        const resources = await tx.resource.findMany({
          where: { key: { notIn: [...PLATFORM_ONLY_RESOURCES] } },
        });
        await tx.rolePermission.createMany({
          data: resources.flatMap((r) =>
            (['VIEW', 'CREATE', 'EDIT', 'DELETE'] as const).map((action) => ({ roleId: role!.id, resourceId: r.id, action })),
          ),
        });
        // Ready-made sale-workflow roles; the cooperative admin may edit or delete them.
        await createRoleTemplates(tx, mamcos.id);
      }
      const user = await tx.user.create({
        data: {
          phone,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.CUSTOM,
          roleId: role.id,
          mamcosId: mamcos.id,
          language: dto.language || 'sw',
        },
        select: { id: true, phone: true, email: true, firstName: true, lastName: true, role: true, roleId: true, mamcosId: true, createdAt: true },
      });
      return { ...user, roleName: role.name, mamcosName: mamcos.name };
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
