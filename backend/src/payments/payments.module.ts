import { forwardRef, Module } from '@nestjs/common';
import { ClickPesaService } from './clickpesa.service';
import { PaymentsController } from './payments.controller';
import { SalesModule } from '../sales/sales.module';

/**
 * ClickPesa payment integration. Exports ClickPesaService so MembershipsModule
 * can initiate collections; the controller receives ClickPesa webhooks.
 * MembershipsService is resolved via the global MembershipsModule.
 */
@Module({
  imports: [forwardRef(() => SalesModule)],
  controllers: [PaymentsController],
  providers: [ClickPesaService],
  exports: [ClickPesaService],
})
export class PaymentsModule {}
