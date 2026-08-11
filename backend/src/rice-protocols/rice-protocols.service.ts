import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, CalendarTaskStatus, Prisma, UserRole } from '@prisma/client';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteRiceCalendarTaskDto, RescheduleRiceCalendarTaskDto, UpdateRiceProtocolDto } from './dto/rice-protocol.dto';

type MeasurementRule = { label: string; unit?: string; min?: number; max?: number };
type ProtocolTask = { key: string; title: string; guidance: string; daysFromPlanting?: number; daysFromHarvest?: number; activityType?: ActivityType; requiredMeasurements?: Record<string, MeasurementRule>; evidenceRequired?: boolean };

const MBALARI_TASKS: ProtocolTask[] = [
  { key: 'market_plan', title: 'Mpango wa msimu na soko', guidance: 'Panga uzalishaji kwa bei ya soko na ushauri wa afisa ugani.', daysFromPlanting: -120 },
  { key: 'certified_seed', title: 'Mbegu zilizoidhinishwa', guidance: 'Nunua mbegu bora zilizoidhinishwa kutoka chanzo salama.', daysFromPlanting: -90 },
  { key: 'land_preparation', title: 'Andaa shamba', guidance: 'Safisha na sawazisha shamba; tengeneza mifereji ya kuingiza na kutoa maji.', daysFromPlanting: -45, activityType: ActivityType.LAND_PREPARATION, evidenceRequired: true },
  { key: 'nursery', title: 'Andaa vitalu', guidance: 'Tengeneza matuta ya kitalu yenye upana wa sentimita 120–160, upana wa juu sentimita 30–50, na kina cha 40–50.', daysFromPlanting: -30, requiredMeasurements: { nurseryWidthCm: { label: 'Upana wa kitalu', unit: 'cm', min: 120, max: 160 }, nurseryTopWidthCm: { label: 'Upana wa juu wa tuta', unit: 'cm', min: 30, max: 50 }, nurseryDepthCm: { label: 'Kina cha kitalu', unit: 'cm', min: 40, max: 50 } }, evidenceRequired: true },
  { key: 'transplanting', title: 'Pandikiza miche', guidance: 'Pandikiza miche ya siku 14–21 kwa nafasi ya sentimita 20; miche 1–3 kwa shina.', daysFromPlanting: 0, activityType: ActivityType.PLANTING, requiredMeasurements: { seedlingAgeDays: { label: 'Umri wa miche', unit: 'siku', min: 14, max: 21 }, spacingCm: { label: 'Nafasi', unit: 'cm', min: 20, max: 20 }, seedlingsPerHill: { label: 'Miche kwa shina', min: 1, max: 3 }, waterDepthCm: { label: 'Kina cha maji', unit: 'cm', min: 0, max: 3 } }, evidenceRequired: true },
  { key: 'basal_fertilizer', title: 'Mbolea ya kupandia', guidance: 'Weka mbolea ya kupandia ndani ya siku 5 baada ya kupandikiza kwa kiwango kilichoshauriwa.', daysFromPlanting: 5, activityType: ActivityType.FERTILIZING, requiredMeasurements: { quantityKg: { label: 'Kiasi cha mbolea ya kupandia', unit: 'kg', min: 0.01 } }, evidenceRequired: true },
  { key: 'gap_filling', title: 'Rudishia miche iliyokufa', guidance: 'Rudishia miche kwenye nafasi zilizokufa ndani ya siku 10 baada ya kupandikiza.', daysFromPlanting: 10, activityType: ActivityType.PLANTING },
  { key: 'fertilizer_1', title: 'Mbolea ya kukuzia', guidance: 'Ondoa magugu kwanza; maji yasizidi sentimita 5, kisha weka mbolea ya kukuzia siku 14 baada ya kupandikiza kwa ushauri wa afisa ugani.', daysFromPlanting: 14, activityType: ActivityType.FERTILIZING, requiredMeasurements: { quantityKg: { label: 'Kiasi cha mbolea', unit: 'kg', min: 0.01 }, waterDepthCm: { label: 'Kina cha maji kabla ya mbolea', unit: 'cm', min: 0, max: 5 }, weedCoveragePct: { label: 'Kiwango cha magugu kabla ya mbolea', unit: '%', min: 0, max: 5 } }, evidenceRequired: true },
  { key: 'weed_water', title: 'Dhibiti magugu na maji', guidance: 'Ondoa magugu na hakikisha kina cha maji hakizidi sentimita 15.', daysFromPlanting: 45, activityType: ActivityType.WEEDING, requiredMeasurements: { waterDepthCm: { label: 'Kina cha maji', unit: 'cm', min: 0, max: 15 } }, evidenceRequired: true },
  { key: 'pest_disease_scouting', title: 'Kagua wadudu na magonjwa', guidance: 'Kagua shamba kwa wadudu na magonjwa; ukitumia viuatilifu, tumia kipimo sahihi cha lebo au ushauri wa afisa ugani.', daysFromPlanting: 60, activityType: ActivityType.PEST_CONTROL, requiredMeasurements: { scoutedAreaPct: { label: 'Sehemu ya shamba iliyokaguliwa', unit: '%', min: 100, max: 100 } }, evidenceRequired: true },
  { key: 'pesticide_container_disposal_1', title: 'Ondoa vifungashio vya viuatilifu', guidance: 'Usiache vifungashio vya viuatilifu shambani; kusanya na vitunze/ondoa kwa njia salama baada ya matumizi.', daysFromPlanting: 61, activityType: ActivityType.PEST_CONTROL, evidenceRequired: true },
  { key: 'fertilizer_2', title: 'Mbolea ya kuzalisha', guidance: 'Weka mbolea ya kuzalisha kwa kiwango sahihi na endelea kufuatilia visumbufu.', daysFromPlanting: 90, activityType: ActivityType.FERTILIZING, requiredMeasurements: { quantityKg: { label: 'Kiasi cha mbolea', unit: 'kg', min: 0.01 } }, evidenceRequired: true },
  { key: 'pesticide_container_disposal_2', title: 'Rudia ukaguzi wa vifungashio vya viuatilifu', guidance: 'Hakikisha hakuna vifungashio vya viuatilifu vilivyoachwa shambani wakati wa ufuatiliaji wa Machi.', daysFromPlanting: 91, activityType: ActivityType.PEST_CONTROL, evidenceRequired: true },
  { key: 'pesticide_container_disposal_3', title: 'Ukaguzi wa mwisho wa vifungashio vya viuatilifu', guidance: 'Aprili-Mei: hakikisha vifungashio vyote vya viuatilifu vimeondolewa shambani kabla ya maandalizi ya kuvuna.', daysFromHarvest: -45, activityType: ActivityType.PEST_CONTROL, evidenceRequired: true },
  { key: 'bird_pest_control', title: 'Dhibiti ndege na wanyama', guidance: 'Tumia njia salama za kuzuia ndege, wanyama waharibifu na panya.', daysFromHarvest: -30, activityType: ActivityType.PEST_CONTROL, evidenceRequired: true },
  { key: 'harvest_preparation', title: 'Maandalizi ya kuvuna', guidance: 'Andaa magunia, ghala, mashine za kuvuna, kupura na usafirishaji.', daysFromHarvest: -21 },
  { key: 'harvest', title: 'Vuna mpunga', guidance: 'Vuna wakati 80–85% ya suke limekomaa au unyevu wa punje ni 20–25%.', daysFromHarvest: 0, activityType: ActivityType.HARVESTING, requiredMeasurements: { maturityPct: { label: 'Ukomavu wa suke', unit: '%', min: 80, max: 85 }, panicleMoisturePct: { label: 'Unyevu wa punje', unit: '%', min: 20, max: 25 } }, evidenceRequired: true },
  { key: 'drying', title: 'Kausha mpunga', guidance: 'Kausha mpunga hadi unyevu wa punje ufikie au uwe chini ya 14%.', daysFromHarvest: 2, activityType: ActivityType.DRYING, requiredMeasurements: { dryingMoisturePct: { label: 'Unyevu baada ya kukausha', unit: '%', min: 0, max: 14 } }, evidenceRequired: true },
  { key: 'bagging', title: 'Pakia na tenganisha aina', guidance: 'Tenganisha aina za mpunga na pakia kwenye magunia safi yenye lebo.', daysFromHarvest: 7, activityType: ActivityType.STORAGE, requiredMeasurements: { bagCount: { label: 'Idadi ya magunia', min: 1 }, bagWeightKg: { label: 'Uzito wa gunia', unit: 'kg', min: 1 } }, evidenceRequired: true },
  { key: 'warehouse_receipt', title: 'Pokea ghala la ushirika', guidance: 'Peleka mpunga uliokaguliwa kwenye ghala la ushirika kwa hifadhi na uuzaji wa pamoja.', daysFromHarvest: 10, activityType: ActivityType.TRANSPORT },
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
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  private async assertProtocolAdmin(mamcosId: string, user: RequestUser) {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) return;
    const staff = await this.prisma.mamcosStaff.findFirst({ where: { mamcosId, userId: user.id, role: 'SECRETARY' }, select: { id: true } });
    if (!staff) throw new ForbiddenException('Only this cooperative’s secretary may manage its rice calendar');
  }

  async bootstrap(mamcosId: string, user: RequestUser) {
    await this.assertProtocolAdmin(mamcosId, user);
    const active = await this.prisma.riceProtocol.findFirst({ where: { mamcosId, isActive: true }, orderBy: { version: 'desc' } });
    if (active) return active;
    return this.prisma.riceProtocol.create({ data: { mamcosId, name: 'Kalenda ya Kilimo cha Mpunga — Mbalari', version: 1, taskDefinitions: MBALARI_TASKS as unknown as Prisma.InputJsonValue } });
  }

  async getForMamcos(mamcosId: string, user: RequestUser) {
    await this.assertProtocolAdmin(mamcosId, user);
    return this.prisma.riceProtocol.findMany({ where: { mamcosId }, orderBy: { version: 'desc' } });
  }

  async update(id: string, dto: UpdateRiceProtocolDto, user: RequestUser) {
    const current = await this.prisma.riceProtocol.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Rice protocol not found');
    await this.assertProtocolAdmin(current.mamcosId, user);
    const next = await this.prisma.riceProtocol.create({ data: { mamcosId: current.mamcosId, name: dto.name, version: current.version + 1, taskDefinitions: dto.taskDefinitions as unknown as Prisma.InputJsonValue } });
    await this.prisma.riceProtocol.update({ where: { id: current.id }, data: { isActive: false } });
    return next;
  }

  async scheduleForCycle(cropCycleId: string, mamcosId?: string | null) {
    if (!mamcosId) return [];
    const protocol = await this.prisma.riceProtocol.findFirst({ where: { mamcosId, isActive: true }, orderBy: { version: 'desc' } });
    if (!protocol) return [];
    const cycle = await this.prisma.cropCycle.findUnique({ where: { id: cropCycleId }, select: { plantingDate: true, expectedHarvest: true } });
    if (!cycle?.plantingDate) return [];
    const tasks = (protocol.taskDefinitions as unknown as ProtocolTask[])
      .filter((task) => task.daysFromHarvest == null || cycle.expectedHarvest);
    const existing = await this.prisma.riceCalendarTask.findMany({ where: { cropCycleId }, select: { taskKey: true } });
    const existingKeys = new Set(existing.map((task) => task.taskKey));
    const newTasks = tasks.filter((task) => !existingKeys.has(task.key));
    if (!newTasks.length) return { count: 0 };
    return this.prisma.riceCalendarTask.createMany({ data: newTasks.map((task) => ({ cropCycleId, protocolVersion: protocol.version, taskKey: task.key, title: task.title, guidance: task.guidance, activityType: task.activityType, dueDate: new Date((task.daysFromHarvest != null ? cycle.expectedHarvest! : cycle.plantingDate!).getTime() + (task.daysFromHarvest ?? task.daysFromPlanting ?? 0) * 86400000), requiredMeasurements: task.requiredMeasurements as Prisma.InputJsonValue | undefined, evidenceRequired: task.evidenceRequired ?? false })) });
  }

  async tasksForCycle(cropCycleId: string, user: RequestUser) {
    const cycle = await this.prisma.cropCycle.findUnique({ where: { id: cropCycleId }, select: { farmId: true } });
    if (!cycle) throw new NotFoundException('Crop cycle not found');
    await this.ownership.assertFarmAccess(user, cycle.farmId);
    const tasks = await this.prisma.riceCalendarTask.findMany({ where: { cropCycleId }, orderBy: { dueDate: 'asc' } });
    return tasks.map((task) => ({ ...task, stageName: STAGE_NAME_BY_TASK_KEY[task.taskKey] ?? null }));
  }

  async rescheduleTask(id: string, dto: RescheduleRiceCalendarTaskDto, user: RequestUser) {
    const canReschedule = new Set<UserRole>([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.FIELD_OFFICER,
      UserRole.MAMCOS_SECRETARY,
    ]);
    if (!canReschedule.has(user.role)) {
      throw new ForbiddenException('Only cooperative staff may reschedule Mbalari calendar tasks');
    }
    const task = await this.prisma.riceCalendarTask.findUnique({
      where: { id },
      include: { cropCycle: { select: { farmId: true } } },
    });
    if (!task) throw new NotFoundException('Calendar task not found');
    await this.ownership.assertFarmAccess(user, task.cropCycle.farmId);
    const guidance = dto.reason ? `${task.guidance}\n\nRatiba imebadilishwa: ${dto.reason}` : task.guidance;
    return this.prisma.riceCalendarTask.update({
      where: { id },
      data: { dueDate: new Date(dto.dueDate), guidance },
    });
  }

  async completeTask(id: string, dto: CompleteRiceCalendarTaskDto, user: RequestUser) {
    const task = await this.prisma.riceCalendarTask.findUnique({ where: { id }, include: { cropCycle: { select: { farmId: true, farmerId: true } } } });
    if (!task) throw new NotFoundException('Calendar task not found');
    await this.ownership.assertFarmAccess(user, task.cropCycle.farmId);
    if (task.status === CalendarTaskStatus.COMPLETED) return task;
    const measurements = dto.measurements ?? {};
    const rules = (task.requiredMeasurements ?? {}) as Record<string, MeasurementRule>;
    for (const [key, rule] of Object.entries(rules)) {
      const value = Number(measurements[key]);
      if (measurements[key] == null || Number.isNaN(value) || (rule.min != null && value < rule.min) || (rule.max != null && value > rule.max)) throw new BadRequestException(`${rule.label} is required and must be within the Mbalari protocol range`);
    }
    if (task.evidenceRequired && !dto.photoUrls?.length) throw new BadRequestException('A photo is required to complete this Mbalari calendar task');
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    const activity = task.activityType ? await this.prisma.activityLog.create({ data: { cropCycleId: task.cropCycleId, activityType: task.activityType, activityDate: completedAt, description: dto.description, inputsUsed: measurements as Prisma.InputJsonValue, photoUrls: dto.photoUrls ?? [] } }) : null;
    const updated = await this.prisma.riceCalendarTask.update({ where: { id }, data: { status: CalendarTaskStatus.COMPLETED, measurements: measurements as Prisma.InputJsonValue, photoUrls: dto.photoUrls ?? [], completedAt, completedByUserId: user.id, activityLogId: activity?.id } });
    await this.syncQuality(task.cropCycleId, task.taskKey, measurements);
    return updated;
  }

  private async syncQuality(cropCycleId: string, key: string, values: Record<string, string | number>) {
    const data: { harvestMaturityPct?: number; panicleMoisturePct?: number; dryingMoisturePct?: number; bagCount?: number; bagWeightKg?: number } = {};
    if (key === 'harvest') { data.harvestMaturityPct = Number(values.maturityPct); data.panicleMoisturePct = Number(values.panicleMoisturePct); }
    if (key === 'drying') data.dryingMoisturePct = Number(values.dryingMoisturePct);
    if (key === 'bagging') { data.bagCount = Number(values.bagCount); data.bagWeightKg = Number(values.bagWeightKg); }
    if (!Object.keys(data).length) return;
    await this.prisma.harvestQualityCheck.upsert({ where: { cropCycleId }, create: { cropCycleId, ...data }, update: data });
  }

  async readiness(cropCycleId: string, includeWarehouse = false) {
    const taskKeys = ['harvest', 'drying', 'bagging', ...(includeWarehouse ? ['warehouse_receipt'] : [])];
    const [tasks, quality] = await Promise.all([
      this.prisma.riceCalendarTask.findMany({
        where: { cropCycleId, taskKey: { in: taskKeys } },
        select: { taskKey: true, status: true },
      }),
      this.prisma.harvestQualityCheck.findUnique({ where: { cropCycleId } }),
    ]);
    const required = includeWarehouse ? ['harvest', 'drying', 'bagging', 'warehouse_receipt'] : ['harvest', 'drying', 'bagging'];
    const completed = new Set(tasks.filter((task) => task.status === CalendarTaskStatus.COMPLETED).map((task) => task.taskKey));
    const missing = required.filter((key) => !completed.has(key));
    if (quality?.dryingMoisturePct == null || quality.dryingMoisturePct > 14) missing.push('drying_moisture');
    return { ready: missing.length === 0, missing, quality };
  }

  async recordWarehouseReceipt(cropCycleId: string, warehouseLocation: string, receivedAt: Date) {
    const readiness = await this.readiness(cropCycleId);
    if (!readiness.ready) throw new BadRequestException({ code: 'MBALARI_QUALITY_GATE', missing: readiness.missing });
    await this.prisma.harvestQualityCheck.upsert({ where: { cropCycleId }, create: { cropCycleId, warehouseLocation, warehouseReceivedAt: receivedAt }, update: { warehouseLocation, warehouseReceivedAt: receivedAt } });
    await this.prisma.riceCalendarTask.updateMany({ where: { cropCycleId, taskKey: 'warehouse_receipt', status: CalendarTaskStatus.PENDING }, data: { status: CalendarTaskStatus.COMPLETED, completedAt: receivedAt } });
  }
}
