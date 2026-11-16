import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InputWarehouseService } from './input-warehouse.service';

@Injectable()
export class InputWarehouseScheduler {
  private readonly logger = new Logger(InputWarehouseScheduler.name);
  constructor(private readonly warehouses: InputWarehouseService) {}

  /** Every morning: tell management about any warehouse whose input stock has reached its minimum. */
  @Cron(process.env.INPUT_LOW_STOCK_CRON || '0 7 * * *', { name: 'input-low-stock', timeZone: 'Africa/Dar_es_Salaam' })
  async run() {
    try { const n = await this.warehouses.sweepAll(); if (n) this.logger.log(`Sent ${n} low-stock alert(s)`); }
    catch (e) { this.logger.error(`Low-stock check failed: ${e instanceof Error ? e.message : e}`); }
  }
}
