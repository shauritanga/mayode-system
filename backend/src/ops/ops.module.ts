import { forwardRef, Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { SettingsModule } from '../settings/settings.module';
import { OpsNotifyService } from './ops-common';
import { CatalogService } from './catalog.service';
import { StockService } from './stock.service';
import { ReceivingService } from './receiving.service';
import { ProcessingService } from './processing.service';
import { TraceabilityService } from './traceability.service';
import { SalesOpsService } from './sales-ops.service';
import { BillingService } from './billing.service';
import { DispatchService } from './dispatch.service';
import { DocumentsService } from './documents.service';
import { FarmOpsService } from './farm-ops.service';
import { FarmTasksService } from './farm-tasks.service';
import { FarmInputsService } from './farm-inputs.service';
import { HarvestService } from './harvest.service';
import { OpsReportsService } from './ops-reports.service';
import { OpsSetupController, OpsSetupService } from './ops-setup';
import {
  OpsBillingController, OpsCatalogController, OpsDispatchController, OpsFarmController, OpsPublicController, OpsReportsController, OpsSalesController, OpsWarehouseController,
} from './ops.controllers';

@Module({
  imports: [forwardRef(() => PaymentsModule), SettingsModule],
  controllers: [OpsCatalogController, OpsWarehouseController, OpsSalesController, OpsBillingController, OpsPublicController, OpsDispatchController, OpsFarmController, OpsReportsController, OpsSetupController],
  providers: [
    OpsNotifyService, CatalogService, StockService, ReceivingService, ProcessingService, TraceabilityService, SalesOpsService, BillingService, DispatchService, DocumentsService,
    FarmOpsService, FarmTasksService, FarmInputsService, HarvestService, OpsReportsService, OpsSetupService,
  ],
  exports: [BillingService],
})
export class OpsModule {}
