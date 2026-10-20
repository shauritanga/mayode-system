import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  CalendarTaskStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { isBackdated, lateByDays, taskView } from './task-state';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteRiceCalendarTaskDto,
  RescheduleRiceCalendarTaskDto,
  UpdateRiceProtocolDto,
} from './dto/rice-protocol.dto';

type MeasurementRule = {
  label: string;
  unit?: string;
  min?: number;
  max?: number;
};
type ProtocolTask = {
  key: string;
  title: string;
  guidance: string;
  daysFromPlanting?: number;
  daysFromHarvest?: number;
  activityType?: ActivityType;
  requiredMeasurements?: Record<string, MeasurementRule>;
  evidenceRequired?: boolean;
};

/** Tasks the harvest quality check and warehouse intake depend on. */
const REQUIRED_TASK_KEYS = ['harvest', 'drying', 'bagging'];

const DAY_MS = 86_400_000;

export const MBALARI_TASKS: ProtocolTask[] = [
  {
    key: 'market_plan',
    title: 'Season and market plan',
    guidance:
      'Plan production around market prices and the extension officer\u2019s advice.',
    daysFromPlanting: -120,
  },
  {
    key: 'certified_seed',
    title: 'Certified seed',
    guidance: 'Buy good-quality certified seed from a trusted source.',
    daysFromPlanting: -90,
  },
  {
    key: 'land_preparation',
    title: 'Prepare the field',
    guidance:
      'Clear and level the field; dig channels to bring water in and drain it out.',
    daysFromPlanting: -45,
    activityType: ActivityType.LAND_PREPARATION,
    evidenceRequired: true,
  },
  {
    key: 'nursery',
    title: 'Prepare the nursery',
    guidance:
      'Build nursery beds 120\u2013160 cm wide, 30\u201350 cm wide at the top, and 40\u201350 cm deep.',
    daysFromPlanting: -30,
    requiredMeasurements: {
      nurseryWidthCm: {
        label: 'Nursery bed width',
        unit: 'cm',
        min: 120,
        max: 160,
      },
      nurseryTopWidthCm: {
        label: 'Bed top width',
        unit: 'cm',
        min: 30,
        max: 50,
      },
      nurseryDepthCm: {
        label: 'Nursery bed depth',
        unit: 'cm',
        min: 40,
        max: 50,
      },
    },
    evidenceRequired: true,
  },
  {
    key: 'transplanting',
    title: 'Transplant seedlings',
    guidance:
      'Transplant seedlings aged 14\u201321 days at 20 cm spacing, 1\u20133 seedlings per hill.',
    daysFromPlanting: 0,
    activityType: ActivityType.PLANTING,
    requiredMeasurements: {
      seedlingAgeDays: {
        label: 'Seedling age',
        unit: 'days',
        min: 14,
        max: 21,
      },
      spacingCm: { label: 'Spacing', unit: 'cm', min: 20, max: 20 },
      seedlingsPerHill: { label: 'Seedlings per hill', min: 1, max: 3 },
      waterDepthCm: { label: 'Water depth', unit: 'cm', min: 0, max: 3 },
    },
    evidenceRequired: true,
  },
  {
    key: 'basal_fertilizer',
    title: 'Basal fertilizer',
    guidance:
      'Apply basal fertilizer within 5 days of transplanting, at the recommended rate.',
    daysFromPlanting: 5,
    activityType: ActivityType.FERTILIZING,
    requiredMeasurements: {
      quantityKg: {
        label: 'Basal fertilizer quantity',
        unit: 'kg',
        min: 0.01,
      },
    },
    evidenceRequired: true,
  },
  {
    key: 'gap_filling',
    title: 'Replace dead seedlings',
    guidance:
      'Replant gaps where seedlings died, within 10 days of transplanting.',
    daysFromPlanting: 10,
    activityType: ActivityType.PLANTING,
  },
  {
    key: 'fertilizer_1',
    title: 'Top-dressing fertilizer',
    guidance:
      'Weed first and keep water no deeper than 5 cm, then apply top-dressing fertilizer 14 days after transplanting, as the extension officer advises.',
    daysFromPlanting: 14,
    activityType: ActivityType.FERTILIZING,
    requiredMeasurements: {
      quantityKg: { label: 'Fertilizer quantity', unit: 'kg', min: 0.01 },
      waterDepthCm: {
        label: 'Water depth before fertilizing',
        unit: 'cm',
        min: 0,
        max: 5,
      },
      weedCoveragePct: {
        label: 'Weed cover before fertilizing',
        unit: '%',
        min: 0,
        max: 5,
      },
    },
    evidenceRequired: true,
  },
  {
    key: 'weed_water',
    title: 'Control weeds and water',
    guidance: 'Remove weeds and keep the water no deeper than 15 cm.',
    daysFromPlanting: 45,
    activityType: ActivityType.WEEDING,
    requiredMeasurements: {
      waterDepthCm: { label: 'Water depth', unit: 'cm', min: 0, max: 15 },
    },
    evidenceRequired: true,
  },
  {
    key: 'pest_disease_scouting',
    title: 'Scout for pests and diseases',
    guidance:
      'Inspect the field for pests and diseases; if you use pesticide, follow the label rate or the extension officer\u2019s advice.',
    daysFromPlanting: 60,
    activityType: ActivityType.PEST_CONTROL,
    requiredMeasurements: {
      scoutedAreaPct: {
        label: 'Share of the field inspected',
        unit: '%',
        min: 100,
        max: 100,
      },
    },
    evidenceRequired: true,
  },
  {
    key: 'pesticide_container_disposal_1',
    title: 'Remove pesticide containers',
    guidance:
      'Never leave pesticide containers in the field; collect them and store or dispose of them safely after use.',
    daysFromPlanting: 61,
    activityType: ActivityType.PEST_CONTROL,
    evidenceRequired: true,
  },
  {
    key: 'fertilizer_2',
    title: 'Grain-filling fertilizer',
    guidance:
      'Apply the grain-filling fertilizer at the right rate and keep watching for pests.',
    daysFromPlanting: 90,
    activityType: ActivityType.FERTILIZING,
    requiredMeasurements: {
      quantityKg: { label: 'Fertilizer quantity', unit: 'kg', min: 0.01 },
    },
    evidenceRequired: true,
  },
  {
    key: 'pesticide_container_disposal_2',
    title: 'Re-check for pesticide containers',
    guidance:
      'Make sure no pesticide containers have been left in the field during the March follow-up.',
    daysFromPlanting: 91,
    activityType: ActivityType.PEST_CONTROL,
    evidenceRequired: true,
  },
  {
    key: 'pesticide_container_disposal_3',
    title: 'Final check for pesticide containers',
    guidance:
      'April\u2013May: make sure all pesticide containers have been removed from the field before harvest preparation.',
    daysFromHarvest: -45,
    activityType: ActivityType.PEST_CONTROL,
    evidenceRequired: true,
  },
  {
    key: 'bird_pest_control',
    title: 'Control birds and animals',
    guidance: 'Use safe ways to keep off birds, destructive animals and rats.',
    daysFromHarvest: -30,
    activityType: ActivityType.PEST_CONTROL,
    evidenceRequired: true,
  },
  {
    key: 'harvest_preparation',
    title: 'Prepare for harvest',
    guidance:
      'Get sacks, storage, harvesting and threshing machines, and transport ready.',
    daysFromHarvest: -21,
  },
  {
    key: 'harvest',
    title: 'Harvest the rice',
    guidance:
      'Harvest when 80\u201385% of the panicle has matured or grain moisture is 20\u201325%.',
    daysFromHarvest: 0,
    activityType: ActivityType.HARVESTING,
    requiredMeasurements: {
      maturityPct: { label: 'Panicle maturity', unit: '%', min: 80, max: 85 },
      panicleMoisturePct: {
        label: 'Grain moisture',
        unit: '%',
        min: 20,
        max: 25,
      },
    },
    evidenceRequired: true,
  },
  {
    key: 'drying',
    title: 'Dry the rice',
    guidance: 'Dry the paddy until grain moisture reaches 14% or lower.',
    daysFromHarvest: 2,
    activityType: ActivityType.DRYING,
    requiredMeasurements: {
      dryingMoisturePct: {
        label: 'Moisture after drying',
        unit: '%',
        min: 0,
        max: 14,
      },
    },
    evidenceRequired: true,
  },
  {
    key: 'bagging',
    title: 'Bag and separate varieties',
    guidance:
      'Separate the rice varieties and pack them in clean, labelled sacks.',
    daysFromHarvest: 7,
    activityType: ActivityType.STORAGE,
    requiredMeasurements: {
      bagCount: { label: 'Number of bags', min: 1 },
      bagWeightKg: { label: 'Bag weight', unit: 'kg', min: 1 },
    },
    evidenceRequired: true,
  },
  {
    key: 'warehouse_receipt',
    title: 'Deliver to the cooperative warehouse',
    guidance:
      'Take the inspected rice to the cooperative warehouse for storage and joint selling.',
    daysFromHarvest: 10,
    activityType: ActivityType.TRANSPORT,
  },
];

