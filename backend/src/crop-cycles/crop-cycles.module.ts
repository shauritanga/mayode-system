import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { CropCyclesService } from './crop-cycles.service';
import { CropCyclesController } from './crop-cycles.controller';
import { RiceProtocolsModule } from '../rice-protocols/rice-protocols.module';

@Module({
  imports: [ActivitiesModule, RiceProtocolsModule],
  controllers: [CropCyclesController],
  providers: [CropCyclesService],
  exports: [CropCyclesService],
})
export class CropCyclesModule {}
