import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { CreditInterestModule } from '../credit-interest/credit-interest.module';
import { InputStockModule } from '../input-stock/input-stock.module';
import { CashDrawerController, ComplianceReportController, InputDistributionController, InputApplicationsController, InputWarehouseController, MaintenanceController, PurchaseOrdersController, InputSetupController } from './staff-tasks.controller';
import { CashDrawerService } from './cash-drawer.service';
import { InputWarehouseService } from './input-warehouse.service';
import { InputWarehouseScheduler } from './input-warehouse.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';
import { InputApplicationsService } from './input-applications.service';
import { InputDistributionService } from './input-distribution.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { MaintenanceService } from './maintenance.service';
import { ComplianceReportService } from './compliance-report.service';
import { InputSetupService } from './input-setup.service';

@Module({
  imports: [AccountingModule, InputStockModule, CreditInterestModule, NotificationsModule],
  controllers: [InputSetupController, CashDrawerController, InputDistributionController, PurchaseOrdersController, MaintenanceController, ComplianceReportController],
  providers: [InputApplicationsService, InputWarehouseService, InputWarehouseScheduler, CashDrawerService, InputDistributionService, PurchaseOrdersService, MaintenanceService, ComplianceReportService, InputSetupService],
})
export class StaffTasksModule {}
