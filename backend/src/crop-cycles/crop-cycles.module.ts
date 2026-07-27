import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { CropCyclesService } from './crop-cycles.service';
import { CropCyclesController } from './crop-cycles.controller';

@Module({
  imports: [ActivitiesModule],
  controllers: [CropCyclesController],
  providers: [CropCyclesService],
  exports: [CropCyclesService],
})
export class CropCyclesModule {}
