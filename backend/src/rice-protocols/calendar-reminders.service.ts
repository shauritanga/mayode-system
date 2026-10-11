import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CalendarTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../messaging/sms.service';
import { SettingsService } from '../settings/settings.service';
import { missedMessage, reminderMessage, toLang } from './calendar-messages';
import { eatDay, isDueForReminder, isMissed } from './task-state';

const DAY_MS = 86_400_000;
const BATCH = 500;
/** Overdue by more than this many days when first noticed: record it, but do not message about it. */
const STALE_DAYS = 14;

/**
 * Daily at 07:00 Tanzanian time: remind farmers of activities due tomorrow (and today), and mark
 * activities that were not done a day after their due date as missed, telling the farmer once.
 * Each step claims the task in the database first (reminderSentAt / status), so running the job
 * twice, or two servers running it, never sends the same message twice.
 */
@Injectable()
export class CalendarRemindersService {
  private readonly logger = new Logger(CalendarRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
    private readonly settings: SettingsService,
  ) {}

  @Cron(process.env.CALENDAR_REMINDER_CRON || '0 7 * * *', {
    name: 'rice-calendar-reminders',
    timeZone: 'Africa/Dar_es_Salaam',
  })
  async run(): Promise<void> {
    try {
      const missed = await this.markMissed();
      const reminded = await this.sendReminders();
      if (missed || reminded)
        this.logger.log(
          `Rice calendar: ${reminded} reminder(s), ${missed} missed`,
        );
    } catch (e) {
      this.logger.error(
        `Rice calendar reminders failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private include = {
    cropCycle: {
      select: {
        id: true,
        status: true,
        farm: { select: { farmCode: true } },
        farmer: {
          select: {
            user: { select: { id: true, phone: true, language: true } },
          },
        },
      },
    },
  } as const;

  private active = {
    cropCycle: {
      status: { in: ['PLANNED', 'ACTIVE'] as ('PLANNED' | 'ACTIVE')[] },
    },
  };

  async sendReminders(now = new Date()): Promise<number> {
    const { reminderLeadDays, reminderBySms } =
      await this.settings.getCalendarSettings();
    const tasks = await this.prisma.riceCalendarTask.findMany({
      where: {
        status: CalendarTaskStatus.PENDING,
        reminderSentAt: null,
        dueDate: {
          gte: new Date(now.getTime() - DAY_MS),
          lte: new Date(now.getTime() + (reminderLeadDays + 2) * DAY_MS),
        },
        ...this.active,
      },
      include: this.include,
      take: BATCH,
    });
    let sent = 0;
    for (const task of tasks) {
      if (!isDueForReminder(task, now, reminderLeadDays)) continue;
      const claimed = await this.prisma.riceCalendarTask.updateMany({
        where: {
          id: task.id,
          status: CalendarTaskStatus.PENDING,
          reminderSentAt: null,
        },
        data: { reminderSentAt: now },
      });
      if (!claimed.count) continue;
      const user = task.cropCycle.farmer.user;
      if (!user) continue;
      const msg = reminderMessage({
        lang: toLang(user.language),
        title: task.title,
        farmCode: task.cropCycle.farm.farmCode,
        daysAhead: eatDay(task.dueDate) - eatDay(now),
      });
      await this.notifications.create({
        userId: user.id,
        type: 'rice.task.reminder',
        title: msg.title,
        body: msg.body,
        data: { cropCycleId: task.cropCycleId, taskId: task.id },
      });
      if (reminderBySms && user.phone)
        await this.sms.send(user.phone, msg.sms, 'rice_task_reminder');
      sent++;
    }
    return sent;
  }

  /**
   * Flags overdue activities as missed. Work that was already long overdue when this feature was
   * switched on is marked (the record must be true) but the farmer is not messaged about it.
   */
  async markMissed(now = new Date()): Promise<number> {
    const { missedGraceDays, reminderBySms } =
      await this.settings.getCalendarSettings();
    let marked = 0;
    for (let page = 0; page < 20; page++) {
      const tasks = await this.prisma.riceCalendarTask.findMany({
        where: {
          status: CalendarTaskStatus.PENDING,
          dueDate: {
            lt: new Date(now.getTime() - (missedGraceDays - 1) * DAY_MS),
          },
          ...this.active,
        },
        include: this.include,
        orderBy: { dueDate: 'asc' },
        take: BATCH,
      });
      let progressed = 0;
      for (const task of tasks) {
        if (!isMissed(task, now, missedGraceDays)) continue;
        const stale = eatDay(now) - eatDay(task.dueDate) > STALE_DAYS;
        const claimed = await this.prisma.riceCalendarTask.updateMany({
          where: { id: task.id, status: CalendarTaskStatus.PENDING },
          data: {
            status: CalendarTaskStatus.MISSED,
            missedAt: now,
            ...(stale ? {} : { missedNotifiedAt: now }),
          },
        });
        if (!claimed.count) continue;
        progressed++;
        marked++;
        const user = task.cropCycle.farmer.user;
        if (stale || !user) continue;
        const msg = missedMessage({
          lang: toLang(user.language),
          title: task.title,
          farmCode: task.cropCycle.farm.farmCode,
          dueDate: task.dueDate,
        });
        await this.notifications.create({
          userId: user.id,
          type: 'rice.task.missed',
          title: msg.title,
          body: msg.body,
          data: { cropCycleId: task.cropCycleId, taskId: task.id },
        });
        if (reminderBySms && user.phone)
          await this.sms.send(user.phone, msg.sms, 'rice_task_missed');
      }
      if (tasks.length < BATCH || progressed === 0) break;
    }
    return marked;
  }
}
