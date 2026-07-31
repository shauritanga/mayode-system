import { Global, Module } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { PayoutSchedulerService } from './payout-scheduler.service';
import { PricingService } from './pricing.service';
import { FlashDealSchedulerService } from './flash-deal-scheduler.service';
import { LeaseDocumentService } from './lease-document.service';
import { MultiYearRentSchedulerService } from './multi-year-rent-scheduler.service';
import { PaymentsModule } from '../payments/payments.module';
import { UploadsModule } from '../uploads/uploads.module';
import { DisputesModule } from '../disputes/disputes.module';

/**
 * Global so PaymentsController can inject MarketplaceService to reconcile
 * M-LAX escrow deposits from the ClickPesa webhook, without a circular import
 * (mirrors MembershipsModule's relationship with PaymentsModule). Imports
 * PaymentsModule for the ClickPesaService used to collect escrow deposits.
 */
@Global()
@Module({
  imports: [PaymentsModule, UploadsModule, DisputesModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, PayoutSchedulerService, PricingService, FlashDealSchedulerService, LeaseDocumentService, MultiYearRentSchedulerService],
  exports: [MarketplaceService, PricingService],
})
export class MarketplaceModule {}
