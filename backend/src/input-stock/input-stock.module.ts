import { Module } from '@nestjs/common';
import { InputStockController } from './input-stock.controller';
import { InputStockService } from './input-stock.service';

@Module({ controllers: [InputStockController], providers: [InputStockService], exports: [InputStockService] })
export class InputStockModule {}
