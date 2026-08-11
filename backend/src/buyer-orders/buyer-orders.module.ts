import { Module } from '@nestjs/common';
import { BuyerOrdersController } from './buyer-orders.controller';
import { BuyerOrdersService } from './buyer-orders.service';

@Module({ controllers: [BuyerOrdersController], providers: [BuyerOrdersService], exports: [BuyerOrdersService] })
export class BuyerOrdersModule {}
