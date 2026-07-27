import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  AlertCategory,
  AlertStatus,
  AlertUrgency,
  CropCycleStatus,
  FarmAlert,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MembershipsService } from '../memberships/memberships.service';
import { RequestUser } from '../common/ownership.service';
import { CreateFarmAlertDto } from './dto/farm-alerts.dto';

const STAFF_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * Public shape of an alert. Premium fields (recommendation, actionDetails,
 * expectedActionDate) are present ONLY for members/staff; free users get
 * `locked: true` plus a membership CTA. This stripping happens server-side so
 * premium content never leaves the API for non-members.
 */
export interface PublicAlert {
  id: string;
  farmId: string;
  farmCode?: string;
  farmName?: string;
  plotId?: string | null;
  category: AlertCategory;
  urgency: AlertUrgency;
  title: string;
  previewMessage: string;
  status: AlertStatus;
  createdAt: Date;
  locked: boolean;
  recommendation?: string | null;
  actionDetails?: string | null;
  expectedActionDate?: Date | null;
  membershipCta?: string;
}

type AlertWithFarm = FarmAlert & {
  farm?: { farmCode: string; name: string | null; farmerId: string | null } | null;
};

@Injectable()
export class FarmAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly memberships: MembershipsService,
  ) {}

  private isStaff(user: RequestUser): boolean {
    return STAFF_ROLES.includes(user.role);
  }

  private toPublic(alert: AlertWithFarm, isPremium: boolean): PublicAlert {
    const base: PublicAlert = {
      id: alert.id,
      farmId: alert.farmId,
      farmCode: alert.farm?.farmCode,
      farmName: alert.farm?.name ?? undefined,
      plotId: alert.plotId,
      category: alert.category,
      urgency: alert.urgency,
      title: alert.title,
      previewMessage: alert.previewMessage,
      status: alert.status,
      createdAt: alert.createdAt,
      locked: !isPremium,
    };
    if (isPremium) {
      base.recommendation = alert.recommendation;
      base.actionDetails = alert.actionDetails;
      base.expectedActionDate = alert.expectedActionDate;
    } else {
      base.membershipCta =
        'An important recommendation is available for this farm. Activate your MAYOData membership to view the full analysis and recommended action.';
    }
    return base;
  }

  // ----------------------------------------------------------------- create

  /**
   * Create an alert (idempotent on dedupeKey for OPEN alerts) and notify the
   * farm's farmer with a deep-link. Returns the raw record (internal callers).
   */
  async createAlert(
    input: CreateFarmAlertDto & { farmerId?: string; farmingSeasonId?: string; dedupeKey?: string },
  ): Promise<FarmAlert | null> {
    const farm = await this.prisma.farm.findUnique({
      where: { id: input.farmId },
      select: { id: true, farmCode: true, name: true, farmerId: true },
    });
    if (!farm) throw new NotFoundException(`Farm ${input.farmId} not found`);

    if (input.dedupeKey) {
      const existing = await this.prisma.farmAlert.findFirst({
        where: { dedupeKey: input.dedupeKey, status: AlertStatus.OPEN },
        select: { id: true },
      });
      if (existing) return null; // already an open alert of this kind
    }

    const alert = await this.prisma.farmAlert.create({
      data: {
        farmId: input.farmId,
        plotId: input.plotId,
        farmerId: input.farmerId ?? farm.farmerId,
        farmingSeasonId: input.farmingSeasonId,
        cropCycleId: input.cropCycleId,
        category: input.category,
        urgency: input.urgency ?? AlertUrgency.MEDIUM,
        title: input.title,
        previewMessage: input.previewMessage,
        recommendation: input.recommendation,
        actionDetails: input.actionDetails,
        expectedActionDate: input.expectedActionDate
          ? new Date(input.expectedActionDate)
          : undefined,
        dedupeKey: input.dedupeKey,
      },
    });

    // Notify the farm's farmer (deep-links to the alert; the mobile app shows a
    // teaser to free users and the full detail to members).
    const recipientFarmerId = alert.farmerId ?? farm.farmerId;
    const farmer = recipientFarmerId ? await this.prisma.farmer.findUnique({
      where: { id: recipientFarmerId },
      select: { userId: true },
    }) : null;
    if (farmer) {
      await this.notifications.create({
        userId: farmer.userId,
        type: 'farm.alert',
        title: alert.title,
        body: alert.previewMessage,
        data: { alertId: alert.id, farmId: farm.id },
      });
    }
    return alert;
  }

  // -------------------------------------------------------------- read (gated)

  private async premiumForUser(user: RequestUser): Promise<boolean> {
    return this.memberships.hasPremiumAccess(user);
  }

  /** Alerts on farms the user owns or is the target farmer of. */
  async listForUser(user: RequestUser): Promise<PublicAlert[]> {
    const isPremium = await this.premiumForUser(user);

    let where: Prisma.FarmAlertWhereInput;
    if (this.isStaff(user)) {
      where = {};
    } else {
      const farmer = await this.prisma.farmer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!farmer) return [];
      where = {
        OR: [{ farm: { farmerId: farmer.id } }, { farmerId: farmer.id }],
      };
    }

    const alerts = await this.prisma.farmAlert.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: { farm: { select: { farmCode: true, name: true, farmerId: true } } },
    });
    return alerts.map((a) => this.toPublic(a, isPremium));
  }

  async getOne(id: string, user: RequestUser): Promise<PublicAlert> {
    const alert = await this.prisma.farmAlert.findUnique({
      where: { id },
      include: { farm: { select: { farmCode: true, name: true, farmerId: true } } },
    });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    await this.assertAccess(alert, user);
    const isPremium = await this.premiumForUser(user);
    return this.toPublic(alert, isPremium);
  }

  /** Mark an alert done. Members/staff only (matches who can act on it). */
  async complete(id: string, user: RequestUser): Promise<PublicAlert> {
    const alert = await this.prisma.farmAlert.findUnique({
      where: { id },
      include: { farm: { select: { farmCode: true, name: true, farmerId: true } } },
    });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    await this.assertAccess(alert, user);

    if (!(await this.premiumForUser(user))) {
      throw new ForbiddenException('MEMBERSHIP_REQUIRED');
    }

    const updated = await this.prisma.farmAlert.update({
      where: { id },
      data: {
        status: AlertStatus.COMPLETED,
        completedAt: new Date(),
        completedByUserId: user.id,
      },
      include: { farm: { select: { farmCode: true, name: true, farmerId: true } } },
    });
    return this.toPublic(updated, true);
  }

  private async assertAccess(alert: AlertWithFarm, user: RequestUser): Promise<void> {
    if (this.isStaff(user)) return;
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    const ok =
      farmer && (alert.farm?.farmerId === farmer.id || alert.farmerId === farmer.id);
    if (!ok) throw new ForbiddenException('You cannot access this alert');
  }

  // -------------------------------------------------------------- generator

  /**
   * Rule-based alert generation from crop-cycle timing and recorded activities.
   * Idempotent via dedupeKey. Returns the number of new alerts created.
   */
  async generateForFarm(farmId: string): Promise<number> {
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: {
        id: true,
        farmerId: true,
        cropCycles: {
          where: { status: { in: [CropCycleStatus.PLANNED, CropCycleStatus.ACTIVE] } },
          include: { activities: { select: { activityType: true } } },
        },
      },
    });
    if (!farm) throw new NotFoundException(`Farm ${farmId} not found`);

    const now = Date.now();
    let created = 0;
    const add = async (input: Parameters<FarmAlertsService['createAlert']>[0]) => {
      const a = await this.createAlert({ ...input, farmId });
      if (a) created += 1;
    };

    for (const cycle of farm.cropCycles) {
      // 1. Harvest approaching (within 14 days)
      if (
        cycle.expectedHarvest &&
        cycle.expectedHarvest.getTime() - now <= 14 * DAY &&
        cycle.expectedHarvest.getTime() - now > 0
      ) {
        await add({
          farmId,
          category: AlertCategory.HARVEST,
          urgency: AlertUrgency.HIGH,
          title: 'Harvesting time is approaching',
          previewMessage:
            'Harvest is due soon for this farm. Open the recommendation to review timing and preparation.',
          recommendation:
            'Your crop is nearing maturity. Confirm grain moisture and arrange labour and drying space before harvest.',
          actionDetails:
            'Plan harvest within the coming two weeks; secure transport and storage to reduce post-harvest loss.',
          expectedActionDate: cycle.expectedHarvest.toISOString(),
          cropCycleId: cycle.id,
          dedupeKey: `harvest:${cycle.id}`,
        });
      }

      // 2. Planting overdue (planned but planting date passed)
      if (
        cycle.status === CropCycleStatus.PLANNED &&
        cycle.plantingDate &&
        cycle.plantingDate.getTime() < now
      ) {
        await add({
          farmId,
          category: AlertCategory.ACTIVITY_OVERDUE,
          urgency: AlertUrgency.MEDIUM,
          title: 'A farm activity is overdue',
          previewMessage:
            'A planned activity for this farm appears overdue. Open to review the detected issue.',
          recommendation:
            'Planting was scheduled but is not yet recorded as done. Confirm planting status or update the crop cycle.',
          actionDetails: 'Record the planting activity or reschedule the crop cycle for this season.',
          cropCycleId: cycle.id,
          dedupeKey: `planting-overdue:${cycle.id}`,
        });
      }

      // 3. Fertilizer due (active, >21 days since planting, no fertilizing logged)
      const fertilized = cycle.activities.some(
        (x) => x.activityType === ActivityType.FERTILIZING,
      );
      if (
        cycle.status === CropCycleStatus.ACTIVE &&
        cycle.plantingDate &&
        now - cycle.plantingDate.getTime() >= 21 * DAY &&
        !fertilized
      ) {
        await add({
          farmId,
          category: AlertCategory.FERTILIZER,
          urgency: AlertUrgency.HIGH,
          title: 'Fertilizer application is due',
          previewMessage:
            'Fertilizer may be required for this farm. Open the recommendation to review the suggested action.',
          recommendation:
            'No fertilizer application has been recorded ~3 weeks after planting. Top-dressing is typically due now.',
          actionDetails:
            'Apply the recommended nitrogen top-dressing and record it under farm activities.',
          cropCycleId: cycle.id,
          dedupeKey: `fertilizer:${cycle.id}`,
        });
      }
    }
    return created;
  }

  /** Run the generator across every farm (admin/scheduled). */
  async generateAll(): Promise<{ farms: number; created: number }> {
    const farms = await this.prisma.farm.findMany({ select: { id: true } });
    let created = 0;
    for (const f of farms) created += await this.generateForFarm(f.id);
    return { farms: farms.length, created };
  }
}
