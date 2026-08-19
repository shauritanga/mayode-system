import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketplaceService } from './marketplace.service';

/**
 * Daily job: Flash Deal listings that have gone unrented past their
 * `autoDropDays` window get their asking price stepped down toward
 * `autoDropPrice` (the "urgency discount" / Airbnb-style flexible pricing
 * from the business doc), with an SMS to the owner. Schedule configurable
 * via `MLAX_FLASH_DEAL_CRON` (default daily at 09:00).
 */
@Injectable()
export class FlashDealSchedulerService {
  private readonly logger = new Logger(FlashDealSchedulerService.name);

  constructor(private readonly marketplace: MarketplaceService) {}

  @Cron(process.env.MLAX_FLASH_DEAL_CRON || CronExpression.EVERY_DAY_AT_9AM, {
    name: 'mlax-flash-deal-auto-drop',
  })
  async run(): Promise<void> {
    try {
      const dropped = await this.marketplace.applyDueFlashDealDrops();
      if (dropped > 0) {
        this.logger.log(
          `M-LAX flash-deal auto-drop: ${dropped} listing(s) repriced`,
        );
      }
    } catch (e) {
      this.logger.error(
        `M-LAX flash-deal auto-drop job failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
