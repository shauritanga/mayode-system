import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * Global so any feature service (leases, memberships) can inject SmsService to
 * reach feature-phone users. Kept separate from MessagingModule (which imports
 * FarmLeasesModule) to avoid a circular dependency.
 */
@Global()
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