// Maps each Mbalari taskKey to one of the docx's exact 10 named growth stages (Land Preparation
// -> Nursery Preparation -> Transplanting/Direct Seeding -> Vegetative Growth -> Tillering ->
// Flowering -> Grain Filling -> Maturity -> Harvesting -> Post-Harvest), in day-offset order. The
// calendar itself is scheduled by planting/harvest day-offsets, not a discrete stage enum — this
// mapping lets the UI show docx-aligned stage labels without changing that underlying scheduling
// model. Bucket assignment follows each task's daysFromPlanting/daysFromHarvest above; earlier
// versions of this mapping invented stage names ("Establishment", "Panicle Initiation") not in
// the docx and omitted "Flowering"/"Vegetative Growth"/"Maturity" — fixed to use only the docx's
// own vocabulary.
const STAGE_NAME_BY_TASK_KEY: Record<string, string> = {
  market_plan: 'Land Preparation',
  certified_seed: 'Land Preparation',
  land_preparation: 'Land Preparation',
  nursery: 'Nursery Preparation',
  transplanting: 'Transplanting / Direct Seeding',
  basal_fertilizer: 'Vegetative Growth',
  gap_filling: 'Vegetative Growth',
  fertilizer_1: 'Vegetative Growth',
  weed_water: 'Tillering',
  pest_disease_scouting: 'Flowering',
  pesticide_container_disposal_1: 'Flowering',
  fertilizer_2: 'Grain Filling',
  pesticide_container_disposal_2: 'Grain Filling',
  pesticide_container_disposal_3: 'Maturity',
  bird_pest_control: 'Maturity',
  harvest_preparation: 'Maturity',
  harvest: 'Harvesting',
  drying: 'Post-Harvest',
  bagging: 'Post-Harvest',
  warehouse_receipt: 'Post-Harvest',
};

