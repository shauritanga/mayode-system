import { Module } from '@nestjs/common';
import { PlotsService } from './plots.service';
import { PlotsController } from './plots.controller';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [ActivitiesModule],
  controllers: [PlotsController],
  providers: [PlotsService],
  exports: [PlotsService],
})
export class PlotsModule {}
