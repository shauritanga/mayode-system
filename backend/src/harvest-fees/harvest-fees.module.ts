import { Module } from '@nestjs/common';
import { IrrigationModule } from '../irrigation/irrigation.module';
import { HarvestFeesService } from './harvest-fees.service';
import { HarvestFeesController } from './harvest-fees.controller';
import { HarvestGateService } from './harvest-gate.service';
import { HarvestCollectionsService } from './harvest-collections.service';
import { HarvestCollectionsController } from './harvest-collections.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [IrrigationModule, NotificationsModule], controllers: [HarvestFeesController, HarvestCollectionsController], providers: [HarvestFeesService, HarvestGateService, HarvestCollectionsService], exports: [HarvestFeesService, HarvestGateService, HarvestCollectionsService] })
export class HarvestFeesModule {}
