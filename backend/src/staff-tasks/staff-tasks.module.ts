import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CashDrawerController, ComplianceReportController, InputDistributionController, MaintenanceController, PurchaseOrdersController } from './staff-tasks.controller';
import { CashDrawerService } from './cash-drawer.service';
import { InputDistributionService } from './input-distribution.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { MaintenanceService } from './maintenance.service';
import { ComplianceReportService } from './compliance-report.service';

@Module({
  imports: [AccountingModule],
  controllers: [CashDrawerController, InputDistributionController, PurchaseOrdersController, MaintenanceController, ComplianceReportController],
  providers: [CashDrawerService, InputDistributionService, PurchaseOrdersService, MaintenanceService, ComplianceReportService],
})
export class StaffTasksModule {}
