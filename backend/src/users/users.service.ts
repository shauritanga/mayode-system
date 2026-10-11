import { hasGrant } from '../auth/role-access';
import { assertWithinCeiling, grantsOfRole } from '../auth/delegation';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { normalizeMsisdn } from '../messaging/sms.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto, UpdateUserDto } from './dto/update-user.dto';
import type { RequestUser } from '../common/ownership.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The AMCOS a non-super actor is confined to (a cooperative admin), or null for
   * Super Admin and platform-level accounts, which stay unscoped.
   */
  private tenantOf(actor?: RequestUser): string | null {
    if (!actor || actor.role === UserRole.SUPER_ADMIN) return null;
    return actor.mamcosId ?? null;
  }

  private inTenant(
    target: { mamcosId?: string | null; mamcosStaff?: { mamcosId?: string | null } | null },
    tenant: string,
  ) {
    return target.mamcosId === tenant || target.mamcosStaff?.mamcosId === tenant;
  }

  async findAll(actor?: RequestUser) {
    const tenant = this.tenantOf(actor);
    return this.prisma.user.findMany({
      // A cooperative admin sees only their own AMCOS's staff accounts.
      where: tenant ? { OR: [{ mamcosId: tenant }, { mamcosStaff: { mamcosId: tenant } }] } : undefined,
      select: {
        mamcosId: true,
        mamcos: { select: { name: true } },
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        roleId: true,
        customRole: { select: { id: true, name: true } },
        isActive: true,
        language: true,
        profilePhotoUrl: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  /** Self-service or an explicitly granted users VIEW permission. */
  async findOne(id: string, requestUser?: RequestUser) {
    const isSelf = requestUser?.id === id;
    const isPlatformStaff =
      hasGrant(requestUser, 'users', 'VIEW');
    if (!isSelf && !isPlatformStaff) {
      throw new ForbiddenException(
        'Viewing other accounts requires users VIEW permission',
      );
    }
    const user = await this.findExisting(id);
    const tenant = this.tenantOf(requestUser);
    if (tenant && !isSelf && !this.inTenant(user, tenant)) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /** Existence check without access scoping — for internal service use. */
  private async findExisting(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        roleId: true,
        mamcosId: true,
        isActive: true,
        language: true,
        profilePhotoUrl: true,
        lastLoginAt: true,
        createdAt: true,
        farmer: true,
        mamcosStaff: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    requestUser?: RequestUser,
  ) {
    const existing = await this.findExisting(id);
    const isSelf = requestUser?.id === id;
    const isStaff =
      hasGrant(requestUser, 'users', 'EDIT');
    if (!isSelf && !isStaff) {
      throw new ForbiddenException('You may only update your own account');
    }
    const superActor = requestUser?.role === UserRole.SUPER_ADMIN;
    const tenant = this.tenantOf(requestUser);
    if (tenant && !isSelf && !this.inTenant(existing, tenant)) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    if (updateUserDto.role && !superActor) {
      throw new ForbiddenException(
        'Only a Super Admin may change a user’s role',
      );
    }
    if (updateUserDto.roleId !== undefined && !superActor) {
      // Role assignment is delegated only to a cooperative admin, inside their own AMCOS.
      if (!tenant) {
        throw new ForbiddenException('Only a Super Admin may assign a custom role');
      }
      if (isSelf) {
        throw new ForbiddenException('You cannot change your own role');
      }
    }
    if (updateUserDto.isActive === false && isSelf && !superActor) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const data: Record<string, unknown> & typeof updateUserDto = { ...updateUserDto };
    if (data.role !== undefined) {
      if (data.role !== UserRole.SUPER_ADMIN || data.roleId) {
        throw new BadRequestException('Choose Super Admin or a custom role using roleId');
      }
      data.roleId = null;
    } else if (data.roleId) {
      const customRole = await this.prisma.role.findUnique({
        where: { id: data.roleId },
        include: { permissions: { include: { resource: true } } },
      });
      if (!customRole || !customRole.isActive || customRole.isSystem || customRole.systemRole === UserRole.SUPER_ADMIN) {
        throw new BadRequestException('Custom role must be an active, non-system role from Role Management');
      }
      if (tenant && !superActor) {
        if (customRole.mamcosId !== tenant) throw new BadRequestException('Select a role from your cooperative');
        assertWithinCeiling(requestUser!, grantsOfRole(customRole));
      }
      if (customRole.mamcosId) {
        const accountMamcos = existing.mamcosId ?? existing.mamcosStaff?.mamcosId ?? null;
        if (accountMamcos && accountMamcos !== customRole.mamcosId) {
          throw new BadRequestException('This role belongs to a different cooperative than the account');
        }
        data.mamcosId = customRole.mamcosId;
      }
      // A role only carries permissions: the account keeps its operational type (field
      // officer, secretary, ...). Only a former Super Admin is reset to a general account.
      data.role = existing.role === UserRole.SUPER_ADMIN ? UserRole.CUSTOM : existing.role;
    } else if (data.roleId === null) {
      throw new BadRequestException('Assign a replacement role; accounts cannot use built-in fallback roles');
    }
    if (existing.role === UserRole.SUPER_ADMIN && requestUser?.role !== UserRole.SUPER_ADMIN && !isSelf) {
      throw new ForbiddenException('Only Super Admin may edit a Super Admin account');
    }
    if (updateUserDto.isActive !== undefined && !isStaff) {
      throw new ForbiddenException(
        'Only staff may change account active status',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        roleId: true,
        mamcosId: true,
        customRole: { select: { id: true, name: true } },
        isActive: true,
        language: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Self-service profile update. Only the whitelisted UpdateProfileDto fields
   * reach this method; uniqueness on phone/email is pre-checked for a clean
   * 409 instead of a Prisma unique-constraint 500.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.findExisting(userId); // Ensure user exists

    // The phone number is the sign-in credential: it can only change through a verified-code flow.
    if (dto.phone && normalizeMsisdn(dto.phone) !== existing.phone) {
      throw new BadRequestException(
        'Your phone number is your sign-in. Ask your administrator to change it.',
      );
    }
    if (dto.phone) {
      const taken = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
        select: { id: true },
      });
      if (taken && taken.id !== userId) {
        throw new ConflictException('Phone number is already in use');
      }
    }
    if (dto.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (taken && taken.id !== userId) {
        throw new ConflictException('Email address is already in use');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        language: true,
        profilePhotoUrl: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findExisting(id); // Ensure user exists
    await this.prisma.user.delete({ where: { id } });
    return {
      success: true,
      message: `User with ID ${id} deleted successfully`,
    };
  }

  async updatePushToken(userId: string, pushToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { pushToken },
      select: { id: true, pushToken: true },
    });
  }
}
