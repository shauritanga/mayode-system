import { Module } from '@nestjs/common';
import { FarmReportsService } from './farm-reports.service';
import { FarmReportsController } from './farm-reports.controller';

@Module({
  controllers: [FarmReportsController],
  providers: [FarmReportsService],
  exports: [FarmReportsService],
})
export class FarmReportsModule {}
