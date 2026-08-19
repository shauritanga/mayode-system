import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { SalesModule } from '../sales/sales.module';
import { BuyerOrdersModule } from '../buyer-orders/buyer-orders.module';
import { BuyersModule } from '../buyers/buyers.module';
import { BuyerPortalController } from './buyer-portal.controller';
import { BuyerPortalService } from './buyer-portal.service';

@Module({
  imports: [ReportsModule, SalesModule, BuyerOrdersModule, BuyersModule],
  controllers: [BuyerPortalController],
  providers: [BuyerPortalService],
  exports: [BuyerPortalService],
})
export class BuyerPortalModule {}
