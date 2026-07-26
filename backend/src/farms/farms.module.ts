import { Module } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';
import { UploadsModule } from '../uploads/uploads.module';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [UploadsModule, ActivitiesModule],
  controllers: [FarmsController],
  providers: [FarmsService],
  exports: [FarmsService],
})
export class FarmsModule {}
