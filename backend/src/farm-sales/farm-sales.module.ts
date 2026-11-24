import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { IrrigationModule } from '../irrigation/irrigation.module';
import { FarmSalesController } from './farm-sales.controller';
import { FarmSalesService } from './farm-sales.service';

@Module({
  imports: [PaymentsModule, IrrigationModule],
  controllers: [FarmSalesController],
  providers: [FarmSalesService],
  exports: [FarmSalesService],
})
export class FarmSalesModule {}
