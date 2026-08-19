import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceService } from './marketplace.service';

/**
 * Monthly job: reminds renters on multi-year ANNUAL-plan leases when their
 * next year's rent is due. Schedule configurable via `MLAX_RENT_REMINDER_CRON`
 * (default the 1st of every month at 08:00).
 */
@Injectable()
export class MultiYearRentSchedulerService {
  private readonly logger = new Logger(MultiYearRentSchedulerService.name);

  constructor(private readonly marketplace: MarketplaceService) {}

  @Cron(
    process.env.MLAX_RENT_REMINDER_CRON ||
      CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT,
    {
      name: 'mlax-annual-rent-reminder',
    },
  )
  async run(): Promise<void> {
    try {
      const sent = await this.marketplace.sendDueAnnualReminders();
      if (sent > 0) {
        this.logger.log(`M-LAX annual rent reminders: ${sent} sent`);
      }
    } catch (e) {
      this.logger.error(
        `M-LAX annual rent reminder job failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
