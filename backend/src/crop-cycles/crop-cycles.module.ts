import { Module } from '@nestjs/common';
import { CropCyclesService } from './crop-cycles.service';
import { CropCyclesController } from './crop-cycles.controller';

@Module({
  controllers: [CropCyclesController],
  providers: [CropCyclesService],
  exports: [CropCyclesService],
})
export class CropCyclesModule {}
