import { Module } from '@nestjs/common';
import { FarmLeasesService } from './farm-leases.service';
import {
  FarmLeasesController,
  FarmOwnershipsController,
  SeasonalAssignmentsController,
} from './farm-leases.controller';

@Module({
  controllers: [
    FarmLeasesController,
    SeasonalAssignmentsController,
    FarmOwnershipsController,
  ],
  providers: [FarmLeasesService],
  exports: [FarmLeasesService],
})
export class FarmLeasesModule {}
