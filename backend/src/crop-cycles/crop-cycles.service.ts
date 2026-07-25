import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCropCycleDto, UpdateCropCycleDto, CreateActivityLogDto } from './dto/crop-cycles.dto';

@Injectable()
export class CropCyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCropCycleDto: CreateCropCycleDto) {
    const { farmId, farmerId, season, riceVariety, plantingDate, expectedHarvest, estimatedYieldKg } = createCropCycleDto;

    // Verify farm and farmer exist
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }

    return this.prisma.cropCycle.create({
      data: {
        farmId,
        farmerId,
        season,
        riceVariety,
        plantingDate: plantingDate ? new Date(plantingDate) : null,
        expectedHarvest: expectedHarvest ? new Date(expectedHarvest) : null,
        estimatedYieldKg,
        status: 'PLANNED',
      },
      include: {
        farm: { select: { farmCode: true, socialHectares: true, isVerified: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.cropCycle.findMany({
      include: {
        farm: { select: { farmCode: true, socialHectares: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
        _count: { select: { activities: true, costs: true, revenues: true } },
      },
    });
  }

  async findOne(id: string) {
    const cropCycle = await this.prisma.cropCycle.findUnique({
      where: { id },
      include: {
        farm: true,
        farmer: true,
        activities: {
          orderBy: { activityDate: 'desc' },
          include: {
            fieldOfficer: { select: { employeeCode: true, firstName: true, lastName: true } },
          },
        },
        costs: { orderBy: { dateIncurred: 'desc' } },
        revenues: { orderBy: { saleDate: 'desc' } },
      },
    });

    if (!cropCycle) {
      throw new NotFoundException(`Crop Cycle with ID ${id} not found`);
    }

    return cropCycle;
  }

  async findByFarmId(farmId: string) {
    return this.prisma.cropCycle.findMany({
      where: { farmId },
      include: {
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
      },
    });
  }

  async findByFarmerId(farmerId: string) {
    return this.prisma.cropCycle.findMany({
      where: { farmerId },
      include: {
        farm: { select: { farmCode: true, socialHectares: true } },
      },
    });
  }

  async update(id: string, updateCropCycleDto: UpdateCropCycleDto) {
    await this.findOne(id); // Verify existence

    const { riceVariety, plantingDate, expectedHarvest, harvestDate, estimatedYieldKg, actualYieldKg, status } = updateCropCycleDto;

    return this.prisma.cropCycle.update({
      where: { id },
      data: {
        riceVariety,
        plantingDate: plantingDate ? new Date(plantingDate) : undefined,
        expectedHarvest: expectedHarvest ? new Date(expectedHarvest) : undefined,
        harvestDate: harvestDate ? new Date(harvestDate) : undefined,
        estimatedYieldKg,
        actualYieldKg,
        status,
      },
      include: {
        farm: { select: { farmCode: true } },
      },
    });
  }

  async logActivity(userId: string, createActivityLogDto: CreateActivityLogDto) {
    const { cropCycleId, activityType, activityDate, description, inputsUsed, laborWorkers, laborHours, photoUrls, gpsLatitude, gpsLongitude } = createActivityLogDto;

    await this.findOne(cropCycleId); // Verify crop cycle exists

    // Check if the user logging this is a Field Officer
    const fieldOfficer = await this.prisma.fieldOfficer.findUnique({
      where: { userId },
    });

    return this.prisma.activityLog.create({
      data: {
        cropCycleId,
        fieldOfficerId: fieldOfficer ? fieldOfficer.id : null,
        activityType,
        activityDate: new Date(activityDate),
        description,
        inputsUsed: inputsUsed ? (inputsUsed as any) : null,
        laborWorkers,
        laborHours,
        photoUrls: photoUrls || [],
        gpsLatitude,
        gpsLongitude,
      },
      include: {
        fieldOfficer: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    });
  }
}
