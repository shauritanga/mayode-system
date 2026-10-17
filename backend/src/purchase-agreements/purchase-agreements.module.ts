import { Module } from '@nestjs/common';
import { PurchaseAgreementsController } from './purchase-agreements.controller';
import { PurchaseAgreementsService } from './purchase-agreements.service';

@Module({
  controllers: [PurchaseAgreementsController],
  providers: [PurchaseAgreementsService],
  exports: [PurchaseAgreementsService],
})
export class PurchaseAgreementsModule {}
