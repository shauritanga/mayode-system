import { Module } from '@nestjs/common';
import { FarmCorrectionsService } from './farm-corrections.service';
import {
  FarmCorrectionsController,
  FarmDataConflictsController,
  SuggestedUpdatesController,
} from './farm-corrections.controller';

@Module({
  controllers: [
    FarmCorrectionsController,
    SuggestedUpdatesController,
    FarmDataConflictsController,
  ],
  providers: [FarmCorrectionsService],
  exports: [FarmCorrectionsService],
})
export class FarmCorrectionsModule {}
