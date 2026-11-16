import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreditInterestService } from './credit-interest.service';

@Injectable()
export class CreditInterestScheduler {
  private readonly logger = new Logger(CreditInterestScheduler.name);
  constructor(private readonly interest: CreditInterestService) {}

  /** Every morning: add the interest that has fallen due on input credit, for every AMCOS that charges it. */
  @Cron(process.env.CREDIT_INTEREST_CRON || '30 5 * * *', { name: 'credit-interest', timeZone: 'Africa/Dar_es_Salaam' })
  async run() {
    try { const n = await this.interest.accrueAll(); if (n) this.logger.log(`Added ${n} interest charge(s)`); }
    catch (e) { this.logger.error(`Interest run failed: ${e instanceof Error ? e.message : e}`); }
  }
}
