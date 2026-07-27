import { Module } from '@nestjs/common';
import { FarmLeasesModule } from '../farm-leases/farm-leases.module';
import { FarmRegistryModule } from '../farm-registry/farm-registry.module';
import { MessagingController } from './messaging.controller';
import { UssdService } from './ussd.service';

/**
 * Inbound SMS + USSD webhooks. Imports FarmLeasesModule/FarmRegistryModule for
 * lease and ownership confirmation; SmsService and MembershipsService come
 * from their global modules.
 */
@Module({
  imports: [FarmLeasesModule, FarmRegistryModule],
  controllers: [MessagingController],
  providers: [UssdService],
})
export class MessagingModule {}
