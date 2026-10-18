import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ActivityType, Prisma, RiceGrowthStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, nextRef, owner, OpsNotifyService, scope, Tx } from './ops-common';
import { canMoveTask, geofence } from './ops-rules';
import { FarmInputsService } from './farm-inputs.service';
import { CheckInDto, CreateInspectionDto, CreateTaskDto, FollowUpDto, ReviewTaskDto, StartWithoutGpsDto, SubmitInspectionDto, SubmitReportDto } from './dto/farm.dto';

type User = Actor & { id: string };
const FINAL = ['COMPLETED', 'REJECTED', 'CANCELLED'];
const ACTIVITIES = Object.values(ActivityType) as string[];
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/** Centre of a boundary stored as GeoJSON-like coordinates ([lng, lat] pairs or { lat, lng } points). */
export function centroidOf(boundary: unknown): { lat: number; lon: number } | null {
  let pts: unknown = boundary;
  if (pts && typeof pts === 'object' && !Array.isArray(pts) && 'coordinates' in (pts as object)) pts = (pts as { coordinates: unknown }).coordinates;
  const flat: [number, number][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') flat.push([v[0], v[1]]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object' && 'lat' in (v as object)) {
      const o = v as { lat: number; lng?: number; lon?: number };
      flat.push([o.lng ?? o.lon ?? 0, o.lat]);
    }
  };
  walk(pts);
  if (!flat.length) return null;
  return { lon: flat.reduce((t, p) => t + p[0], 0) / flat.length, lat: flat.reduce((t, p) => t + p[1], 0) / flat.length };
}

@Injectable()
export class FarmTasksService {
  private readonly logger = new Logger(FarmTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inputs: FarmInputsService,
    private readonly notify: OpsNotifyService,
  ) {}

  private async event(tx: Tx, taskId: string, type: string, actorUserId: string | null, from: string | null, to: string | null, note?: string | null) {
    await tx.taskEvent.create({ data: { taskId, type, actorUserId, fromStatus: from, toStatus: to, note: note ?? null } });
  }

