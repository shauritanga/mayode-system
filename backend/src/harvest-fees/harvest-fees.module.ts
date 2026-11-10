import { Module } from '@nestjs/common';
import { IrrigationModule } from '../irrigation/irrigation.module';
import { HarvestFeesService } from './harvest-fees.service';
import { HarvestFeesController } from './harvest-fees.controller';
import { HarvestGateService } from './harvest-gate.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [IrrigationModule, NotificationsModule], controllers: [HarvestFeesController], providers: [HarvestFeesService, HarvestGateService], exports: [HarvestFeesService, HarvestGateService] })
export class HarvestFeesModule {}
