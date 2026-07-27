import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMamcosDto, UpdateMamcosDto, AssignFarmerDto, CreateSecretaryDto } from './dto/mamcos.dto';

@Injectable()
export class MamcosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createMamcosDto: CreateMamcosDto) {
    const existing = await this.prisma.mamcos.findUnique({
      where: { name: createMamcosDto.name },
    });

    if (existing) {
      throw new ConflictException(`MAMCOS scheme with name ${createMamcosDto.name} already exists`);
    }

    return this.prisma.mamcos.create({
      data: createMamcosDto,
    });
  }

  async findAll() {
    return this.prisma.mamcos.findMany({
      include: {
        secretary: {
          select: { firstName: true, lastName: true, stabilityBonus: true },
        },
        _count: {
          select: { farmers: true, farms: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const mamcos = await this.prisma.mamcos.findUnique({
      where: { id },
      include: {
        secretary: {
          include: {
            user: { select: { phone: true, isActive: true } },
          },
        },
        farmers: {
          select: { id: true, controlNumber: true, firstName: true, lastName: true, creditScore: true },
        },
        farms: {
          select: { id: true, farmCode: true, socialHectares: true, grade: true, isVerified: true },
        },
      },
    });

    if (!mamcos) {
      throw new NotFoundException(`MAMCOS with ID ${id} not found`);
    }

    return mamcos;
  }

  async update(id: string, updateMamcosDto: UpdateMamcosDto) {
    await this.findOne(id); // Verify existence
    return this.prisma.mamcos.update({
      where: { id },
      data: updateMamcosDto,
    });
  }

  async assignFarmer(id: string, assignFarmerDto: AssignFarmerDto) {
    await this.findOne(id); // Verify MAMCOS exists

    const farmer = await this.prisma.farmer.findUnique({
      where: { id: assignFarmerDto.farmerId },
    });

    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${assignFarmerDto.farmerId} not found`);
    }

    return this.prisma.farmer.update({
      where: { id: assignFarmerDto.farmerId },
      data: { mamcosId: id },
      include: {
        mamcos: true,
      },
    });
  }

  async createSecretary(mamcosId: string, createSecretaryDto: CreateSecretaryDto) {
    await this.findOne(mamcosId); // Verify MAMCOS exists

    const existingSecretary = await this.prisma.mamcosSecretary.findUnique({
      where: { mamcosId },
    });

    if (existingSecretary) {
      throw new ConflictException(`MAMCOS scheme with ID ${mamcosId} already has a designated secretary`);
    }

    return this.prisma.mamcosSecretary.create({
      data: {
        mamcosId,
        userId: createSecretaryDto.userId,
        firstName: createSecretaryDto.firstName,
        lastName: createSecretaryDto.lastName,
      },
    });
  }

  async getSecretaryDashboard(secretaryUserId: string) {
    const secretary = await this.prisma.mamcosSecretary.findUnique({
      where: { userId: secretaryUserId },
      include: {
        mamcos: {
          include: {
            farmers: {
              select: { id: true, controlNumber: true, firstName: true, lastName: true, creditScore: true, isBlacklisted: true },
            },
            farms: {
              select: { id: true, farmCode: true, socialHectares: true, grade: true, isVerified: true, isLeased: true },
            },
          },
        },
      },
    });

    if (!secretary) {
      throw new NotFoundException(`MAMCOS Secretary profile for user ID ${secretaryUserId} not found`);
    }

    return secretary;
  }
}
