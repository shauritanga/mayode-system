import { Global, Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { MembershipSchedulerService } from './membership-scheduler.service';
import { PaymentsModule } from '../payments/payments.module';
import { AccountingModule } from '../accounting/accounting.module';

/**
 * Global so analytics endpoints anywhere (farms, farmers, finance) can inject
 * MembershipsService to enforce the server-side premium gate. Imports
 * PaymentsModule for the ClickPesa client used during membership payment.
 */
@Global()
@Module({
  imports: [PaymentsModule, AccountingModule],
  controllers: [MembershipsController],
  providers: [MembershipsService, MembershipSchedulerService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