  private async names(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true, phone: true } });
    return new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone]));
  }

  /** Where the work should be: the plot's centre, else the middle of its boundary, else the farm's. */
  private referencePoint(plot: { centerLatitude: number | null; centerLongitude: number | null; boundaryCoordinates: unknown } | null, farm: { centerLatitude: number | null; centerLongitude: number | null; boundaryCoordinates: unknown }) {
    if (plot?.centerLatitude != null && plot.centerLongitude != null) return { lat: plot.centerLatitude, lon: plot.centerLongitude };
    const p = plot ? centroidOf(plot.boundaryCoordinates) : null;
    if (p) return p;
    if (farm.centerLatitude != null && farm.centerLongitude != null) return { lat: farm.centerLatitude, lon: farm.centerLongitude };
    return centroidOf(farm.boundaryCoordinates);
  }

  // ---------- creating work ----------

  private async validateWork(dto: { farmId: string; plotId?: string; cropCycleId?: string; assigneeUserId: string; reviewerUserId?: string }, actor: Actor) {
    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    assertVisible(actor, farm, 'Farm');
    if (!farm.isActive) throw new BadRequestException('This farm is not active');
    if (dto.plotId) {
      const plot = await this.prisma.plot.findUnique({ where: { id: dto.plotId }, select: { farmId: true } });
      if (!plot || plot.farmId !== farm.id) throw new BadRequestException('That plot is not on this farm');
    }
    if (dto.cropCycleId) {
      const c = await this.prisma.cropCycle.findUnique({ where: { id: dto.cropCycleId }, select: { farmId: true, plotId: true } });
      if (!c || c.farmId !== farm.id) throw new BadRequestException('That crop season is not on this farm');
      if (dto.plotId && c.plotId && c.plotId !== dto.plotId) throw new BadRequestException('That crop season is on a different plot');
    }
    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeUserId }, select: { isActive: true, mamcosId: true } });
    if (!assignee || !assignee.isActive || (assignee.mamcosId ?? null) !== (farm.mamcosId ?? null)) throw new BadRequestException('Choose an active member of staff from this organisation');
    const reviewer = dto.reviewerUserId ?? farm.managerUserId ?? null;
    if (reviewer === dto.assigneeUserId) throw new BadRequestException('The person who does the work cannot be the one who reviews it');
    return { farm, reviewer };
  }

  async createTask(dto: CreateTaskDto, actor: User) {
    if (!ACTIVITIES.includes(dto.activityType)) throw new BadRequestException(`Unknown activity type. Use one of: ${ACTIVITIES.join(', ')}`);
    const { farm, reviewer } = await this.validateWork(dto, actor);
    const reviewerUserId = reviewer ?? (actor.id !== dto.assigneeUserId ? actor.id : null);
    if (!reviewerUserId) throw new BadRequestException('Choose who will review this work');
    const task = await this.prisma.$transaction(async (tx) => {
      const t = await tx.farmTask.create({
        data: {
          mamcosId: farm.mamcosId, reference: await nextRef(tx, 'TK'), type: 'TASK', farmId: dto.farmId, plotId: dto.plotId ?? null, cropCycleId: dto.cropCycleId ?? null,
          activityType: dto.activityType, title: dto.title.trim(), instructions: dto.instructions?.trim() || null, assigneeUserId: dto.assigneeUserId, assignedByUserId: actor.id,
          reviewerUserId, plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null, deadline: dto.deadline ? new Date(dto.deadline) : null, expectedOutput: dto.expectedOutput?.trim() || null,
          requiredInputs: dto.requiredInputs?.trim() || null, priority: dto.priority ?? 'NORMAL', attachments: dto.attachments ?? [], requireGps: dto.requireGps ?? true, geofenceM: dto.geofenceM ?? 300, parentTaskId: dto.parentTaskId ?? null,
        },
      });
      await this.event(tx, t.id, 'task.assigned', actor.id, null, 'ASSIGNED', dto.title);
      return t;
    });
    await this.notify.tell([task.assigneeUserId], { type: 'FARM_TASK_ASSIGNED', title: 'New farm task', body: `${task.reference}: ${task.title}${task.deadline ? ` — due ${task.deadline.toLocaleDateString('en-GB')}` : ''}`, data: { taskId: task.id } });
    return this.detail(task.id, actor);
  }

  async createInspection(dto: CreateInspectionDto, actor: User) {
    const { farm, reviewer } = await this.validateWork(dto, actor);
    const reviewerUserId = reviewer ?? (actor.id !== dto.assigneeUserId ? actor.id : null);
    if (!reviewerUserId) throw new BadRequestException('Choose who will review the inspection');
    const task = await this.prisma.$transaction(async (tx) => {
      const t = await tx.farmTask.create({
        data: {
          mamcosId: farm.mamcosId, reference: await nextRef(tx, 'TK'), type: 'INSPECTION', farmId: dto.farmId, plotId: dto.plotId ?? null, cropCycleId: dto.cropCycleId ?? null,
          activityType: 'FIELD_INSPECTION', title: `Inspection: ${dto.objective.trim().slice(0, 80)}`, inspectionObjective: dto.objective.trim(), assigneeUserId: dto.assigneeUserId, assignedByUserId: actor.id,
          reviewerUserId, plannedStart: new Date(dto.scheduledFor), deadline: new Date(dto.scheduledFor), geofenceM: dto.geofenceM ?? 300, requireGps: true,
        },
      });
      await this.event(tx, t.id, 'task.assigned', actor.id, null, 'ASSIGNED', dto.objective);
      return t;
    });
    await this.notify.tell([task.assigneeUserId], { type: 'FARM_TASK_ASSIGNED', title: 'New field inspection', body: `${task.reference}: ${dto.objective.trim()}`, data: { taskId: task.id } });
    return this.detail(task.id, actor);
  }

  // ---------- reading ----------

  private include = {
    farm: { select: { farmCode: true, name: true } },
    plot: { select: { plotCode: true, name: true } },
    cropCycle: { select: { season: true, riceVariety: true } },
  } satisfies Prisma.FarmTaskInclude;

  async list(actor: Actor, f: { assigneeId?: string; status?: string; farmId?: string; plotId?: string; type?: string; overdue?: string; from?: string; to?: string; q?: string; reviewable?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    const tasks = await this.prisma.farmTask.findMany({
      where: {
        ...scope(actor),
        ...(f.assigneeId ? { assigneeUserId: f.assigneeId } : {}), ...(f.status ? { status: f.status as never } : {}), ...(f.farmId ? { farmId: f.farmId } : {}),
        ...(f.plotId ? { plotId: f.plotId } : {}), ...(f.type ? { type: f.type as never } : {}),
        ...(f.reviewable === 'true' ? { status: 'PENDING_REVIEW' as const } : {}),
        ...(f.overdue === 'true' ? { deadline: { lt: new Date() }, status: { notIn: FINAL as never[] } } : {}),
        ...(f.from || to ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(f.q ? { OR: [{ reference: { contains: f.q, mode: 'insensitive' } }, { title: { contains: f.q, mode: 'insensitive' } }] } : {}),
      },
      include: this.include,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: 400,
    });
    const names = await this.names(tasks.map((t) => t.assigneeUserId));
    const now = Date.now();
    return tasks.map((t) => ({ ...t, assigneeName: names.get(t.assigneeUserId) ?? null, overdue: !!t.deadline && t.deadline.getTime() < now && !FINAL.includes(t.status) }));
  }

  /** What a worker sees: only their own assignments. */
  async mine(user: User, f: { status?: string } = {}) {
    const tasks = await this.prisma.farmTask.findMany({
      where: { assigneeUserId: user.id, ...(f.status ? { status: f.status as never } : {}) },
      include: this.include,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const now = Date.now();
    return tasks.map((t) => ({ ...t, overdue: !!t.deadline && t.deadline.getTime() < now && !FINAL.includes(t.status) }));
  }

  async detail(id: string, actor: Actor, user?: User) {
    const t = await this.prisma.farmTask.findUnique({
      where: { id },
      include: {
        ...this.include,
        plot: { select: { plotCode: true, name: true, centerLatitude: true, centerLongitude: true } },
        farm: { select: { farmCode: true, name: true, centerLatitude: true, centerLongitude: true } },
        events: { orderBy: { createdAt: 'asc' } }, checkIns: { orderBy: { serverTime: 'asc' } }, reports: { orderBy: { submittedAt: 'asc' } }, inspection: true,
        followUps: { select: { id: true, reference: true, title: true, status: true, assigneeUserId: true, deadline: true } }, parent: { select: { id: true, reference: true, title: true } },
        inputMovements: { include: { item: { select: { name: true, unit: true } } } },
      },
    });
    if (!t || !((user && t.assigneeUserId === user.id) || assertCanSee(actor, t.mamcosId))) throw new NotFoundException('Task not found');
    const names = await this.names([t.assigneeUserId, t.assignedByUserId, t.reviewerUserId, ...t.events.map((e) => e.actorUserId), ...t.followUps.map((f) => f.assigneeUserId)]);
    return {
      ...t,
      assigneeName: names.get(t.assigneeUserId) ?? null, assignedByName: names.get(t.assignedByUserId) ?? null, reviewerName: t.reviewerUserId ? names.get(t.reviewerUserId) ?? null : null,
      events: t.events.map((e) => ({ ...e, actorName: e.actorUserId ? names.get(e.actorUserId) ?? null : null })),
      followUps: t.followUps.map((f) => ({ ...f, assigneeName: names.get(f.assigneeUserId) ?? null })),
      overdue: !!t.deadline && t.deadline.getTime() < Date.now() && !FINAL.includes(t.status),
    };
  }

  private async mineOrFail(id: string, user: User) {
    const t = await this.prisma.farmTask.findUnique({ where: { id }, include: { farm: true, plot: true, checkIns: true } });
    if (!t || t.assigneeUserId !== user.id) throw new NotFoundException('Task not found');
    return t;
  }

  // ---------- the worker's steps ----------

  async acknowledge(id: string, user: User) {
    const t = await this.mineOrFail(id, user);
    if (t.status !== 'ASSIGNED') throw new ConflictException('This task has already been acknowledged');
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.farmTask.updateMany({ where: { id, status: 'ASSIGNED' }, data: { status: 'ACKNOWLEDGED' } });
      if (c.count) await this.event(tx, id, 'task.acknowledged', user.id, 'ASSIGNED', 'ACKNOWLEDGED');
    });
    return this.detail(id, user, user);
  }

  /**
   * Records the visit with the phone's position and clock beside the server's clock. It is written once and cannot be edited.
   * Being outside the allowed distance does not block the worker: it is flagged for the reviewer.
   */
  async checkIn(id: string, dto: CheckInDto, user: User) {
    const t = await this.mineOrFail(id, user);
    const kind = dto.kind ?? 'CHECK_IN';
    if (dto.clientKey) {
      const dup = await this.prisma.taskCheckIn.findUnique({ where: { clientKey: dto.clientKey } });
      if (dup) return { checkIn: dup, duplicate: true };
    }
    if (FINAL.includes(t.status) || t.status === 'PENDING_REVIEW') throw new ConflictException('This task is no longer open for check-ins');
    if (t.checkIns.some((c) => c.kind === kind)) throw new ConflictException(kind === 'CHECK_IN' ? 'You have already checked in to this task' : 'You have already checked out of this task');
    if (kind === 'CHECK_OUT' && !t.checkIns.some((c) => c.kind === 'CHECK_IN')) throw new ConflictException('Check in before you check out');
    const deviceTime = new Date(dto.deviceTime);
    const skewed = deviceTime.getTime() > Date.now() + MAX_FUTURE_SKEW_MS;
    const ref = this.referencePoint(t.plot, t.farm);
    const g = geofence({ lat: dto.latitude, lon: dto.longitude, accuracyM: dto.accuracyM }, ref, t.geofenceM);
    const note = [dto.note?.trim(), skewed ? 'Phone clock was ahead of the server' : null].filter(Boolean).join(' · ') || null;
    const out = await this.prisma.$transaction(async (tx) => {
      const checkIn = await tx.taskCheckIn.create({
        data: { taskId: id, userId: user.id, kind, latitude: dto.latitude, longitude: dto.longitude, accuracyM: dto.accuracyM ?? null, deviceTime, referenceLat: ref?.lat ?? null, referenceLon: ref?.lon ?? null, distanceM: g.distanceM, withinGeofence: g.within, photoUrls: dto.photoUrls ?? [], note, clientKey: dto.clientKey ?? null },
      });
      let status = t.status;
      if (kind === 'CHECK_IN' && ['ASSIGNED', 'ACKNOWLEDGED', 'RETURNED'].includes(t.status)) {
        await tx.farmTask.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
        status = 'IN_PROGRESS';
      }
      await this.event(tx, id, kind === 'CHECK_IN' ? 'task.checked_in' : 'task.checked_out', user.id, t.status, status, g.within === false ? `Outside the allowed distance: ${g.note}` : g.note);
      return { checkIn, status };
    });
    if (g.within === false) {
      await this.notify.tell([t.reviewerUserId, t.assignedByUserId, t.farm.managerUserId], { type: 'FARM_CHECKIN_OUTSIDE', title: 'Check-in away from the assigned plot', body: `${t.reference}: ${g.note}.`, data: { taskId: id } });
    }
    return { checkIn: out.checkIn, duplicate: false, geofence: g };
  }

  /** For a phone that cannot get a position. The task still starts, but the reason is kept and the reviewer is told. */
  async startWithoutGps(id: string, dto: StartWithoutGpsDto, user: User) {
    const t = await this.mineOrFail(id, user);
    if (!dto.reason.trim()) throw new BadRequestException('Say why the location could not be recorded');
    if (!['ASSIGNED', 'ACKNOWLEDGED', 'RETURNED'].includes(t.status)) throw new ConflictException('This task has already been started');
    await this.prisma.$transaction(async (tx) => {
      await tx.farmTask.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
      await this.event(tx, id, 'task.started_without_gps', user.id, t.status, 'IN_PROGRESS', dto.reason.trim());
    });
    return this.detail(id, user, user);
  }

  private async assertStartedProperly(t: { id: string; requireGps: boolean; status: string; checkIns: { kind: string }[] }) {
    if (!['IN_PROGRESS', 'RETURNED', 'ACKNOWLEDGED', 'ASSIGNED'].includes(t.status)) throw new ConflictException('This task cannot be submitted now');
    if (t.requireGps && !t.checkIns.some((c) => c.kind === 'CHECK_IN')) {
      const ev = await this.prisma.taskEvent.count({ where: { taskId: t.id, type: 'task.started_without_gps' } });
      if (!ev) throw new ConflictException('Check in at the plot first so your location is recorded');
    }
  }

  async submitReport(id: string, dto: SubmitReportDto, user: User) {
    const t = await this.mineOrFail(id, user);
    if (t.type === 'INSPECTION') throw new BadRequestException('Submit an inspection report for this task');
    await this.assertStartedProperly(t);
    if (!dto.workDoneQty && !dto.observations?.trim() && !dto.incompleteReason?.trim()) throw new BadRequestException('Say what was done, or why it was not finished');
    const inputs = dto.inputs ?? [];
    if (inputs.length) {
      const items = await this.prisma.farmInputItem.findMany({ where: { id: { in: inputs.map((i) => i.itemId) }, mamcosId: t.mamcosId } });
      if (items.length !== new Set(inputs.map((i) => i.itemId)).size) throw new BadRequestException('A chosen input was not found');
    }
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.farmTask.updateMany({ where: { id, status: { in: ['IN_PROGRESS', 'RETURNED', 'ACKNOWLEDGED', 'ASSIGNED'] } }, data: { status: 'PENDING_REVIEW' } });
      if (!c.count) throw new ConflictException('This task has already been submitted');
      await tx.taskReport.create({
        data: {
          taskId: id, submittedByUserId: user.id, actualStart: dto.actualStart ? new Date(dto.actualStart) : null, actualEnd: dto.actualEnd ? new Date(dto.actualEnd) : null, workDoneQty: dto.workDoneQty ?? null,
          workDoneUnit: dto.workDoneUnit ?? null, equipment: dto.equipment?.trim() || null, observations: dto.observations?.trim() || null, incompleteReason: dto.incompleteReason?.trim() || null,
          photoUrls: dto.photoUrls ?? [], inputs: inputs.length ? (inputs as unknown as Prisma.InputJsonValue) : undefined,
        },
      });
      await this.event(tx, id, 'task.submitted', user.id, t.status, 'PENDING_REVIEW', dto.incompleteReason);
    });
    await this.notify.tell([t.reviewerUserId], { type: 'FARM_TASK_REVIEW', title: 'Farm task to review', body: `${t.reference}: ${t.title}`, data: { taskId: id } });
    return this.detail(id, user, user);
  }

  async submitInspection(id: string, dto: SubmitInspectionDto, user: User) {
    const t = await this.mineOrFail(id, user);
    if (t.type !== 'INSPECTION') throw new BadRequestException('This is not an inspection');
    await this.assertStartedProperly(t);
    if (!dto.observations?.trim() && !dto.cropCondition?.trim()) throw new BadRequestException('Describe the crop condition or your observations');
    if (dto.growthStage && !(Object.values(RiceGrowthStage) as string[]).includes(dto.growthStage)) throw new BadRequestException('Unknown growth stage');
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.farmTask.updateMany({ where: { id, status: { in: ['IN_PROGRESS', 'RETURNED', 'ACKNOWLEDGED', 'ASSIGNED'] } }, data: { status: 'PENDING_REVIEW' } });
      if (!c.count) throw new ConflictException('This inspection has already been submitted');
      const data = {
        cropCondition: dto.cropCondition?.trim() || null, growthStage: dto.growthStage ?? null, pests: dto.pests?.trim() || null, diseases: dto.diseases?.trim() || null, soilWater: dto.soilWater?.trim() || null,
        observations: dto.observations?.trim() || null, photoUrls: dto.photoUrls ?? [], recommendations: (dto.recommendations ?? []) as unknown as Prisma.InputJsonValue, submittedAt: new Date(),
      };
      await tx.inspectionReport.upsert({ where: { taskId: id }, create: { taskId: id, ...data }, update: data });
      await this.event(tx, id, 'inspection.submitted', user.id, t.status, 'PENDING_REVIEW');
    });
    await this.notify.tell([t.reviewerUserId, t.assignedByUserId], { type: 'FARM_TASK_REVIEW', title: 'Inspection report to review', body: `${t.reference}: ${t.title}`, data: { taskId: id } });
    return this.detail(id, user, user);
  }

  // ---------- review ----------

  /** Only someone other than the worker may decide. Approving is what spends the inputs and records the activity. */
  async review(id: string, dto: ReviewTaskDto, actor: User) {
    const task = await this.prisma.farmTask.findUnique({ where: { id }, include: { farm: true, reports: { orderBy: { submittedAt: 'desc' }, take: 1 }, inspection: true, checkIns: true } });
    assertVisible(actor, task, 'Task');
    if (task.assigneeUserId === actor.id) throw new ForbiddenException('You cannot review your own work');
    if (task.status !== 'PENDING_REVIEW') throw new ConflictException('This task is not waiting for review');
    if (dto.decision !== 'APPROVE' && !dto.comment?.trim()) throw new BadRequestException('Say why, so the worker knows what to do next');
    for (const f of dto.followUps ?? []) {
      if (!ACTIVITIES.includes(f.activityType)) throw new BadRequestException(`Unknown activity type for follow-up “${f.title}”`);
    }
    const to = dto.decision === 'APPROVE' ? 'COMPLETED' : dto.decision === 'REJECT' ? 'REJECTED' : 'RETURNED';
    if (!canMoveTask(task.status, to)) throw new ConflictException('That decision is not possible now');
    const followUps: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.farmTask.updateMany({ where: { id, status: 'PENDING_REVIEW' }, data: { status: to, reviewDecision: dto.decision, reviewComment: dto.comment?.trim() || null, reviewedAt: new Date(), reviewerUserId: actor.id, ...(to === 'COMPLETED' ? { completedAt: new Date() } : {}) } });
      if (!claimed.count) throw new ConflictException('Someone else has just reviewed this task');
      if (to === 'COMPLETED') await this.onApproved(tx, task, actor);
      for (const f of dto.followUps ?? []) followUps.push(await this.createFollowUp(tx, task, f, actor));
      await this.event(tx, id, ({ APPROVE: 'task.approved', REJECT: 'task.rejected', RETURN: 'task.returned' } as const)[dto.decision], actor.id, 'PENDING_REVIEW', to, dto.comment);
    });
    await this.notify.tell([task.assigneeUserId], {
      type: 'FARM_TASK_REVIEWED', title: dto.decision === 'APPROVE' ? 'Task approved' : dto.decision === 'REJECT' ? 'Task rejected' : 'Task returned for correction',
      body: `${task.reference}: ${task.title}${dto.comment ? ` — ${dto.comment}` : ''}`, data: { taskId: id },
    });
    if (task.type === 'INSPECTION' && task.inspection) await this.notify.tell([task.assignedByUserId, task.farm.managerUserId], { type: 'FARM_INSPECTION_DONE', title: 'Inspection completed', body: `${task.reference}: ${task.title}`, data: { taskId: id } });
    return this.detail(id, actor);
  }

  private async createFollowUp(tx: Tx, parent: { id: string; farmId: string; plotId: string | null; cropCycleId: string | null; mamcosId: string | null; reference: string; reviewerUserId: string | null }, f: FollowUpDto, actor: User) {
    const assignee = await tx.user.findUnique({ where: { id: f.assigneeUserId }, select: { isActive: true, mamcosId: true } });
    if (!assignee?.isActive || (assignee.mamcosId ?? null) !== (parent.mamcosId ?? null)) throw new BadRequestException('Choose an active member of staff for the follow-up');
    const reviewer = parent.reviewerUserId && parent.reviewerUserId !== f.assigneeUserId ? parent.reviewerUserId : actor.id !== f.assigneeUserId ? actor.id : null;
    if (!reviewer) throw new BadRequestException('A follow-up needs a reviewer other than the worker');
    const t = await tx.farmTask.create({
      data: {
        mamcosId: parent.mamcosId, reference: await nextRef(tx, 'TK'), type: 'TASK', farmId: parent.farmId, plotId: parent.plotId, cropCycleId: parent.cropCycleId, activityType: f.activityType, title: f.title.trim(),
        instructions: f.instructions?.trim() || null, assigneeUserId: f.assigneeUserId, assignedByUserId: actor.id, reviewerUserId: reviewer, deadline: f.deadline ? new Date(f.deadline) : null,
        priority: f.priority ?? 'NORMAL', parentTaskId: parent.id,
      },
    });
    await this.event(tx, t.id, 'task.assigned', actor.id, null, 'ASSIGNED', `Follow-up to ${parent.reference}`);
    await this.event(tx, parent.id, 'task.follow_up_created', actor.id, null, null, `${t.reference}: ${t.title}`);
    await this.notify.tell([t.assigneeUserId], { type: 'FARM_TASK_ASSIGNED', title: 'New farm task (follow-up)', body: `${t.reference}: ${t.title}`, data: { taskId: t.id } });
    return t.id;
  }

  /** On approval: spend the inputs, write the crop activity, and let an inspection update the crop's growth stage. */
  private async onApproved(tx: Tx, task: { id: string; farmId: string; plotId: string | null; cropCycleId: string | null; assigneeUserId: string; type: string; activityType: string; mamcosId: string | null; reports: { inputs: unknown; actualEnd: Date | null; observations: string | null; photoUrls: string[]; workDoneQty: number | null }[]; inspection: { growthStage: string | null; observations: string | null; photoUrls: string[] } | null; checkIns: { kind: string; latitude: number; longitude: number }[] }, actor: User) {
    const report = task.reports[0];
    const used = (report?.inputs as { itemId: string; quantity: number }[] | null) ?? [];
    for (const u of used) {
      const r = await this.inputs.consume(tx, { itemId: u.itemId, quantity: u.quantity, taskId: task.id, farmId: task.farmId, plotId: task.plotId, cropCycleId: task.cropCycleId, employeeUserId: task.assigneeUserId, byUserId: actor.id });
      if (r.item.reorderLevel != null && r.left <= r.item.reorderLevel) await this.inputs.lowStockAlert(task.mamcosId, r.item.name, r.left, r.item.unit, r.item.reorderLevel);
    }
    if (task.cropCycleId && ACTIVITIES.includes(task.activityType)) {
      const gps = task.checkIns.find((c) => c.kind === 'CHECK_IN');
      await tx.activityLog.create({
        data: {
          cropCycleId: task.cropCycleId, activityType: task.activityType as ActivityType, activityDate: report?.actualEnd ?? new Date(), plotId: task.plotId,
          description: (report?.observations ?? task.inspection?.observations ?? null) as string | null, photoUrls: report?.photoUrls ?? task.inspection?.photoUrls ?? [], gpsLatitude: gps?.latitude, gpsLongitude: gps?.longitude,
          inputsUsed: used.length ? (used as unknown as Prisma.InputJsonValue) : undefined,
        },
      });
    }
    const stage = task.inspection?.growthStage;
    if (stage && task.cropCycleId) {
      await tx.cropCycle.update({ where: { id: task.cropCycleId }, data: { growthStage: stage as RiceGrowthStage, stageUpdatedAt: new Date() } });
      if (task.plotId) await tx.plot.update({ where: { id: task.plotId }, data: { currentStage: stage } });
    }
  }

  async cancel(id: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for cancelling');
    const t = await this.prisma.farmTask.findUnique({ where: { id } });
    assertVisible(actor, t, 'Task');
    if (FINAL.includes(t.status)) throw new ConflictException('This task is already closed');
    await this.prisma.$transaction(async (tx) => {
      await tx.farmTask.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.event(tx, id, 'task.cancelled', actor.id, t.status, 'CANCELLED', reason.trim());
    });
    await this.notify.tell([t.assigneeUserId], { type: 'FARM_TASK_CANCELLED', title: 'Task cancelled', body: `${t.reference}: ${reason.trim()}`, data: { taskId: id } });
    return this.detail(id, actor);
  }

  // ---------- supervision ----------

  async attendance(actor: Actor, f: { userId?: string; from?: string; to?: string; flagged?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    const rows = await this.prisma.taskCheckIn.findMany({
      where: {
        task: { ...scope(actor) }, ...(f.userId ? { userId: f.userId } : {}), ...(f.flagged === 'true' ? { withinGeofence: false } : {}),
        ...(f.from || to ? { serverTime: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { task: { select: { reference: true, title: true, geofenceM: true, farm: { select: { name: true } }, plot: { select: { plotCode: true } } } } },
      orderBy: { serverTime: 'desc' },
      take: 500,
    });
    const names = await this.names(rows.map((r) => r.userId));
    return rows.map((r) => ({ ...r, employee: names.get(r.userId) ?? null }));
  }

  async employeeSummary(actor: Actor, f: { from?: string; to?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    const tasks = await this.prisma.farmTask.findMany({
      where: { ...scope(actor), ...(f.from || to ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      select: { assigneeUserId: true, status: true, deadline: true, reviewDecision: true, checkIns: { select: { withinGeofence: true, kind: true } } },
    });
    const map = new Map<string, { assigned: number; completed: number; overdue: number; rejected: number; returned: number; checkIns: number; outside: number }>();
    for (const t of tasks) {
      const r = map.get(t.assigneeUserId) ?? { assigned: 0, completed: 0, overdue: 0, rejected: 0, returned: 0, checkIns: 0, outside: 0 };
      r.assigned += 1;
      if (t.status === 'COMPLETED') r.completed += 1;
      if (t.status === 'REJECTED') r.rejected += 1;
      if (t.status === 'RETURNED') r.returned += 1;
      if (t.deadline && t.deadline.getTime() < Date.now() && !FINAL.includes(t.status)) r.overdue += 1;
      for (const c of t.checkIns) if (c.kind === 'CHECK_IN') { r.checkIns += 1; if (c.withinGeofence === false) r.outside += 1; }
      map.set(t.assigneeUserId, r);
    }
    const names = await this.names([...map.keys()]);
    return [...map.entries()].map(([id, v]) => ({ userId: id, employee: names.get(id) ?? null, ...v })).sort((a, b) => b.assigned - a.assigned);
  }

  // ---------- reminders ----------

  /** Mornings: tell workers about work due within a day, and workers and managers about work that is late. Each notice is sent once. */
  @Cron('30 6 * * *', { name: 'farm-task-reminders', timeZone: 'Africa/Dar_es_Salaam' })
  async remind() {
    try {
      const soon = new Date(Date.now() + 24 * 3_600_000);
      const open = await this.prisma.farmTask.findMany({ where: { status: { notIn: FINAL as never[] }, deadline: { lt: soon } }, include: { farm: { select: { managerUserId: true } } }, take: 500 });
      for (const t of open) {
        const late = t.deadline!.getTime() < Date.now();
        const type = late ? 'task.overdue_notice' : 'task.due_soon_notice';
        if (await this.prisma.taskEvent.count({ where: { taskId: t.id, type } })) continue;
        await this.prisma.taskEvent.create({ data: { taskId: t.id, type, note: late ? 'Overdue' : 'Due within a day' } });
        await this.notify.tell(late ? [t.assigneeUserId, t.reviewerUserId, t.farm.managerUserId] : [t.assigneeUserId], {
          type: late ? 'FARM_TASK_OVERDUE' : 'FARM_TASK_DUE_SOON', title: late ? 'Farm task overdue' : 'Farm task due soon', body: `${t.reference}: ${t.title}`, data: { taskId: t.id },
        });
      }
    } catch (e) {
      this.logger.error(`Task reminders failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function assertCanSee(actor: Actor, mamcosId: string | null): boolean {
  return actor.role === 'SUPER_ADMIN' || (actor.mamcosId ?? null) === mamcosId;
}

export { owner };
