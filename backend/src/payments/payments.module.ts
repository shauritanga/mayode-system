import { Module } from '@nestjs/common';
import { ClickPesaService } from './clickpesa.service';
import { PaymentsController } from './payments.controller';

/**
 * ClickPesa payment integration. Exports ClickPesaService so MembershipsModule
 * can initiate collections; the controller receives ClickPesa webhooks.
 * MembershipsService is resolved via the global MembershipsModule.
 */
@Module({
  controllers: [PaymentsController],
  providers: [ClickPesaService],
  exports: [ClickPesaService],
})
export class PaymentsModule {}
