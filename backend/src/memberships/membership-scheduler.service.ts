import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MembershipsService } from './memberships.service';

/**
 * Daily membership housekeeping: renewal reminders for memberships expiring
 * soon and auto-expiry of past-due ones. Schedule is configurable via
 * `MEMBERSHIP_CRON` (default daily at 08:00). Admins can also trigger it via
 * `POST /memberships/process-expiries`.
 */
@Injectable()
export class MembershipSchedulerService {
  private readonly logger = new Logger(MembershipSchedulerService.name);

  constructor(private readonly memberships: MembershipsService) {}

  @Cron(process.env.MEMBERSHIP_CRON || CronExpression.EVERY_DAY_AT_8AM, {
    name: 'membership-expiry',
  })
  async run(): Promise<void> {
    try {
      const { remindersSent, expired } =
        await this.memberships.processExpiries();
      if (remindersSent > 0 || expired > 0) {
        this.logger.log(
          `Membership expiry: ${remindersSent} reminder(s), ${expired} expired`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Membership expiry job failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
