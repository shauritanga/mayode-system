import { Global, Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { WhatsappService } from './whatsapp.service';

/**
 * Global so any feature service (leases, memberships) can inject SmsService to
 * reach feature-phone users. Kept separate from MessagingModule (which imports
 * FarmLeasesModule) to avoid a circular dependency.
 */
@Global()
@Module({
  providers: [SmsService, WhatsappService],
  exports: [SmsService, WhatsappService],
})
export class SmsModule {}
