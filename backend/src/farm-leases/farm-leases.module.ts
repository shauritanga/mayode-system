import { Module } from '@nestjs/common';
import { DisputesModule } from '../disputes/disputes.module';
import { FarmLeasesService } from './farm-leases.service';
import {
  FarmLeasesController,
  FarmOwnershipsController,
  SeasonalAssignmentsController,
} from './farm-leases.controller';

@Module({
  imports: [DisputesModule],
  controllers: [
    FarmLeasesController,
    SeasonalAssignmentsController,
    FarmOwnershipsController,
  ],
  providers: [FarmLeasesService],
  exports: [FarmLeasesService],
})
export class FarmLeasesModule {}
