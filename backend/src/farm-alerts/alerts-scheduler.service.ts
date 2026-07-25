import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FarmAlertsService } from './farm-alerts.service';

/**
 * Runs the rule-based farm-alert generator on a schedule so alerts appear
 * without a manual admin trigger. The schedule is configurable via the
 * `ALERTS_CRON` env var (cron expression); defaults to daily at 06:00. The
 * manual `POST /farm-alerts/generate` endpoint remains for on-demand runs.
 */
@Injectable()
export class AlertsSchedulerService {
  private readonly logger = new Logger(AlertsSchedulerService.name);

  constructor(private readonly alerts: FarmAlertsService) {}

  @Cron(process.env.ALERTS_CRON || CronExpression.EVERY_DAY_AT_6AM, {
    name: 'farm-alerts-generate',
  })
  async generate(): Promise<void> {
    try {
      const { farms, created } = await this.alerts.generateAll();
      if (created > 0) {
        this.logger.log(`Scheduled alert generation: ${created} new alert(s) across ${farms} farm(s)`);
      }
    } catch (e) {
      this.logger.error(`Scheduled alert generation failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}
