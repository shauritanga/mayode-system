import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FarmDefaultsService } from './farm-defaults.service';

@Injectable()
export class FarmDefaultsScheduler {
  private readonly logger = new Logger(FarmDefaultsScheduler.name);
  constructor(private readonly defaults: FarmDefaultsService) {}

  /** Every morning: find farmers whose debt has gone past the grace period. */
  @Cron(process.env.FARM_DEFAULTS_CHECK_CRON || '0 6 * * *', { name: 'farm-defaults-check', timeZone: 'Africa/Dar_es_Salaam' })
  async check() {
    try { const n = await this.defaults.checkAll(); if (n) this.logger.log(`Opened ${n} overdue-debt case(s)`); }
    catch (e) { this.logger.error(`Overdue-debt check failed: ${e instanceof Error ? e.message : e}`); }
  }

  /** Every 15 minutes: give farms back to those who paid, and move expired two-day notices to M-LAX. */
  @Cron(process.env.FARM_DEFAULTS_SWEEP_CRON || '*/15 * * * *', { name: 'farm-defaults-sweep' })
  async sweep() {
    try { const n = await this.defaults.sweep(); if (n) this.logger.log(`Moved ${n} case(s) to M-LAX`); }
    catch (e) { this.logger.error(`Overdue-debt sweep failed: ${e instanceof Error ? e.message : e}`); }
  }
}
