import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MeetingsService } from './meetings.service';

@Injectable()
export class MeetingsScheduler {
  private readonly logger = new Logger(MeetingsScheduler.name);
  constructor(private readonly meetings: MeetingsService) {}

  /** Every hour: remind everyone invited to a meeting that is less than a day away (once per meeting). */
  @Cron(process.env.MEETING_REMINDER_CRON || '0 * * * *', { name: 'meeting-reminders' })
  async remind() {
    try { const n = await this.meetings.sendReminders(); if (n) this.logger.log(`Sent reminders for ${n} meeting(s)`); }
    catch (e) { this.logger.error(`Meeting reminders failed: ${e instanceof Error ? e.message : e}`); }
  }
}
