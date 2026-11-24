import { Module } from '@nestjs/common';
import { FarmersModule } from '../farmers/farmers.module';
import { TransferRecipientService } from './transfer-recipient.service';
import { IrrigationController, MyPlotsController, MyTransfersController } from './irrigation.controller';
import { IrrigationScopeService } from './irrigation-scope.service';
import { SchemesService } from './schemes.service';
import { StructureService } from './structure.service';
import { AllocationService } from './allocation.service';
import { LeadershipService } from './leadership.service';
import { DashboardService } from './dashboard.service';
import { DocumentsService } from './documents.service';
import { IrrigationSetupService } from './irrigation-roles';
import { LeaderAccessService } from './leader-access.service';
import { DebtExposureService } from './debt-exposure.service';
import { EmancipationService } from './emancipation.service';

@Module({
  imports: [FarmersModule],
  controllers: [IrrigationController, MyTransfersController, MyPlotsController],
  providers: [
    IrrigationScopeService, SchemesService, StructureService, AllocationService,
    LeadershipService, DashboardService, DocumentsService, IrrigationSetupService, LeaderAccessService, DebtExposureService, EmancipationService, TransferRecipientService,
  ],
  exports: [IrrigationScopeService, LeaderAccessService, AllocationService],
})
export class IrrigationModule {}