@Injectable()
export class RiceProtocolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  /**
   * Who may change a calendar. The platform calendar (mamcosId null) is Super Admin's alone. A
   * cooperative's own calendar belongs to that cooperative: its users need the grant (checked by
   * the route) and must be in that cooperative. Anyone else gets a 404, not a hint it exists.
   */
  private assertCanManage(mamcosId: string | null, user: RequestUser) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (mamcosId === null) {
      throw new ForbiddenException(
        'The platform rice calendar can only be changed by Super Admin',
      );
    }
    if ((user.mamcosId ?? null) !== mamcosId)
      throw new NotFoundException('Rice calendar not found');
  }

  /** Versions are numbered separately for each calendar: the platform default, each variety, each cooperative. */
  private nextVersion(
    mamcosId: string | null,
    varietyId: string | null = null,
  ): Promise<number> {
    return this.prisma.riceProtocol
      .aggregate({ where: { mamcosId, varietyId }, _max: { version: true } })
      .then((r) => (r._max.version ?? 0) + 1);
  }

  private defaultTasks() {
    return MBALARI_TASKS as unknown as Prisma.InputJsonValue;
  }

  // ---------- platform calendars (what farmers see in the mobile app) ----------

  /** The active calendar that belongs to exactly this variety (null = the default calendar). */
  async activePlatformExact(varietyId: string | null) {
    return this.prisma.riceProtocol.findFirst({
      where: { mamcosId: null, varietyId, isActive: true },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * The calendar a crop cycle of this variety follows: the variety's own calendar, or the default
   * one when that variety has none yet. Null only when Super Admin has created no calendar at all.
   */
  async activePlatform(varietyId?: string | null) {
    if (varietyId) {
      const own = await this.activePlatformExact(varietyId);
      if (own) return own;
    }
    return this.activePlatformExact(null);
  }

  /** What every signed-in farmer and staff member may read: the calendar for a variety. */
  async platformCalendar(varietyId?: string | null) {
    const active = await this.activePlatform(varietyId);
    if (!active) return null;
    return {
      id: active.id,
      name: active.name,
      version: active.version,
      varietyId: active.varietyId,
      /** True when the variety asked for has no calendar of its own and the default is shown. */
      usesDefault: !!varietyId && active.varietyId !== varietyId,
      updatedAt: active.updatedAt,
      tasks: (active.taskDefinitions as unknown as ProtocolTask[]).map((t) => ({
        ...t,
        stageName: STAGE_NAME_BY_TASK_KEY[t.key] ?? null,
      })),
    };
  }

  async platformVersions(user: RequestUser, varietyId: string | null = null) {
    this.assertCanManage(null, user);
    return this.prisma.riceProtocol.findMany({
      where: { mamcosId: null, varietyId },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Creates the active calendar for the default (no variety) or for one variety. A new variety
   * calendar starts as a copy of the default, or of another variety's calendar, so the admin edits
   * what differs instead of retyping every activity.
   */
  async bootstrapPlatform(
    user: RequestUser,
    opts: { varietyId?: string | null; copyFromVarietyId?: string | null } = {},
  ) {
    this.assertCanManage(null, user);
    const varietyId = opts.varietyId ?? null;
    let varietyName: string | null = null;
    if (varietyId) {
      const variety = await this.prisma.riceVariety.findUnique({
        where: { id: varietyId },
      });
      if (!variety) throw new NotFoundException('Rice variety not found');
      varietyName = variety.name;
    }
    const active = await this.activePlatformExact(varietyId);
    if (active) return active;

    let tasks: Prisma.InputJsonValue = this.defaultTasks();
    if (varietyId) {
      const source = await this.activePlatformExact(
        opts.copyFromVarietyId ?? null,
      );
      if (source) tasks = source.taskDefinitions as Prisma.InputJsonValue;
    }
    return this.prisma.riceProtocol.create({
      data: {
        mamcosId: null,
        varietyId,
        name: varietyName
          ? `${varietyName} Rice Farming Calendar`
          : 'Mbalari Rice Farming Calendar',
        version: await this.nextVersion(null, varietyId),
        taskDefinitions: tasks,
      },
    });
  }

  // ---------- a cooperative's own calendar (never sent to the mobile app) ----------

  async bootstrap(mamcosId: string, user: RequestUser) {
    this.assertCanManage(mamcosId, user);
    const active = await this.prisma.riceProtocol.findFirst({
      where: { mamcosId, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (active) return active;
    return this.prisma.riceProtocol.create({
      data: {
        mamcosId,
        name: 'Mbalari Rice Farming Calendar',
        version: await this.nextVersion(mamcosId),
        taskDefinitions: this.defaultTasks(),
      },
    });
  }

  async getForMamcos(mamcosId: string, user: RequestUser) {
    this.assertCanManage(mamcosId, user);
    return this.prisma.riceProtocol.findMany({
      where: { mamcosId },
      orderBy: { version: 'desc' },
    });
  }

  async update(id: string, dto: UpdateRiceProtocolDto, user: RequestUser) {
    const current = await this.prisma.riceProtocol.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('Rice protocol not found');
    this.assertCanManage(current.mamcosId, user);
    if (!current.isActive)
      throw new BadRequestException(
        'Only the active version can be edited; this one has been replaced',
      );
    const keys = dto.taskDefinitions.map((t) => t.key);
    if (new Set(keys).size !== keys.length)
      throw new BadRequestException('Every task needs its own unique key');
    // The quality gate and warehouse intake rely on these tasks, so they cannot be removed.
    const missing = REQUIRED_TASK_KEYS.filter((k) => !keys.includes(k));
    if (missing.length)
      throw new BadRequestException(
        `These tasks are needed for the harvest quality check and cannot be removed: ${missing.join(', ')}`,
      );
    const version = await this.nextVersion(current.mamcosId, current.varietyId);
    const [next] = await this.prisma.$transaction([
      this.prisma.riceProtocol.create({
        data: {
          mamcosId: current.mamcosId,
          varietyId: current.varietyId,
          name: dto.name,
          version,
          seasonStart:
            dto.seasonStart === undefined
              ? current.seasonStart
              : dto.seasonStart
                ? new Date(dto.seasonStart)
                : null,
          taskDefinitions:
            dto.taskDefinitions as unknown as Prisma.InputJsonValue,
        },
      }),
      this.prisma.riceProtocol.update({
        where: { id: current.id },
        data: { isActive: false },
      }),
    ]);
    if (!next.mamcosId) await this.rescheduleSeasonCycles(next.varietyId);
    return next;
  }

  /**
   * Farmers whose crop cycle has no planting date of its own follow the calendar's planting date, so
   * saving the calendar brings their tasks up to date. Cycles with their own date are not touched.
   */
  private async rescheduleSeasonCycles(varietyId: string | null) {
    const cycles = await this.prisma.cropCycle.findMany({
      where: {
        plantingDate: null,
        status: { in: ['PLANNED', 'ACTIVE'] },
        ...(varietyId ? { riceVarietyId: varietyId } : {}),
      },
      select: { id: true },
    });
    for (const cycle of cycles) await this.scheduleForCycle(cycle.id);
  }

  /**
   * The cooperative's own calendar laid over its members' crop cycles: what falls due soon, and
   * what is overdue. Worked out on the fly; it creates no tasks and the mobile app never sees it.
   */
  async upcoming(mamcosId: string, user: RequestUser, windowDays = 45) {
    this.assertCanManage(mamcosId, user);
    const protocol = await this.prisma.riceProtocol.findFirst({
      where: { mamcosId, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!protocol) return [];
    const defs = protocol.taskDefinitions as unknown as ProtocolTask[];
    const cycles = await this.prisma.cropCycle.findMany({
      where: {
        plantingDate: { not: null },
        status: { in: ['PLANNED', 'ACTIVE'] },
        farm: { mamcosId },
      },
      select: {
        id: true,
        season: true,
        plantingDate: true,
        expectedHarvest: true,
        farm: { select: { farmCode: true } },
        farmer: { select: { firstName: true, lastName: true } },
      },
    });
    const now = Date.now();
    const from = now - 14 * 86_400_000;
    const to = now + windowDays * 86_400_000;
    const rows: {
      cropCycleId: string;
      farmCode: string;
      farmer: string;
      season: string;
      taskKey: string;
      title: string;
      stageName: string | null;
      dueDate: Date;
      overdue: boolean;
    }[] = [];
    for (const cycle of cycles) {
      for (const def of defs) {
        const base =
          def.daysFromHarvest != null
            ? cycle.expectedHarvest
            : cycle.plantingDate;
        if (!base) continue;
        const due = new Date(
          base.getTime() +
            (def.daysFromHarvest ?? def.daysFromPlanting ?? 0) * 86_400_000,
        );
        if (due.getTime() < from || due.getTime() > to) continue;
        rows.push({
          cropCycleId: cycle.id,
          farmCode: cycle.farm.farmCode,
          farmer: `${cycle.farmer.firstName} ${cycle.farmer.lastName}`.trim(),
          season: cycle.season,
          taskKey: def.key,
          title: def.title,
          stageName: STAGE_NAME_BY_TASK_KEY[def.key] ?? null,
          dueDate: due,
          overdue: due.getTime() < now,
        });
      }
    }
    return rows
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, 300);
  }

  /**
   * Builds (and keeps current) a crop cycle's calendar from the PLATFORM calendar for its rice
   * variety, falling back to the default calendar. The mobile app, reminders and the harvest quality
   * check all read these tasks; cooperatives' own calendars never create them.
   *
   * Re-planning rules, so a farmer can never plan a missed activity away:
   *  - only PENDING tasks that are still in the future are re-dated when planting/harvest dates change;
   *  - COMPLETED and MISSED tasks are never touched;
   *  - a staff-rescheduled task keeps the date staff gave it;
   *  - changing the variety swaps the wording of pending tasks and drops pending ones the new
   *    calendar does not have.
   */
  async scheduleForCycle(
    cropCycleId: string,
    opts: { varietyChanged?: boolean } = {},
  ) {
    const result = { created: 0, redated: 0, refreshed: 0, removed: 0 };
    const cycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
      select: {
        plantingDate: true,
        expectedHarvest: true,
        riceVarietyId: true,
        variety: { select: { maturityDays: true } },
      },
    });
    if (!cycle) return result;
    const protocol = await this.activePlatform(cycle.riceVarietyId);
    if (!protocol) return result;
    // A crop cycle with no planting date of its own follows the planting date Super Admin set on the
    // variety's calendar, so the farmer still sees that calendar. A date of their own always wins.
    const usesSeasonStart = !cycle.plantingDate;
    const plantingDate = cycle.plantingDate ?? protocol.seasonStart;
    if (!plantingDate) return result;

    // Varieties take different times to grow: when only a planting date is known, the harvest date follows from it.
    let expectedHarvest = cycle.expectedHarvest;
    if (!expectedHarvest && cycle.variety?.maturityDays) {
      expectedHarvest = new Date(
        plantingDate.getTime() + cycle.variety.maturityDays * DAY_MS,
      );
      // The calendar's date is only a stand-in, so it is never written onto the farmer's own cycle.
      if (!usesSeasonStart)
        await this.prisma.cropCycle.update({
          where: { id: cropCycleId },
          data: { expectedHarvest },
        });
    }

    const defs = (protocol.taskDefinitions as unknown as ProtocolTask[]).filter(
      (task) => task.daysFromHarvest == null || expectedHarvest,
    );
    const dueFor = (task: ProtocolTask) =>
      new Date(
        (task.daysFromHarvest != null
          ? expectedHarvest!
          : plantingDate
        ).getTime() +
          (task.daysFromHarvest ?? task.daysFromPlanting ?? 0) * DAY_MS,
      );
    const content = (task: ProtocolTask) => ({
      title: task.title,
      guidance: task.guidance,
      activityType: task.activityType ?? null,
      requiredMeasurements: (task.requiredMeasurements ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
      evidenceRequired: task.evidenceRequired ?? false,
      protocolVersion: protocol.version,
      protocolId: protocol.id,
    });

    const existing = await this.prisma.riceCalendarTask.findMany({
      where: { cropCycleId },
    });
    const byKey = new Map(existing.map((t) => [t.taskKey, t]));
    const now = Date.now();

    const fresh = defs.filter((task) => !byKey.has(task.key));
    if (fresh.length) {
      await this.prisma.riceCalendarTask.createMany({
        data: fresh.map((task) => {
          const dueDate = dueFor(task);
          return {
            cropCycleId,
            taskKey: task.key,
            ...content(task),
            dueDate,
            originalDueDate: dueDate,
            // The column has no default, so a task created without photos must say so explicitly.
            photoUrls: [],
          };
        }),
      });
      result.created = fresh.length;
    }

    const defKeys = new Set(defs.map((d) => d.key));
    for (const task of defs) {
      const current = byKey.get(task.key);
      if (!current || current.status !== CalendarTaskStatus.PENDING) continue;
      const data: Prisma.RiceCalendarTaskUpdateInput = {};
      if (opts.varietyChanged || current.protocolId !== protocol.id) {
        Object.assign(data, content(task));
        result.refreshed++;
      }
      const newDue = dueFor(task);
      if (
        current.rescheduleCount === 0 &&
        current.dueDate.getTime() > now &&
        newDue.getTime() !== current.dueDate.getTime()
      ) {
        data.dueDate = newDue;
        data.rescheduleReason =
          current.rescheduleReason ?? 'Planting, harvest or variety changed';
        result.redated++;
      }
      if (Object.keys(data).length)
        await this.prisma.riceCalendarTask.update({
          where: { id: current.id },
          data,
        });
    }

    if (opts.varietyChanged) {
      const stale = existing.filter(
        (t) =>
          t.status === CalendarTaskStatus.PENDING && !defKeys.has(t.taskKey),
      );
      if (stale.length) {
        await this.prisma.riceCalendarTask.deleteMany({
          where: { id: { in: stale.map((t) => t.id) } },
        });
        result.removed = stale.length;
      }
    }
    return result;
  }

  async tasksForCycle(cropCycleId: string, user: RequestUser) {
    const cycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
      select: { farmId: true },
    });
    if (!cycle) throw new NotFoundException('Crop cycle not found');
    await this.ownership.assertFarmAccess(user, cycle.farmId);
    const tasks = await this.prisma.riceCalendarTask.findMany({
      where: { cropCycleId },
      orderBy: { dueDate: 'asc' },
    });
    const now = new Date();
    return tasks.map((task) => ({
      ...task,
      stageName: STAGE_NAME_BY_TASK_KEY[task.taskKey] ?? null,
      // ON_TIME | LATE | MISSED | OVERDUE | DUE_SOON | UPCOMING, for the red/amber/green display.
      view: taskView(task, now),
      lateByDays: lateByDays(task),
      backdated: isBackdated(task),
    }));
  }

  async rescheduleTask(
    id: string,
    dto: RescheduleRiceCalendarTaskDto,
    user: RequestUser,
  ) {
    const canReschedule = new Set<UserRole>([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.FIELD_OFFICER,
      UserRole.MAMCOS_SECRETARY,
    ]);
    if (!canReschedule.has(user.role)) {
      throw new ForbiddenException(
        'Only cooperative staff may reschedule Mbalari calendar tasks',
      );
    }
    const task = await this.prisma.riceCalendarTask.findUnique({
      where: { id },
      include: { cropCycle: { select: { farmId: true } } },
    });
    if (!task) throw new NotFoundException('Calendar task not found');
    await this.ownership.assertFarmAccess(user, task.cropCycle.farmId);
    if (
      task.status === CalendarTaskStatus.COMPLETED ||
      task.status === CalendarTaskStatus.MISSED
    ) {
      // A missed activity stays missed on the record; it can be completed late, never moved away.
      throw new BadRequestException(
        'A completed or missed activity cannot be rescheduled',
      );
    }
    return this.prisma.riceCalendarTask.update({
      where: { id },
      data: {
        dueDate: new Date(dto.dueDate),
        originalDueDate: task.originalDueDate ?? task.dueDate,
        rescheduleCount: { increment: 1 },
        rescheduleReason: dto.reason?.trim() || 'Rescheduled by staff',
      },
    });
  }

  async completeTask(
    id: string,
    dto: CompleteRiceCalendarTaskDto,
    user: RequestUser,
  ) {
    const task = await this.prisma.riceCalendarTask.findUnique({
      where: { id },
      include: { cropCycle: { select: { farmId: true, farmerId: true } } },
    });
    if (!task) throw new NotFoundException('Calendar task not found');
    await this.ownership.assertFarmAccess(user, task.cropCycle.farmId);
    if (task.status === CalendarTaskStatus.COMPLETED) return task;
    // PENDING or MISSED: a missed activity can still be recorded, and then reads as completed late.
    const measurements = dto.measurements ?? {};
    const rules = (task.requiredMeasurements ?? {}) as Record<
      string,
      MeasurementRule
    >;
    for (const [key, rule] of Object.entries(rules)) {
      const value = Number(measurements[key]);
      if (
        measurements[key] == null ||
        Number.isNaN(value) ||
        (rule.min != null && value < rule.min) ||
        (rule.max != null && value > rule.max)
      )
        throw new BadRequestException(
          `${rule.label} is required and must be within the Mbalari protocol range`,
        );
    }
    if (task.evidenceRequired && !dto.photoUrls?.length)
      throw new BadRequestException(
        'A photo is required to complete this Mbalari calendar task',
      );
    const recordedAt = new Date();
    // The phone may report when the work was done (it can be offline), but never a time in the future.
    let completedAt = dto.completedAt ? new Date(dto.completedAt) : recordedAt;
    if (Number.isNaN(completedAt.getTime()) || completedAt > recordedAt)
      completedAt = recordedAt;
    const activity = task.activityType
      ? await this.prisma.activityLog.create({
          data: {
            cropCycleId: task.cropCycleId,
            activityType: task.activityType,
            activityDate: completedAt,
            description: dto.description,
            inputsUsed: measurements,
            photoUrls: dto.photoUrls ?? [],
          },
        })
      : null;
    const updated = await this.prisma.riceCalendarTask.update({
      where: { id },
      data: {
        status: CalendarTaskStatus.COMPLETED,
        measurements: measurements,
        photoUrls: dto.photoUrls ?? [],
        completedAt,
        recordedAt,
        completedByUserId: user.id,
        activityLogId: activity?.id,
      },
    });
    await this.syncQuality(task.cropCycleId, task.taskKey, measurements);
    return updated;
  }

  private async syncQuality(
    cropCycleId: string,
    key: string,
    values: Record<string, string | number>,
  ) {
    const data: {
      harvestMaturityPct?: number;
      panicleMoisturePct?: number;
      dryingMoisturePct?: number;
      bagCount?: number;
      bagWeightKg?: number;
    } = {};
    if (key === 'harvest') {
      data.harvestMaturityPct = Number(values.maturityPct);
      data.panicleMoisturePct = Number(values.panicleMoisturePct);
    }
    if (key === 'drying')
      data.dryingMoisturePct = Number(values.dryingMoisturePct);
    if (key === 'bagging') {
      data.bagCount = Number(values.bagCount);
      data.bagWeightKg = Number(values.bagWeightKg);
    }
    if (!Object.keys(data).length) return;
    await this.prisma.harvestQualityCheck.upsert({
      where: { cropCycleId },
      create: { cropCycleId, ...data },
      update: data,
    });
  }

  async readiness(cropCycleId: string, includeWarehouse = false) {
    const taskKeys = [
      'harvest',
      'drying',
      'bagging',
      ...(includeWarehouse ? ['warehouse_receipt'] : []),
    ];
    const [tasks, quality] = await Promise.all([
      this.prisma.riceCalendarTask.findMany({
        where: { cropCycleId, taskKey: { in: taskKeys } },
        select: { taskKey: true, status: true },
      }),
      this.prisma.harvestQualityCheck.findUnique({ where: { cropCycleId } }),
    ]);
    const required = includeWarehouse
      ? ['harvest', 'drying', 'bagging', 'warehouse_receipt']
      : ['harvest', 'drying', 'bagging'];
    const completed = new Set(
      tasks
        .filter((task) => task.status === CalendarTaskStatus.COMPLETED)
        .map((task) => task.taskKey),
    );
    const missing = required.filter((key) => !completed.has(key));
    if (quality?.dryingMoisturePct == null || quality.dryingMoisturePct > 14)
      missing.push('drying_moisture');
    return { ready: missing.length === 0, missing, quality };
  }

  async recordWarehouseReceipt(
    cropCycleId: string,
    warehouseLocation: string,
    receivedAt: Date,
  ) {
    const readiness = await this.readiness(cropCycleId);
    if (!readiness.ready)
      throw new BadRequestException({
        code: 'MBALARI_QUALITY_GATE',
        missing: readiness.missing,
      });
    await this.prisma.harvestQualityCheck.upsert({
      where: { cropCycleId },
      create: {
        cropCycleId,
        warehouseLocation,
        warehouseReceivedAt: receivedAt,
      },
      update: { warehouseLocation, warehouseReceivedAt: receivedAt },
    });
    await this.prisma.riceCalendarTask.updateMany({
      where: {
        cropCycleId,
        taskKey: 'warehouse_receipt',
        status: CalendarTaskStatus.PENDING,
      },
      data: { status: CalendarTaskStatus.COMPLETED, completedAt: receivedAt },
    });
  }
}
