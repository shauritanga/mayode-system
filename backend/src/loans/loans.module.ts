import { forwardRef, Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { SmsModule } from '../messaging/sms.module';
import { AccountingModule } from '../accounting/accounting.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { LendersController } from './lenders.controller';
import { LendersService } from './lenders.service';
@Module({
  imports: [forwardRef(() => PaymentsModule), SmsModule, AccountingModule],
  controllers: [LoansController, LendersController],
  providers: [LoansService, LendersService],
  exports: [LoansService],
})
export class LoansModule {}
