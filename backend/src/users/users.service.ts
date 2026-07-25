import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        phone: true,
        email: true,
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
        role: true,
        isActive: true,
        language: true,
        lastLoginAt: true,
        createdAt: true,
        farmer: true,
        fieldOfficer: true,
        mamcosSecretary: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id); // Ensure user exists
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        phone: true,
        email: true,
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
    return { success: true, message: `User with ID ${id} deleted successfully` };
  }

  async updatePushToken(userId: string, pushToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { pushToken },
      select: { id: true, pushToken: true },
    });
  }
}
