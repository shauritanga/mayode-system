import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { CashTransactionsService } from './cash-transactions.service';
import { PeriodLockService } from './period-lock.service';
import { ReceivablesSchedulerService } from './receivables-scheduler.service';
import { ReconciliationService } from './reconciliation.service';
import { TaxService } from './tax.service';
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, ReceivablesSchedulerService, PeriodLockService, ReconciliationService, TaxService, CashTransactionsService],
  exports: [AccountingService],
})
export class AccountingModule {}
