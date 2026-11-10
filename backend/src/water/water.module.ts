import { Module } from '@nestjs/common';
import { IrrigationModule } from '../irrigation/irrigation.module';
import { WaterController } from './water.controller';
import { WaterService } from './water.service';

@Module({ imports: [IrrigationModule], controllers: [WaterController], providers: [WaterService], exports: [WaterService] })
export class WaterModule {}
