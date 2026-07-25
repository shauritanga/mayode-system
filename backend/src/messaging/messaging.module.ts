import { Module } from '@nestjs/common';
import { FarmLeasesModule } from '../farm-leases/farm-leases.module';
import { MessagingController } from './messaging.controller';
import { UssdService } from './ussd.service';

/**
 * Inbound SMS + USSD webhooks. Imports FarmLeasesModule for lease confirmation;
 * SmsService and MembershipsService come from their global modules.
 */
@Module({
  imports: [FarmLeasesModule],
  controllers: [MessagingController],
  providers: [UssdService],
})
export class MessagingModule {}
