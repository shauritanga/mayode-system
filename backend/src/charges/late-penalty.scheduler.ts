import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ChargesService } from './charges.service';

@Injectable()
export class LatePenaltyScheduler {
  private readonly logger = new Logger(LatePenaltyScheduler.name);
  constructor(private readonly charges: ChargesService) {}

  /** Every morning: add the late payment penalty to what is overdue, for every AMCOS that has it switched on. No staff step. */
  @Cron(process.env.LATE_PENALTY_CRON || '30 6 * * *', { name: 'late-payment-penalty', timeZone: 'Africa/Dar_es_Salaam' })
  async run() {
    try {
      const r = await this.charges.applyAutomatically();
      if (r.charged) this.logger.log(`Added ${r.charged} late payment penalty charge(s) across ${r.amcos} AMCOS`);
    } catch (e) { this.logger.error(`Late payment penalty run failed: ${e instanceof Error ? e.message : e}`); }
  }
}
