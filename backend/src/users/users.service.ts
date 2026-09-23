import { hasGrant } from '../auth/role-access';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto, UpdateUserDto } from './dto/update-user.dto';
import type { RequestUser } from '../common/ownership.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
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
    return this.findExisting(id);
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
    if (updateUserDto.role && requestUser?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only a Super Admin may change a user’s role',
      );
    }
    if (
      updateUserDto.roleId !== undefined &&
      requestUser?.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only a Super Admin may assign a custom role',
      );
    }
    const data = { ...updateUserDto };
    if (data.role !== undefined) {
      if (data.role !== UserRole.SUPER_ADMIN || data.roleId) {
        throw new BadRequestException('Choose Super Admin or a custom role using roleId');
      }
      data.roleId = null;
    } else if (data.roleId) {
      const customRole = await this.prisma.role.findUnique({ where: { id: data.roleId } });
      if (!customRole || !customRole.isActive || customRole.isSystem || customRole.systemRole === UserRole.SUPER_ADMIN) {
        throw new BadRequestException('Custom role must be an active, non-system role from Role Management');
      }
      data.role = customRole.systemRole ?? UserRole.CUSTOM;
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
    await this.findExisting(userId); // Ensure user exists

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
