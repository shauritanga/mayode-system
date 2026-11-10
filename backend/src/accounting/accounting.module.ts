import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { CashTransactionsService } from './cash-transactions.service';
import { CashAccountsService } from './cash-accounts.service';
import { FarmerAccountsService } from './farmer-accounts.service';
import { PeriodLockService } from './period-lock.service';
import { ReceivablesSchedulerService } from './receivables-scheduler.service';
import { ReconciliationService } from './reconciliation.service';
import { TaxService } from './tax.service';
import { ReportExportService } from './report-export.service';
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, ReceivablesSchedulerService, PeriodLockService, ReconciliationService, TaxService, CashTransactionsService, CashAccountsService, FarmerAccountsService, ReportExportService],
  exports: [AccountingService, CashAccountsService],
})
export class AccountingModule {}
