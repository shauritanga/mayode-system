import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  MembershipDurationType,
  MembershipStatus,
  PaymentStatus,
  PaymentType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../messaging/sms.service';
import { ClickPesaService } from '../payments/clickpesa.service';
import {
  ApproveMembershipDto,
  CreateMembershipPlanDto,
  StartMembershipDto,
} from './dto/memberships.dto';

/** ClickPesa statuses that mean the money was collected. */
const PAID_STATUSES = ['SUCCESS', 'SETTLED'];

/** Roles that always see premium data (staff), no membership required. */
const PREMIUM_BYPASS_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

/** Statuses that grant premium access (paid, waived, or sponsored). */
const ACTIVE_STATUSES: MembershipStatus[] = [
  MembershipStatus.ACTIVE,
  MembershipStatus.WAIVED,
  MembershipStatus.SPONSORED,
];

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly clickPesa: ClickPesaService,
    private readonly sms: SmsService,
  ) {}

  // ---------------------------------------------------------------- plans

  listPlans() {
    return this.prisma.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: { priceTzs: 'asc' },
    });
  }

  createPlan(dto: CreateMembershipPlanDto) {
    return this.prisma.membershipPlan.create({
      data: {
        name: dto.name,
        description: dto.description,
        priceTzs: dto.priceTzs,
        durationType: dto.durationType ?? MembershipDurationType.SEASON,
        features: dto.features ?? [],
        isActive: dto.isActive ?? true,
      },
    });
  }

  // ----------------------------------------------------------- membership

  /** Latest membership for the user plus a computed `active` flag. */
  async myMembership(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, farmingSeason: true },
    });
    return {
      active: await this.hasActiveMembership(userId),
      membership,
    };
  }

  /**
   * Backend source of truth for premium access. True when the user has a
   * membership in an active status whose end date (if set) is in the future.
   */
  async hasActiveMembership(userId: string): Promise<boolean> {
    const now = new Date();
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: { in: ACTIVE_STATUSES },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      select: { id: true },
    });
    return membership !== null;
  }

  /** Staff roles bypass the membership requirement. */
  async hasPremiumAccess(user: { id: string; role: UserRole }): Promise<boolean> {
    if (PREMIUM_BYPASS_ROLES.includes(user.role)) return true;
    return this.hasActiveMembership(user.id);
  }

  /** ClickPesa requires an alphanumeric order reference — generate a unique one. */
  private generateOrderReference(): string {
    return `MYD${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toUpperCase();
  }

  /**
   * Start a membership: creates a PAYMENT_PENDING membership plus a pending
   * MEMBERSHIP payment. When ClickPesa is configured, a mobile-money USSD/PIN
   * prompt is pushed to the payer's phone and the membership activates on
   * webhook/poll reconciliation. Otherwise it awaits manual admin approval.
   */
  async start(user: { id: string; phone?: string }, dto: StartMembershipDto) {
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Membership plan not found');
    }

    if (await this.hasActiveMembership(user.id)) {
      throw new BadRequestException('You already have an active membership');
    }

    if (dto.farmingSeasonId) {
      const season = await this.prisma.farmingSeason.findUnique({
        where: { id: dto.farmingSeasonId },
        select: { id: true },
      });
      if (!season) throw new NotFoundException('Farming season not found');
    }

    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true, farmer: { select: { id: true } } },
    });
    const farmer = account?.farmer;
    const payViaClickPesa = this.clickPesa.isConfigured();
    const phoneNumber = dto.phoneNumber?.trim() || account?.phone || undefined;

    if (payViaClickPesa && !phoneNumber) {
      throw new BadRequestException('A mobile-money phone number is required');
    }

    const orderReference = this.generateOrderReference();

    const membership = await this.prisma.$transaction(async (tx) => {
      const created = await tx.membership.create({
        data: {
          userId: user.id,
          farmerId: farmer?.id,
          planId: plan.id,
          farmingSeasonId: dto.farmingSeasonId,
          status: MembershipStatus.PAYMENT_PENDING,
          paymentStatus: PaymentStatus.PENDING,
          amountTzs: plan.priceTzs,
          orderReference,
        },
        include: { plan: true, farmingSeason: true },
      });

      if (farmer) {
        await tx.payment.create({
          data: {
            farmerId: farmer.id,
            membershipId: created.id,
            amount: plan.priceTzs,
            paymentType: PaymentType.MEMBERSHIP,
            status: PaymentStatus.PENDING,
            orderReference,
            description: `MAYOData membership: ${plan.name}`,
          },
        });
      }
      return created;
    });

    if (!payViaClickPesa) {
      return {
        membership,
        paymentProvider: 'manual' as const,
        message:
          'Membership requested. An administrator will confirm your payment to activate it.',
      };
    }

    // Push the mobile-money prompt. If the push itself fails, surface the error
    // but keep the pending membership so the user can retry.
    try {
      const push = await this.clickPesa.initiateUssdPush({
        amount: String(plan.priceTzs),
        orderReference,
        phoneNumber: phoneNumber!,
      });
      return {
        membership,
        paymentProvider: 'clickpesa' as const,
        orderReference,
        pushStatus: push.status,
        message:
          'Check your phone and enter your mobile-money PIN to complete the payment.',
      };
    } catch (e) {
      throw new BadRequestException(
        `Could not start mobile-money payment: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * Reconcile a ClickPesa order: re-query the authoritative status and activate
   * the membership if paid (or mark the payment failed). Safe to call from the
   * webhook and from mobile polling; idempotent once active. Returns the current
   * membership status.
   */
  async reconcilePayment(orderReference: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { orderReference },
      include: { plan: true, farmingSeason: true },
    });
    if (!membership) {
      throw new NotFoundException(`No membership for order ${orderReference}`);
    }
    if (ACTIVE_STATUSES.includes(membership.status)) {
      return { status: membership.status, active: true };
    }

    const payment = this.clickPesa.isConfigured()
      ? await this.clickPesa.queryPayment(orderReference)
      : null;

    if (payment && PAID_STATUSES.includes(payment.status)) {
      await this.activate(membership.id, {
        paymentReference: payment.paymentReference ?? payment.id,
      });
      return { status: MembershipStatus.ACTIVE, active: true };
    }

    if (payment && payment.status === 'FAILED') {
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      await this.prisma.payment.updateMany({
        where: { orderReference },
        data: { status: PaymentStatus.FAILED },
      });
      await this.notifications.create({
        userId: membership.userId,
        type: 'membership.payment_failed',
        title: 'Payment not completed',
        body: 'Your membership payment was not completed. You can try again from the Membership screen.',
        data: { membershipId: membership.id },
      });
      return { status: membership.status, active: false, paymentStatus: 'FAILED' };
    }

    // Still processing / pending.
    return { status: membership.status, active: false, paymentStatus: payment?.status ?? 'PENDING' };
  }

  /** Mobile poll: re-query the user's latest pending membership if any. */
  async reconcileForUser(userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { orderReference: true, status: true },
    });
    if (!membership) return { active: false, status: null };
    if (ACTIVE_STATUSES.includes(membership.status) || !membership.orderReference) {
      return { active: ACTIVE_STATUSES.includes(membership.status), status: membership.status };
    }
    return this.reconcilePayment(membership.orderReference);
  }

  /**
   * Activate a membership and its payment. Dates come from the linked farming
   * season when present, otherwise one year from activation.
   */
  private async activate(
    id: string,
    opts: { paymentReference?: string; approvedByUserId?: string },
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      include: { plan: true, farmingSeason: true },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    const now = new Date();
    const startDate = membership.farmingSeason?.startDate ?? now;
    const endDate =
      membership.farmingSeason?.endDate ??
      new Date(new Date(now).setFullYear(now.getFullYear() + 1));

    const updated = await this.prisma.$transaction(async (tx) => {
      const m = await tx.membership.update({
        where: { id },
        data: {
          status: MembershipStatus.ACTIVE,
          paymentStatus: PaymentStatus.CLEARED,
          paymentReference: opts.paymentReference,
          startDate,
          endDate,
          activatedAt: now,
          approvedByUserId: opts.approvedByUserId,
        },
        include: { plan: true, farmingSeason: true },
      });
      await tx.payment.updateMany({
        where: { membershipId: id },
        data: {
          status: PaymentStatus.CLEARED,
          mpesaRef: opts.paymentReference,
          paidAt: now,
        },
      });
      return m;
    });

    await this.notifications.create({
      userId: membership.userId,
      type: 'membership.activated',
      title: 'Membership activated',
      body: `Your ${membership.plan.name} membership is now active. Premium analytics and recommendations are unlocked.`,
      data: { membershipId: membership.id },
    });

    return updated;
  }

  /**
   * Manual activation by an admin (sponsored/waived, or when ClickPesa isn't
   * used). Payment confirmation is trusted to the approving staff member.
   */
  async approve(id: string, approvedByUserId: string, dto: ApproveMembershipDto) {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    if (ACTIVE_STATUSES.includes(membership.status)) {
      throw new BadRequestException('Membership is already active');
    }
    return this.activate(id, {
      paymentReference: dto.paymentReference,
      approvedByUserId,
    });
  }

  // ------------------------------------------------------------ expiry job

  /**
   * Expiry housekeeping (owner comment/prompt §23), run daily by the scheduler
   * and callable by an admin:
   *  - memberships expiring within `windowDays` get a one-time renewal reminder
   *    (in-app + push + SMS);
   *  - memberships already past their end date flip ACTIVE → EXPIRED with a
   *    notice. Expiry never touches farm/ownership/activity data — only the
   *    premium entitlement lapses.
   */
  async processExpiries(windowDays = Number(process.env.MEMBERSHIP_REMINDER_DAYS) || 7) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    // 1. Renewal reminders for memberships expiring soon (once each).
    const expiringSoon = await this.prisma.membership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        endDate: { gte: now, lte: windowEnd },
        expiryReminderSentAt: null,
      },
      include: { plan: { select: { name: true } }, user: { select: { phone: true } } },
    });
    for (const m of expiringSoon) {
      const when = m.endDate ? m.endDate.toLocaleDateString('en-GB') : 'soon';
      const msg = `Your MAYOData ${m.plan.name} membership expires on ${when}. Renew to keep premium analytics and recommendations.`;
      await this.notifications.create({
        userId: m.userId,
        type: 'membership.expiring',
        title: 'Membership expiring soon',
        body: msg,
        data: { membershipId: m.id },
      });
      if (m.user?.phone) await this.sms.send(m.user.phone, `MAYOData: ${msg}`, 'membership_expiry');
      await this.prisma.membership.update({
        where: { id: m.id },
        data: { expiryReminderSentAt: now },
      });
    }

    // 2. Expire memberships past their end date.
    const overdue = await this.prisma.membership.findMany({
      where: { status: MembershipStatus.ACTIVE, endDate: { lt: now } },
      include: { plan: { select: { name: true } } },
    });
    for (const m of overdue) {
      await this.prisma.membership.update({
        where: { id: m.id },
        data: { status: MembershipStatus.EXPIRED },
      });
      await this.notifications.create({
        userId: m.userId,
        type: 'membership.expired',
        title: 'Membership expired',
        body: `Your MAYOData ${m.plan.name} membership has expired. Your farm records are safe — renew any time to unlock premium analytics again.`,
        data: { membershipId: m.id },
      });
    }

    return { remindersSent: expiringSoon.length, expired: overdue.length };
  }
}
