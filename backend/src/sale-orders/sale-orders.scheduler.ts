import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SaleOrdersService } from './sale-orders.service';

/** Releases stock held by sale orders that were never confirmed. Hourly; the limit is set in Settings. */
@Injectable()
export class SaleOrdersSchedulerService {
  private readonly logger = new Logger(SaleOrdersSchedulerService.name);

  constructor(private readonly orders: SaleOrdersService) {}

  @Cron(process.env.SALE_ORDER_EXPIRY_CRON || CronExpression.EVERY_HOUR, {
    name: 'sale-order-reservation-expiry',
  })
  async run(): Promise<void> {
    try {
      const expired = await this.orders.expireStale();
      if (expired > 0)
        this.logger.log(`Released ${expired} expired reservation(s)`);
    } catch (e) {
      this.logger.error(
        `Reservation expiry failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
