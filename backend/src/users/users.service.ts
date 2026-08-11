import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
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
        isActive: true,
        language: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        language: true,
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

  async update(id: string, updateUserDto: UpdateUserDto, requestUser?: RequestUser) {
    await this.findOne(id); // Ensure user exists
    const isSelf = requestUser?.id === id;
    const isStaff =
      requestUser?.role === UserRole.SUPER_ADMIN ||
      requestUser?.role === UserRole.ADMIN;
    if (!isSelf && !isStaff) {
      throw new ForbiddenException('You may only update your own account');
    }
    if (updateUserDto.role && requestUser?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin may change a user’s role');
    }
    if (updateUserDto.isActive !== undefined && !isStaff) {
      throw new ForbiddenException('Only staff may change account active status');
    }
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        language: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Ensure user exists
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
