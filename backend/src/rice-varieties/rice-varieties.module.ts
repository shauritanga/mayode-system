import { Module } from '@nestjs/common';
import { RiceVarietiesController } from './rice-varieties.controller';
import { RiceVarietiesService } from './rice-varieties.service';

@Module({
  controllers: [RiceVarietiesController],
  providers: [RiceVarietiesService],
  exports: [RiceVarietiesService],
})
export class RiceVarietiesModule {}
