import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MamcosStaffRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { ActivitiesService } from '../activities/activities.service';
import { RiceProtocolsService } from '../rice-protocols/rice-protocols.service';
import {
  CreateCropCycleDto,
  UpdateCropCycleDto,
  CreateActivityLogDto,
  UpdateActivityLogDto,
} from './dto/crop-cycles.dto';

const ACTIVITY_ICONS: Record<string, string> = {
  LAND_PREPARATION: '🚜',
  PLANTING: '🌱',
  FERTILIZING: '🧪',
  WEEDING: '🌿',
  PEST_CONTROL: '🐛',
  IRRIGATION: '💧',
  HARVESTING: '🌾',
  DRYING: '☀️',
  STORAGE: '📦',
  TRANSPORT: '🚚',
};

@Injectable()
export class CropCyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly activities: ActivitiesService,
    private readonly riceProtocols: RiceProtocolsService,
  ) {}

  /**
   * Start a crop cycle for a farm. `farmerId` is always derived from the farm
   * server-side for farmer-role requests, so a farmer cannot start a cycle
   * under someone else's name by tampering with the request body.
   */
  async create(dto: CreateCropCycleDto, user: RequestUser) {
    if (
      dto.plantingDate &&
      dto.expectedHarvest &&
      new Date(dto.expectedHarvest) < new Date(dto.plantingDate)
    ) {
      throw new BadRequestException(
        'Expected harvest date cannot be earlier than planting date',
      );
    }
    await this.ownership.assertFarmAccess(user, dto.farmId);

    const farm = await this.prisma.farm.findUnique({
      where: { id: dto.farmId },
    });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${dto.farmId} not found`);
    }
    const requester = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    const farmerId = dto.farmerId
      ? await this.assertKnownFarmer(dto.farmerId)
      : requester?.id;
    if (!farmerId)
      throw new NotFoundException(
        'A renter farmer profile is required to start a crop cycle',
      );

    const cropCycle = await this.prisma.cropCycle.create({
      data: {
        farmId: dto.farmId,
        farmerId,
        season: dto.season,
        riceVariety: dto.riceVariety,
        plantingDate: dto.plantingDate ? new Date(dto.plantingDate) : null,
        expectedHarvest: dto.expectedHarvest
          ? new Date(dto.expectedHarvest)
          : null,
        estimatedYieldKg: dto.estimatedYieldKg,
        status: 'PLANNED',
      },
      include: {
        farm: {
          select: { farmCode: true, socialHectares: true, isVerified: true },
        },
        farmer: {
          select: { controlNumber: true, firstName: true, lastName: true },
        },
      },
    });

    await this.activities.log(
      farmerId,
      'crop_cycle.started',
      `Started crop cycle: ${cropCycle.season}`,
      `${farm.farmCode}${dto.riceVariety ? ` · ${dto.riceVariety}` : ''}`,
      '🌾',
    );
    await this.riceProtocols.scheduleForCycle(cropCycle.id, farm.mamcosId);
    return cropCycle;
  }

  private async assertKnownFarmer(farmerId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    return farmer.id;
  }

  async findAll() {
    return this.prisma.cropCycle.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        farm: { select: { id: true, farmCode: true, socialHectares: true } },
        farmer: {
          select: { id: true, controlNumber: true, firstName: true, lastName: true },
        },
        _count: { select: { activities: true, costs: true, revenues: true } },
      },
    });
  }

  /** Platform-wide activity log list for admin reporting (field officer "crop records updated" ranking). */
  findAllActivityLogs() {
    return this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        fieldOfficer: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        cropCycle: { select: { season: true, riceVariety: true, farm: { select: { farmCode: true } } } },
      },
    });
  }

  async findActivityLogById(id: string) {
    const activity = await this.prisma.activityLog.findUnique({
      where: { id },
      include: {
        fieldOfficer: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        cropCycle: { select: { season: true, riceVariety: true, farm: { select: { farmCode: true } } } },
      },
    });
    if (!activity) throw new NotFoundException(`Activity log with ID ${id} not found`);
    return activity;
  }

  async updateActivityLog(id: string, dto: UpdateActivityLogDto) {
    await this.findActivityLogById(id);
    return this.prisma.activityLog.update({
      where: { id },
      data: {
        ...dto,
        activityDate: dto.activityDate ? new Date(dto.activityDate) : undefined,
        inputsUsed: dto.inputsUsed ?? undefined,
      },
      include: {
        fieldOfficer: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });
  }

  async deleteActivityLog(id: string) {
    await this.findActivityLogById(id);
    await this.prisma.activityLog.delete({ where: { id } });
    return { deleted: true };
  }

  async findOne(id: string, user?: RequestUser) {
    const cropCycle = await this.prisma.cropCycle.findUnique({
      where: { id },
      include: {
        farm: true,
        farmer: true,
        activities: {
          orderBy: { activityDate: 'desc' },
          include: {
            fieldOfficer: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
        },
        costs: { orderBy: { dateIncurred: 'desc' } },
        revenues: { orderBy: { saleDate: 'desc' } },
        calendarTasks: { orderBy: { dueDate: 'asc' } },
        harvestQuality: true,
      },
    });

    if (!cropCycle) {
      throw new NotFoundException(`Crop Cycle with ID ${id} not found`);
    }
    if (user) await this.ownership.assertFarmAccess(user, cropCycle.farmId);
    return cropCycle;
  }

  async findByFarmId(farmId: string, user: RequestUser) {
    await this.ownership.assertFarmAccess(user, farmId);
    return this.prisma.cropCycle.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      include: {
        farmer: {
          select: { controlNumber: true, firstName: true, lastName: true },
        },
        _count: { select: { activities: true, costs: true, revenues: true } },
      },
    });
  }

  async findByFarmerId(farmerId: string, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.prisma.cropCycle.findMany({
      where: { farmerId },
      orderBy: { createdAt: 'desc' },
      include: {
        farm: { select: { farmCode: true, socialHectares: true } },
      },
    });
  }

  /**
   * Combined calendar for a farmer: their own logged activities plus
   * upcoming/past planting & harvest dates, merged across every farm.
   */
  async calendarForSelf(userId: string, fromStr?: string, toStr?: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!farmer) throw new NotFoundException('Farmer profile not found');

    const now = new Date();
    const from = fromStr
      ? new Date(fromStr)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toStr
      ? new Date(toStr)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [cycles, activityLogs] = await Promise.all([
      this.prisma.cropCycle.findMany({
        where: {
          farmerId: farmer.id,
          OR: [
            { plantingDate: { gte: from, lte: to } },
            { expectedHarvest: { gte: from, lte: to } },
            { harvestDate: { gte: from, lte: to } },
          ],
        },
        include: { farm: { select: { id: true, farmCode: true, name: true } } },
      }),
      this.prisma.activityLog.findMany({
        where: {
          cropCycle: { farmerId: farmer.id },
          activityDate: { gte: from, lte: to },
        },
        include: {
          cropCycle: {
            select: {
              id: true,
              farm: { select: { id: true, farmCode: true, name: true } },
            },
          },
        },
      }),
    ]);

    const entries = [
      ...activityLogs.map((a) => ({
        type: 'ACTIVITY' as const,
        date: a.activityDate,
        id: a.id,
        activityType: a.activityType,
        cropCycleId: a.cropCycleId,
        farm: a.cropCycle.farm,
      })),
      ...cycles
        .filter(
          (c) =>
            c.plantingDate && c.plantingDate >= from && c.plantingDate <= to,
        )
        .map((c) => ({
          type: 'PLANTING' as const,
          date: c.plantingDate as Date,
          id: c.id,
          cropCycleId: c.id,
          farm: c.farm,
        })),
      ...cycles
        .filter(
          (c) =>
            c.expectedHarvest &&
            c.expectedHarvest >= from &&
            c.expectedHarvest <= to,
        )
        .map((c) => ({
          type: 'HARVEST' as const,
          date: c.expectedHarvest as Date,
          id: c.id,
          cropCycleId: c.id,
          farm: c.farm,
        })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return entries;
  }

  async update(id: string, dto: UpdateCropCycleDto, user: RequestUser) {
    const existing = await this.findOne(id, user); // also verifies existence + ownership
    const plantingDate = dto.plantingDate
      ? new Date(dto.plantingDate)
      : existing.plantingDate;
    const harvestDate = dto.harvestDate
      ? new Date(dto.harvestDate)
      : existing.harvestDate;
    if (plantingDate && harvestDate && harvestDate < plantingDate) {
      throw new BadRequestException(
        'Harvest date cannot be earlier than planting date',
      );
    }

    const cropCycle = await this.prisma.cropCycle.update({
      where: { id },
      data: {
        riceVariety: dto.riceVariety,
        plantingDate: dto.plantingDate ? new Date(dto.plantingDate) : undefined,
        expectedHarvest: dto.expectedHarvest
          ? new Date(dto.expectedHarvest)
          : undefined,
        harvestDate: dto.harvestDate ? new Date(dto.harvestDate) : undefined,
        estimatedYieldKg: dto.estimatedYieldKg,
        actualYieldKg: dto.actualYieldKg,
        status: dto.status,
      },
      include: {
        farm: { select: { farmCode: true, mamcosId: true } },
      },
    });

    if (dto.plantingDate || dto.expectedHarvest) {
      await this.riceProtocols.scheduleForCycle(cropCycle.id, cropCycle.farm?.mamcosId);
    }

    if (dto.status && dto.status !== existing.status) {
      await this.activities.log(
        existing.farmerId,
        'crop_cycle.status',
        `${cropCycle.season} is now ${dto.status.toLowerCase()}`,
        cropCycle.farm?.farmCode,
        dto.status === 'HARVESTED' ? '🌾' : '🔄',
      );
    }
    return cropCycle;
  }

  /**
   * Log a farming activity (owner comment: "record farm activities" — a free
   * feature). The requesting farmer must own the crop cycle's farm; staff may
   * log on behalf of any farmer (e.g. a field officer's field visit).
   */
  async logActivity(user: RequestUser, dto: CreateActivityLogDto) {
    const cropCycle = await this.findOne(dto.cropCycleId, user); // verifies existence + ownership

    const fieldOfficer = await this.prisma.mamcosStaff.findFirst({
      where: { userId: user.id, role: MamcosStaffRole.FIELD_OFFICER },
    });

    const activity = await this.prisma.activityLog.create({
      data: {
        cropCycleId: dto.cropCycleId,
        fieldOfficerId: fieldOfficer ? fieldOfficer.id : null,
        activityType: dto.activityType,
        activityDate: new Date(dto.activityDate),
        description: dto.description,
        inputsUsed: dto.inputsUsed ?? Prisma.JsonNull,
        laborWorkers: dto.laborWorkers,
        laborHours: dto.laborHours,
        familyLaborCount: dto.familyLaborCount,
        hiredLaborCount: dto.hiredLaborCount,
        laborWageTotal: dto.laborWageTotal,
        photoUrls: dto.photoUrls || [],
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
      },
      include: {
        fieldOfficer: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });

    const label = dto.activityType.replace(/_/g, ' ').toLowerCase();
    await this.activities.log(
      cropCycle.farmerId,
      'crop_cycle.activity',
      `Logged ${label}`,
      `${cropCycle.farm.farmCode} · ${cropCycle.season}`,
      ACTIVITY_ICONS[dto.activityType] ?? '📝',
    );
    return activity;
  }
}
