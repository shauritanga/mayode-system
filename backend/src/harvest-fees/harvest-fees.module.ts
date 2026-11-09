import { Module } from '@nestjs/common';
import { IrrigationModule } from '../irrigation/irrigation.module';
import { HarvestFeesService } from './harvest-fees.service';
import { HarvestFeesController } from './harvest-fees.controller';

@Module({ imports: [IrrigationModule], controllers: [HarvestFeesController], providers: [HarvestFeesService], exports: [HarvestFeesService] })
export class HarvestFeesModule {}
