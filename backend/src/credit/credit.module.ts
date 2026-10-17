import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { FarmersModule } from '../farmers/farmers.module';
import { SmsModule } from '../messaging/sms.module';
import { CreditController } from './credit.controller';
import { CreditProfileService } from './credit-profile.service';
import { LoanApplicationsService } from './loan-applications.service';

@Module({
  imports: [AccountingModule, FarmersModule, SmsModule],
  controllers: [CreditController],
  providers: [CreditProfileService, LoanApplicationsService],
  exports: [CreditProfileService],
})
export class CreditModule {}
