import { Module } from '@nestjs/common';
import { FarmingSeasonsService } from './farming-seasons.service';
import { FarmingSeasonsController } from './farming-seasons.controller';

@Module({
  controllers: [FarmingSeasonsController],
  providers: [FarmingSeasonsService],
  exports: [FarmingSeasonsService],
})
export class FarmingSeasonsModule {}
