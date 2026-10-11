import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { SaleOrdersController } from './sale-orders.controller';
import { SaleOrdersService } from './sale-orders.service';
import { SaleOrdersSchedulerService } from './sale-orders.scheduler';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SalesModule, WarehousesModule, SettingsModule],
  controllers: [SaleOrdersController],
  providers: [SaleOrdersService, SaleOrdersSchedulerService],
})
export class SaleOrdersModule {}
