import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';

const REMINDER_WINDOW_DAYS = 3;
const REMINDER_COOLDOWN_HOURS = 24;

/**
 * Daily A/R and A/P housekeeping. A/R: SMS the buyer for any invoice due
 * within REMINDER_WINDOW_DAYS or already overdue, at most once per
 * REMINDER_COOLDOWN_HOURS. A/P: an in-app/push notification to
 * SUPER_ADMIN/ADMIN for bills in the same window — internal, not SMS, since
 * it's the cooperative's own payable, not owed by a third party. Schedule is
 * configurable via `RECEIVABLES_CRON` (default daily at 07:00), mirroring
 * MembershipSchedulerService's pattern.
 */
@Injectable()
export class ReceivablesSchedulerService {
  private readonly logger = new Logger(ReceivablesSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(process.env.RECEIVABLES_CRON || CronExpression.EVERY_DAY_AT_7AM, {
    name: 'receivables-payables-reminders',
  })
  async run(): Promise<void> {
    try {
      const [remindersSent, notified] = await Promise.all([
        this.remindReceivables(),
        this.remindPayables(),
      ]);
      if (remindersSent > 0 || notified > 0) {
        this.logger.log(
          `A/R reminders: ${remindersSent} sent; A/P notices: ${notified}`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Receivables/payables reminder job failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async remindReceivables(): Promise<number> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 86_400_000);
    const cooldownCutoff = new Date(now.getTime() - REMINDER_COOLDOWN_HOURS * 3_600_000);

    await this.prisma.invoice.updateMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });

    const due = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['OPEN', 'OVERDUE'] },
        dueDate: { lte: windowEnd },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cooldownCutoff } }],
      },
      include: { buyer: true },
    });

    let sent = 0;
    for (const invoice of due) {
      const phone = invoice.buyer?.contactPhone;
      if (!phone) continue;
      const overdue = invoice.dueDate < now;
      const message = overdue
        ? `MAYODE: Invoice ${invoice.invoiceNumber} for TZS ${invoice.amount.toLocaleString()} is overdue (was due ${invoice.dueDate.toLocaleDateString()}). Please settle at your earliest convenience.`
        : `MAYODE: Invoice ${invoice.invoiceNumber} for TZS ${invoice.amount.toLocaleString()} is due ${invoice.dueDate.toLocaleDateString()}. Thank you.`;
      await this.sms.send(phone, message, 'invoice_reminder');
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { lastReminderAt: now, reminderCount: { increment: 1 } },
      });
      sent += 1;
    }
    return sent;
  }

  async remindPayables(): Promise<number> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 86_400_000);

    await this.prisma.bill.updateMany({
      where: { status: 'OPEN', dueDate: { lt: now } },
      data: { status: 'OVERDUE' },
    });

    const due = await this.prisma.bill.findMany({
      where: { status: { in: ['OPEN', 'OVERDUE'] }, dueDate: { lte: windowEnd } },
    });
    if (due.length === 0) return 0;

    const totalDue = due.reduce((sum, bill) => sum + bill.amount, 0);
    await this.notifications.createForRoles([UserRole.SUPER_ADMIN, UserRole.ADMIN], {
      title: 'Bills due soon',
      body: `${due.length} bill(s) totalling TZS ${totalDue.toLocaleString()} are due within ${REMINDER_WINDOW_DAYS} days or overdue.`,
      type: 'BILL_DUE',
    });
    return due.length;
  }
}
