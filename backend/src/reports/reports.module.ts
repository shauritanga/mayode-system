import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportBuilderService } from './report-builder.service';
import { ReportsService } from './reports.service';
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportBuilderService],
  exports: [ReportsService, ReportBuilderService],
})
export class ReportsModule {}
