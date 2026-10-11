import { Injectable, NotFoundException } from '@nestjs/common';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { PrismaService } from '../prisma/prisma.service';
import { eatDay, isBackdated, lateByDays, taskView, TaskView } from './task-state';

const DAY_MS = 86_400_000;

export interface HistorySummary {
  /** Every scheduled activity in the calendar. */
  total: number;
  /** Activities whose due day has arrived (as of today, or the incident date). */
  due: number;
  onTime: number;
  late: number;
  missed: number;
  /** Past due, not done, not yet flagged missed. */
  overdue: number;
  upcoming: number;
  /** Share of due activities done on time; null when nothing was due yet. */
  onTimePct: number | null;
  /** Share of due activities done at all (on time or late). */
  completedPct: number | null;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

/**
 * The farmer's rice-farming record for one crop cycle: which scheduled activities were done on
 * time, late or never, with the dates the system recorded, plus every extra activity they logged.
 * This is what an insurance reviewer reads to see whether the required practices were followed.
 */
@Injectable()
export class FarmingHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  private summarise(
    tasks: { view: TaskView; dueDate: Date }[],
    asOf: Date,
  ): HistorySummary {
    const day = eatDay(asOf);
    const count = (v: TaskView[]) => tasks.filter((t) => v.includes(t.view)).length;
    const due = tasks.filter((t) => eatDay(t.dueDate) <= day);
    const dueCount = (v: TaskView[]) => due.filter((t) => v.includes(t.view)).length;
    const onTime = dueCount(['ON_TIME']);
    const late = dueCount(['LATE']);
    return {
      total: tasks.length,
      due: due.length,
      onTime,
      late,
      missed: dueCount(['MISSED']),
      overdue: dueCount(['OVERDUE']),
      upcoming: count(['UPCOMING', 'DUE_SOON']) - dueCount(['UPCOMING', 'DUE_SOON']),
      onTimePct: pct(onTime, due.length),
      completedPct: pct(onTime + late, due.length),
    };
  }

  /** `incidentDate` (a claim) adds the same counts as of that day: what had been required by then. */
  async forCycle(cropCycleId: string, user: RequestUser, incidentDate?: Date) {
    const cycle = await this.prisma.cropCycle.findUnique({
      where: { id: cropCycleId },
      include: {
        farm: { select: { farmCode: true, village: true, mamcosId: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
        variety: { select: { id: true, name: true, maturityDays: true } },
        calendarTasks: { orderBy: { dueDate: 'asc' } },
        activities: { orderBy: { activityDate: 'asc' } },
      },
    });
    if (!cycle) throw new NotFoundException('Crop cycle not found');
    await this.ownership.assertFarmAccess(user, cycle.farmId);

    const now = new Date();
    const scheduledActivityIds = new Set(
      cycle.calendarTasks.map((t) => t.activityLogId).filter((id): id is string => !!id),
    );
    const scheduled = cycle.calendarTasks.map((t) => {
      const view = taskView(t, now);
      return {
        taskId: t.id,
        key: t.taskKey,
        title: t.title,
        view,
        status: t.status,
        dueDate: t.dueDate,
        originalDueDate: t.originalDueDate ?? t.dueDate,
        rescheduled: t.rescheduleCount > 0 || eatDay(t.originalDueDate ?? t.dueDate) !== eatDay(t.dueDate),
        rescheduleReason: t.rescheduleReason,
        reminderSentAt: t.reminderSentAt,
        missedAt: t.missedAt,
        completedAt: t.completedAt,
        /** When the system, not the phone, received the completion. */
        recordedAt: t.recordedAt,
        lateByDays: lateByDays(t),
        /** The phone reported a completion date long before the server received it. */
        backdated: isBackdated(t),
        photoCount: t.photoUrls.length,
        photoUrls: t.photoUrls,
        measurements: t.measurements,
        calendarVersion: t.protocolVersion,
      };
    });
    const extra = cycle.activities
      .filter((a) => !scheduledActivityIds.has(a.id))
      .map((a) => ({
        activityId: a.id,
        activityType: a.activityType,
        activityDate: a.activityDate,
        description: a.description,
        photoCount: a.photoUrls.length,
        photoUrls: a.photoUrls,
      }));

    return {
      cropCycle: {
        id: cycle.id,
        season: cycle.season,
        status: cycle.status,
        farmCode: cycle.farm.farmCode,
        village: cycle.farm.village,
        farmer: `${cycle.farmer.firstName} ${cycle.farmer.lastName}`.trim(),
        farmerControlNumber: cycle.farmer.controlNumber,
        variety: cycle.variety?.name ?? cycle.riceVariety ?? null,
        maturityDays: cycle.variety?.maturityDays ?? null,
        plantingDate: cycle.plantingDate,
        expectedHarvest: cycle.expectedHarvest,
        harvestDate: cycle.harvestDate,
      },
      generatedAt: now,
      summary: this.summarise(scheduled, now),
      ...(incidentDate
        ? {
            incidentDate,
            summaryAtIncident: this.summarise(scheduled, incidentDate),
            extraBeforeIncident: extra.filter((a) => eatDay(a.activityDate) <= eatDay(incidentDate)).length,
          }
        : {}),
      scheduled,
      extra,
    };
  }

  /** The farming record behind an insurance claim. Staff review any claim in their reach; a farmer sees their own. */
  async forClaim(claimId: string, user: RequestUser) {
    const claim = await this.prisma.insuranceClaim.findUnique({
      where: { id: claimId },
      include: { policy: { select: { farmerId: true, farmId: true, cropCycleId: true } } },
    });
    if (!claim) throw new NotFoundException('Claim not found');

    if (user.role === 'FARMER') {
      const farmer = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!farmer || farmer.id !== claim.policy.farmerId) {
        throw new NotFoundException('Claim not found');
      }
    }

    const claimInfo = {
      id: claim.id,
      incidentDate: claim.incidentDate,
      incidentType: claim.incidentType,
      status: claim.status,
      claimedAmount: claim.claimedAmount,
    };
    const cycleId = claim.policy.cropCycleId ?? (await this.cycleCovering(claim.policy, claim.incidentDate));
    if (!cycleId) {
      return {
        claim: claimInfo,
        cropCycle: null,
        message:
          'No crop cycle is linked to this policy, and none of the farm’s crop cycles covers the incident date, so there is no farming record to show.',
      };
    }
    return { claim: claimInfo, ...(await this.forCycle(cycleId, user, claim.incidentDate)) };
  }

  /** The farm's crop cycle that was growing on the incident date. */
  private async cycleCovering(policy: { farmId: string | null; farmerId: string }, incident: Date) {
    if (!policy.farmId) return null;
    const cycles = await this.prisma.cropCycle.findMany({
      where: { farmId: policy.farmId, farmerId: policy.farmerId, plantingDate: { lte: incident } },
      orderBy: { plantingDate: 'desc' },
      select: { id: true, harvestDate: true, expectedHarvest: true },
    });
    const covering = cycles.find((c) => {
      const end = c.harvestDate ?? c.expectedHarvest;
      return !end || end.getTime() + 30 * DAY_MS >= incident.getTime();
    });
    return covering?.id ?? null;
  }
}
