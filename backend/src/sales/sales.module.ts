import { forwardRef, Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { LoansModule } from '../loans/loans.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PaymentsModule } from '../payments/payments.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
@Module({
  imports: [
    ActivitiesModule,
    forwardRef(() => LoansModule),
    AccountingModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
