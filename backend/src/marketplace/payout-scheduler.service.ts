import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceService } from './marketplace.service';

/**
 * Polls ClickPesa for the authoritative status of any M-LAX escrow payout
 * still PROCESSING (owner/renter disbursements initiated from releaseEscrow
 * or sub-lease/ownership-transfer settlement). Schedule is configurable via
 * `MLAX_PAYOUT_CRON` (default every 10 minutes — payouts should reconcile
 * faster than the daily membership housekeeping job).
 */
@Injectable()
export class PayoutSchedulerService {
  private readonly logger = new Logger(PayoutSchedulerService.name);

  constructor(private readonly marketplace: MarketplaceService) {}

  @Cron(process.env.MLAX_PAYOUT_CRON || CronExpression.EVERY_10_MINUTES, {
    name: 'mlax-payout-reconcile',
  })
  async run(): Promise<void> {
    try {
      const processing = await this.marketplace.findProcessingPayouts();
      let resolved = 0;
      for (const escrow of processing) {
        const before = escrow.payoutStatus;
        const after = await this.marketplace.reconcilePayoutStatus(escrow.id);
        if (after && after.payoutStatus !== before) resolved++;
      }
      if (processing.length > 0) {
        this.logger.log(`M-LAX payout reconcile: ${resolved}/${processing.length} resolved`);
      }
    } catch (e) {
      this.logger.error(`M-LAX payout reconcile job failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}
