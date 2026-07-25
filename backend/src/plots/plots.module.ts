import { Module } from '@nestjs/common';
import { PlotsService } from './plots.service';
import { PlotsController } from './plots.controller';

@Module({
  controllers: [PlotsController],
  providers: [PlotsService],
  exports: [PlotsService],
})
export class PlotsModule {}
