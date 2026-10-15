import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportBuilderService } from './report-builder.service';
import { ReportsService } from './reports.service';
import { RiceOverviewService } from './rice-overview.service';
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportBuilderService, RiceOverviewService],
  exports: [ReportsService, ReportBuilderService],
})
export class ReportsModule {}
