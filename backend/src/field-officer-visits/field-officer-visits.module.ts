import { Module } from '@nestjs/common';
import { FieldOfficerVisitsService } from './field-officer-visits.service';
import { FieldOfficerVisitsController } from './field-officer-visits.controller';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [ActivitiesModule],
  controllers: [FieldOfficerVisitsController],
  providers: [FieldOfficerVisitsService],
  exports: [FieldOfficerVisitsService],
})
export class FieldOfficerVisitsModule {}
