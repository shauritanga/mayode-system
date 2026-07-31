import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { AccountingModule } from '../accounting/accounting.module';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

@Module({
  imports: [ActivitiesModule, AccountingModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
