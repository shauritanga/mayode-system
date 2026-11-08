import { Module } from '@nestjs/common';
import { IrrigationController, MyTransfersController } from './irrigation.controller';
import { IrrigationScopeService } from './irrigation-scope.service';
import { SchemesService } from './schemes.service';
import { StructureService } from './structure.service';
import { AllocationService } from './allocation.service';
import { LeadershipService } from './leadership.service';
import { DashboardService } from './dashboard.service';
import { DocumentsService } from './documents.service';
import { IrrigationSetupService } from './irrigation-roles';
import { LeaderAccessService } from './leader-access.service';

@Module({
  controllers: [IrrigationController, MyTransfersController],
  providers: [
    IrrigationScopeService, SchemesService, StructureService, AllocationService,
    LeadershipService, DashboardService, DocumentsService, IrrigationSetupService, LeaderAccessService,
  ],
  exports: [IrrigationScopeService, LeaderAccessService],
})
export class IrrigationModule {}
