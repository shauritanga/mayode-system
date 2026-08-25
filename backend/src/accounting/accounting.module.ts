import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { ReceivablesSchedulerService } from './receivables-scheduler.service';
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, ReceivablesSchedulerService],
  exports: [AccountingService],
})
export class AccountingModule {}
