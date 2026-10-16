import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MamcosStaffRole, Prisma, UserRole } from '@prisma/client';
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
import { applyGrowthStage } from './growth-stages';

const ACTIVITY_ICONS: Record<string, string> = {
  LAND_PREPARATION: '🚜',
  SEED_SELECTION: '🌾',
  NURSERY_ESTABLISHMENT: '🪴',
  FIELD_INSPECTION: '🔍',
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
   * The variety a farmer picked: by id from the admin's list, or - for older app versions that
   * still send text - by matching the typed name to the list. Unknown text is kept as typed.
   */
  private async resolveVariety(riceVarietyId?: string, riceVariety?: string) {
    if (riceVarietyId) {
      const variety = await this.prisma.riceVariety.findUnique({
        where: { id: riceVarietyId },
      });
      if (!variety || !variety.isActive)
        throw new BadRequestException('That rice variety is not available');
      return { riceVarietyId: variety.id, riceVariety: variety.name };
    }
    const typed = riceVariety?.trim();
    if (!typed) return {};
    const match = await this.prisma.riceVariety.findFirst({
      where: { name: { equals: typed, mode: 'insensitive' }, isActive: true },
    });
    return match
      ? { riceVarietyId: match.id, riceVariety: match.name }
      : { riceVariety: typed };
  }


  /** Season name for a cycle: the one typed, else the linked farming season's name. */
  private async resolveSeason(season?: string, farmingSeasonId?: string) {
    let linkedName: string | undefined;
    if (farmingSeasonId) {
      const linked = await this.prisma.farmingSeason.findUnique({
        where: { id: farmingSeasonId },
        select: { name: true },
      });
      if (!linked) throw new BadRequestException('That farming season does not exist');
      linkedName = linked.name;
    }
    const name = season?.trim() || linkedName;
    if (!name)
      throw new BadRequestException('Enter a season name or choose a farming season');
    return name;
  }

  private assertAreaFitsFarm(areaPlantedHa: number | undefined, farmHectares: number) {
    if (areaPlantedHa != null && areaPlantedHa > farmHectares + 1e-6) {
      throw new BadRequestException(
        `Area planted (${areaPlantedHa} ha) cannot be larger than the farm (${farmHectares} ha)`,
      );
    }
  }

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
    const farmerId =
      user.role === UserRole.FARMER
        ? requester?.id
        : dto.farmerId
          ? await this.assertKnownFarmer(dto.farmerId)
          : farm.farmerId;
    if (!farmerId)
      throw new NotFoundException(
        'A renter farmer profile is required to start a crop cycle',
      );

    const variety = await this.resolveVariety(
      dto.riceVarietyId,
      dto.riceVariety,
    );
    const season = await this.resolveSeason(dto.season, dto.farmingSeasonId);
    this.assertAreaFitsFarm(dto.areaPlantedHa, farm.socialHectares);
    const cropCycle = await this.prisma.cropCycle.create({
      data: {
        farmId: dto.farmId,
        farmerId,
        season,
        farmingSeasonId: dto.farmingSeasonId,
        areaPlantedHa: dto.areaPlantedHa,
        seedQuantityKg: dto.seedQuantityKg,
        productionMethod: dto.productionMethod,
        irrigationType: dto.irrigationType,
        ...variety,
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
      `${farm.farmCode}${variety.riceVariety ? ` · ${variety.riceVariety}` : ''}`,
      '🌾',
      {
        season: cropCycle.season,
        farmCode: farm.farmCode,
        variety: variety.riceVariety ?? null,
      },
    );
    await this.riceProtocols.scheduleForCycle(cropCycle.id);
    if (dto.growthStage) {
      await applyGrowthStage(this.prisma, cropCycle.id, dto.growthStage, {
        source: 'ADMIN',
        userId: user.id,
      });
      return this.prisma.cropCycle.findUniqueOrThrow({
        where: { id: cropCycle.id },
        include: {
          farm: {
            select: { farmCode: true, socialHectares: true, isVerified: true },
          },
          farmer: {
            select: { controlNumber: true, firstName: true, lastName: true },
          },
        },
      });
    }
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

  async findAll(user?: RequestUser) {
    // Cooperative staff only see their own AMCOS's crops; platform admins see everything.
    const tenantId = user ? this.ownership.resolveTenantMamcosId(user) : null;
    return this.prisma.cropCycle.findMany({
      where: tenantId ? { farm: { mamcosId: tenantId } } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        farm: {
          select: {
            id: true,
            farmCode: true,
            socialHectares: true,
            hasIrrigation: true,
            region: true,
            district: true,
          },
        },
        farmer: {
          select: {
            id: true,
            controlNumber: true,
            firstName: true,
            lastName: true,
          },
        },
        farmingSeason: { select: { id: true, name: true } },
        _count: { select: { activities: true, costs: true, revenues: true } },
      },
    });
  }

  private readonly activityInclude = {
    fieldOfficer: {
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    },
    plot: { select: { id: true, plotCode: true, name: true } },
    cropCycle: {
      select: {
        id: true,
        season: true,
        riceVariety: true,
        farmId: true,
        farm: {
          select: { id: true, farmCode: true, region: true, district: true },
        },
        farmer: {
          select: {
            id: true,
            controlNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    },
  } satisfies Prisma.ActivityLogInclude;

  /** Activity records for the admin; cooperative staff only see their own AMCOS's farms. */
  findAllActivityLogs(
    user?: RequestUser,
    filters: { cropCycleId?: string; farmId?: string } = {},
  ) {
    const tenantId = user ? this.ownership.resolveTenantMamcosId(user) : null;
    return this.prisma.activityLog.findMany({
      where: {
        cropCycleId: filters.cropCycleId,
        cropCycle: {
          farmId: filters.farmId,
          ...(tenantId ? { farm: { mamcosId: tenantId } } : {}),
        },
      },
      orderBy: { activityDate: 'desc' },
      include: this.activityInclude,
    });
  }

  async findActivityLogById(id: string, user?: RequestUser) {
    const activity = await this.prisma.activityLog.findUnique({
      where: { id },
      include: this.activityInclude,
    });
    if (!activity)
      throw new NotFoundException(`Activity log with ID ${id} not found`);
    if (user)
      await this.ownership.assertFarmAccess(user, activity.cropCycle.farmId);
    return activity;
  }

  async updateActivityLog(
    id: string,
    dto: UpdateActivityLogDto,
    user?: RequestUser,
  ) {
    const existing = await this.findActivityLogById(id, user);
    await this.validateActivity(
      existing.cropCycleId,
      { ...existing, ...dto },
      id,
    );
    await this.assertPlotOnFarm(dto.plotId, existing.cropCycle.farmId);
    await this.assertKnownOfficer(dto.fieldOfficerId);
    return this.prisma.activityLog.update({
      where: { id },
      data: {
        ...dto,
        activityDate: dto.activityDate ? new Date(dto.activityDate) : undefined,
        inputsUsed: dto.inputsUsed ?? undefined,
      },
      include: this.activityInclude,
    });
  }

  async deleteActivityLog(id: string, user?: RequestUser) {
    await this.findActivityLogById(id, user);
    await this.prisma.activityLog.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertPlotOnFarm(plotId: string | undefined, farmId: string) {
    if (!plotId) return;
    const plot = await this.prisma.plot.findUnique({
      where: { id: plotId },
      select: { farmId: true },
    });
    if (!plot || plot.farmId !== farmId)
      throw new BadRequestException('That plot does not belong to this farm');
  }

  private async assertKnownOfficer(fieldOfficerId: string | undefined) {
    if (!fieldOfficerId) return;
    const officer = await this.prisma.mamcosStaff.findUnique({
      where: { id: fieldOfficerId },
      select: { id: true },
    });
    if (!officer) throw new NotFoundException('Field officer not found');
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
            plot: { select: { id: true, plotCode: true, name: true } },
          },
        },
        costs: { orderBy: { dateIncurred: 'desc' } },
        revenues: { orderBy: { saleDate: 'desc' } },
        calendarTasks: { orderBy: { dueDate: 'asc' } },
        harvestQuality: true,
        farmingSeason: { select: { id: true, name: true, status: true } },
        stageChanges: { orderBy: { changedAt: 'asc' } },
        officerVisits: {
          orderBy: { visitedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            visitedAt: true,
            growthStage: true,
            cropCondition: true,
            waterStatus: true,
            pestStatus: true,
            diseaseStatus: true,
            observations: true,
            recommendations: true,
            fieldOfficer: { select: { firstName: true, lastName: true } },
          },
        },
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
        costs: { orderBy: { dateIncurred: 'desc' } },
        revenues: { orderBy: { saleDate: 'desc' } },
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
        costs: { orderBy: { dateIncurred: 'desc' } },
        revenues: { orderBy: { saleDate: 'desc' } },
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

    const [cycles, activityLogs, riceTasks] = await Promise.all([
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
      this.prisma.riceCalendarTask.findMany({
        where: {
          cropCycle: { farmerId: farmer.id },
          dueDate: { gte: from, lte: to },
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
      ...riceTasks.map((task) => ({
        type: 'RICE_TASK' as const,
        date: task.dueDate,
        id: task.id,
        title: task.title,
        status: task.status,
        cropCycleId: task.cropCycleId,
        farm: task.cropCycle.farm,
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

    const expectedHarvest = dto.expectedHarvest
      ? new Date(dto.expectedHarvest)
      : existing.expectedHarvest;
    if (plantingDate && expectedHarvest && expectedHarvest < plantingDate) {
      throw new BadRequestException(
        'Expected harvest date cannot be earlier than planting date',
      );
    }
    const day = (d: Date) => d.toISOString().slice(0, 10);
    if (
      existing.activities.some(
        (a) =>
          (a.activityType === 'HARVESTING' &&
            plantingDate &&
            day(a.activityDate) < day(plantingDate)) ||
          (a.activityType === 'PLANTING' &&
            harvestDate &&
            day(a.activityDate) > day(harvestDate)),
      )
    ) {
      throw new BadRequestException(
        'Cycle dates conflict with recorded planting or harvest activities',
      );
    }
    const variety =
      dto.riceVarietyId || dto.riceVariety
        ? await this.resolveVariety(dto.riceVarietyId, dto.riceVariety)
        : {};
    const varietyChanged =
      !!variety.riceVarietyId &&
      variety.riceVarietyId !== existing.riceVarietyId;
    if (varietyChanged && user.role === UserRole.FARMER) {
      // Once required work has been recorded under one variety, a farmer cannot switch the history to another.
      const done = await this.prisma.riceCalendarTask.count({
        where: { cropCycleId: id, status: 'COMPLETED' },
      });
      if (done > 0)
        throw new BadRequestException(
          'The rice variety cannot be changed after activities have been recorded. Ask your field officer.',
        );
    }
    this.assertAreaFitsFarm(dto.areaPlantedHa, existing.farm.socialHectares);
    const season =
      dto.season !== undefined || dto.farmingSeasonId
        ? await this.resolveSeason(
            dto.season || undefined,
            dto.farmingSeasonId ?? undefined,
          )
        : undefined;
    const cropCycle = await this.prisma.cropCycle.update({
      where: { id },
      data: {
        ...variety,
        season,
        farmingSeasonId: dto.farmingSeasonId,
        areaPlantedHa: dto.areaPlantedHa,
        seedQuantityKg: dto.seedQuantityKg,
        productionMethod: dto.productionMethod,
        irrigationType: dto.irrigationType,
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

    if (dto.growthStage && dto.growthStage !== existing.growthStage) {
      await applyGrowthStage(this.prisma, id, dto.growthStage, {
        source: 'ADMIN',
        userId: user.id,
        note: dto.stageNote,
      });
    }

    if (dto.plantingDate || dto.expectedHarvest || varietyChanged) {
      await this.riceProtocols.scheduleForCycle(cropCycle.id, {
        varietyChanged,
      });
    }

    if (dto.status && dto.status !== existing.status) {
      await this.activities.log(
        existing.farmerId,
        'crop_cycle.status',
        `${cropCycle.season} is now ${dto.status.toLowerCase()}`,
        cropCycle.farm?.farmCode,
        dto.status === 'HARVESTED' ? '🌾' : '🔄',
        {
          season: cropCycle.season,
          status: dto.status,
          farmCode: cropCycle.farm?.farmCode ?? null,
        },
      );
    }
    return this.prisma.cropCycle.findUniqueOrThrow({
      where: { id },
      include: { farm: { select: { farmCode: true, mamcosId: true } } },
    });
  }

  /**
   * Log a farming activity (owner comment: "record farm activities" — a free
   * feature). The requesting farmer must own the crop cycle's farm; staff may
   * log on behalf of any farmer (e.g. a field officer's field visit).
   */
  private async validateActivity(
    cropCycleId: string,
    dto: {
      activityType: string;
      activityDate: string | Date;
      inputsUsed?: unknown;
    },
    excludeId?: string,
  ) {
    const cycle = await this.prisma.cropCycle.findUniqueOrThrow({
      where: { id: cropCycleId },
      include: { activities: true },
    });
    const day = (value: string | Date) =>
      new Date(value).toISOString().slice(0, 10);
    const activities = cycle.activities.filter((a) => a.id !== excludeId);
    const plantingDates = [
      cycle.plantingDate,
      ...activities
        .filter((a) => a.activityType === 'PLANTING')
        .map((a) => a.activityDate),
    ].filter((d): d is Date => !!d);
    const harvestDates = [
      cycle.harvestDate,
      ...activities
        .filter((a) => a.activityType === 'HARVESTING')
        .map((a) => a.activityDate),
    ].filter((d): d is Date => !!d);
    if (
      (dto.activityType === 'HARVESTING' &&
        plantingDates.some((d) => day(dto.activityDate) < day(d))) ||
      (dto.activityType === 'PLANTING' &&
        harvestDates.some((d) => day(dto.activityDate) > day(d)))
    ) {
      throw new BadRequestException(
        'Harvest date cannot be earlier than planting date',
      );
    }
    const items = (dto.inputsUsed as { items?: unknown } | null)?.items;
    if (
      items !== undefined &&
      (!Array.isArray(items) ||
        items.some(
          (item) =>
            !item ||
            typeof item.name !== 'string' ||
            !item.name.trim() ||
            typeof item.unit !== 'string' ||
            !item.unit.trim() ||
            typeof item.quantity !== 'number' ||
            !Number.isFinite(item.quantity) ||
            item.quantity <= 0,
        ))
    ) {
      throw new BadRequestException(
        'Each input requires a name, positive quantity and unit',
      );
    }
  }

  async logActivity(user: RequestUser, dto: CreateActivityLogDto) {
    const cropCycle = await this.findOne(dto.cropCycleId, user); // verifies existence + ownership

    await this.validateActivity(dto.cropCycleId, dto);
    await this.assertPlotOnFarm(dto.plotId, cropCycle.farmId);
    await this.assertKnownOfficer(dto.fieldOfficerId);

    const fieldOfficer = dto.fieldOfficerId
      ? { id: dto.fieldOfficerId }
      : await this.prisma.mamcosStaff.findFirst({
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
        plotId: dto.plotId,
        inputName: dto.inputName,
        inputQuantity: dto.inputQuantity,
        inputUnit: dto.inputUnit,
        cost: dto.cost,
        remarks: dto.remarks,
      },
      include: this.activityInclude,
    });

    const label = dto.activityType.replace(/_/g, ' ').toLowerCase();
    await this.activities.log(
      cropCycle.farmerId,
      'crop_cycle.activity',
      `Logged ${label}`,
      `${cropCycle.farm.farmCode} · ${cropCycle.season}`,
      ACTIVITY_ICONS[dto.activityType] ?? '📝',
      {
        activityType: dto.activityType,
        farmCode: cropCycle.farm.farmCode,
        season: cropCycle.season,
      },
    );
    return activity;
  }
}
