import { Module } from '@nestjs/common';
import { CreditModule } from '../credit/credit.module';
import { SmsModule } from '../messaging/sms.module';
import { RiceProtocolsModule } from '../rice-protocols/rice-protocols.module';
import { InsuranceController } from './insurance.controller';
import { InsuranceService } from './insurance.service';
import { InsuranceAccessService } from './insurance-access.service';
import { InsuranceApplicationsService } from './insurance-applications.service';

@Module({
  imports: [RiceProtocolsModule, CreditModule, SmsModule],
  controllers: [InsuranceController],
  providers: [InsuranceService, InsuranceAccessService, InsuranceApplicationsService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
