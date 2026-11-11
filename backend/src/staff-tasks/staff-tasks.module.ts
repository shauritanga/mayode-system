import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InputStockModule } from '../input-stock/input-stock.module';
import { CashDrawerController, ComplianceReportController, InputDistributionController, MaintenanceController, PurchaseOrdersController, InputSetupController } from './staff-tasks.controller';
import { CashDrawerService } from './cash-drawer.service';
import { InputDistributionService } from './input-distribution.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { MaintenanceService } from './maintenance.service';
import { ComplianceReportService } from './compliance-report.service';
import { InputSetupService } from './input-setup.service';

@Module({
  imports: [AccountingModule, InputStockModule],
  controllers: [InputSetupController, CashDrawerController, InputDistributionController, PurchaseOrdersController, MaintenanceController, ComplianceReportController],
  providers: [CashDrawerService, InputDistributionService, PurchaseOrdersService, MaintenanceService, ComplianceReportService, InputSetupService],
})
export class StaffTasksModule {}
