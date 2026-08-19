import { Module } from '@nestjs/common';
import { BuyersModule } from '../buyers/buyers.module';
import { BuyerOrdersController } from './buyer-orders.controller';
import { BuyerOrdersService } from './buyer-orders.service';

@Module({
  imports: [BuyersModule],
  controllers: [BuyerOrdersController],
  providers: [BuyerOrdersService],
  exports: [BuyerOrdersService],
})
export class BuyerOrdersModule {}
