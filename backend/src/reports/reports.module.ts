import { Module } from '@nestjs/common';
import { FieldOfficersModule } from '../field-officers/field-officers.module';
import { AnalyticsReportsService } from './analytics-reports.service';
import { ReportsController } from './reports.controller';
import { ReportBuilderService } from './report-builder.service';
import { ReportsService } from './reports.service';
import { RiceOverviewService } from './rice-overview.service';
@Module({
  imports: [FieldOfficersModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportBuilderService, RiceOverviewService, AnalyticsReportsService],
  exports: [ReportsService, ReportBuilderService],
})
export class ReportsModule {}
