import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { ALLOCATION_RESOURCE, IRRIGATION_RESOURCE, LEADERSHIP_RESOURCE, TRANSFER_APPROVAL_RESOURCE } from './irrigation-common';
import { SchemesService } from './schemes.service';
import { StructureService } from './structure.service';
import { AllocationService } from './allocation.service';
import { LeadershipService } from './leadership.service';
import { DashboardService } from './dashboard.service';
import { DocumentsService } from './documents.service';
import { EmancipationService } from './emancipation.service';
import { IrrigationSetupService } from './irrigation-roles';
import {
  AllocateHectareDto, AppointLeaderDto, EmancipationDecisionDto, EmancipationRequestDto, MyTransferRequestDto, SetGuardianDto, CreateBlockDto, CreateCanalDto, CreateDocumentDto, CreateHectareDto,
  CreateSchemeDto, CreateTransferDto, DeclineTransferDto, EndLeadershipDto, ReasonDto, UpdateBlockDto, UpdateCanalDto, UpdateSchemeDto,
} from './dto/irrigation.dto';

type Q = Record<string, string>;
const STRUCTURE = IRRIGATION_RESOURCE;
const ALLOC = ALLOCATION_RESOURCE;
const LEAD = LEADERSHIP_RESOURCE;
const TRANSFER_APPROVAL = TRANSFER_APPROVAL_RESOURCE;

/**
 * Irrigation Scheme Management API. Every route names its permission explicitly; services additionally confine
 * canal/block leaders to their own canal/block and everyone to their AMCOS (see IrrigationScopeService).
 */
@ApiTags('irrigation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('irrigation')
export class IrrigationController {
  constructor(
    private readonly schemes: SchemesService,
    private readonly structure: StructureService,
    private readonly allocations: AllocationService,
    private readonly leadership: LeadershipService,
    private readonly dashboard: DashboardService,
    private readonly documents: DocumentsService,
    private readonly setup: IrrigationSetupService,
    private readonly emancipation: EmancipationService,
  ) {}

  @Post('setup/roles') @RequirePermission('roles', 'CREATE')
  installRoles(@CurrentUser() u: RequestUser) { return this.setup.installRoles(u); }

  // Dashboards
  @Get('overview') @RequirePermission(STRUCTURE, 'VIEW')
  overview(@CurrentUser() u: RequestUser, @Query('schemeId') schemeId?: string) { return this.dashboard.overview(u, schemeId); }

  @Get('allocation-overview') @RequirePermission(ALLOC, 'VIEW')
  allocationOverview(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.dashboard.allocationOverview(u, q); }

  @Get('leadership-overview') @RequirePermission(LEAD, 'VIEW')
  leadershipOverview(@CurrentUser() u: RequestUser, @Query('schemeId') schemeId?: string) { return this.dashboard.leadershipOverview(u, schemeId); }

  // Schemes
  @Get('schemes') @RequirePermission(STRUCTURE, 'VIEW')
  listSchemes(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.schemes.list(u, q); }
  @Post('schemes') @RequirePermission(STRUCTURE, 'CREATE')
  createScheme(@CurrentUser() u: RequestUser, @Body() dto: CreateSchemeDto) { return this.schemes.create(u, dto); }
  @Get('schemes/:id') @RequirePermission(STRUCTURE, 'VIEW')
  getScheme(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.schemes.get(u, id); }
  @Patch('schemes/:id') @RequirePermission(STRUCTURE, 'EDIT')
  updateScheme(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateSchemeDto) { return this.schemes.update(u, id, dto); }
  @Get('schemes/:id/history') @RequirePermission(STRUCTURE, 'VIEW')
  schemeHistory(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.schemes.history(u, id); }

  // Canals
  @Get('canals') @RequirePermission(STRUCTURE, 'VIEW')
  listCanals(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.structure.listCanals(u, q); }
  @Post('canals') @RequirePermission(STRUCTURE, 'CREATE')
  createCanal(@CurrentUser() u: RequestUser, @Body() dto: CreateCanalDto) { return this.structure.createCanal(u, dto); }
  @Get('canals/:id') @RequirePermission(STRUCTURE, 'VIEW')
  getCanal(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.getCanal(u, id); }
  @Patch('canals/:id') @RequirePermission(STRUCTURE, 'EDIT')
  updateCanal(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateCanalDto) { return this.structure.updateCanal(u, id, dto); }
  @Post('canals/:id/archive') @RequirePermission(STRUCTURE, 'DELETE')
  archiveCanal(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.setCanalArchived(u, id, true); }
  @Post('canals/:id/restore') @RequirePermission(STRUCTURE, 'EDIT')
  restoreCanal(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.setCanalArchived(u, id, false); }
  @Get('canals/:id/history') @RequirePermission(STRUCTURE, 'VIEW')
  canalHistory(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.canalHistory(u, id); }

  // Blocks
  @Get('blocks') @RequirePermission(STRUCTURE, 'VIEW')
  listBlocks(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.structure.listBlocks(u, q); }
  @Post('blocks') @RequirePermission(STRUCTURE, 'CREATE')
  createBlock(@CurrentUser() u: RequestUser, @Body() dto: CreateBlockDto) { return this.structure.createBlock(u, dto); }
  @Get('blocks/:id') @RequirePermission(STRUCTURE, 'VIEW')
  getBlock(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.getBlock(u, id); }
  @Patch('blocks/:id') @RequirePermission(STRUCTURE, 'EDIT')
  updateBlock(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateBlockDto) { return this.structure.updateBlock(u, id, dto); }
  @Post('blocks/:id/archive') @RequirePermission(STRUCTURE, 'DELETE')
  archiveBlock(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.setBlockArchived(u, id, true); }
  @Post('blocks/:id/restore') @RequirePermission(STRUCTURE, 'EDIT')
  restoreBlock(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.setBlockArchived(u, id, false); }
  @Post('blocks/:id/initialize-hectares') @RequirePermission(STRUCTURE, 'CREATE')
  initializeHectares(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.initializeHectares(u, id); }
  @Get('blocks/:id/history') @RequirePermission(STRUCTURE, 'VIEW')
  blockHistory(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.blockHistory(u, id); }

  // Hectares
  @Get('hectares') @RequirePermission(STRUCTURE, 'VIEW')
  listHectares(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.structure.listHectares(u, q); }
  @Post('hectares') @RequirePermission(STRUCTURE, 'CREATE')
  createHectare(@CurrentUser() u: RequestUser, @Body() dto: CreateHectareDto) { return this.structure.createHectare(u, dto); }
  @Get('hectares/:id') @RequirePermission(STRUCTURE, 'VIEW')
  getHectare(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.structure.getHectare(u, id); }

  // Allocations
  @Get('allocations') @RequirePermission(ALLOC, 'VIEW')
  listAllocations(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.allocations.listAllocations(u, q); }
  @Post('allocations') @RequirePermission(ALLOC, 'CREATE')
  allocate(@CurrentUser() u: RequestUser, @Body() dto: AllocateHectareDto) { return this.allocations.allocate(u, dto); }
  @Post('allocations/:id/approve') @RequirePermission(ALLOC, 'EDIT')
  approve(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.allocations.approve(u, id); }
  @Post('allocations/:id/reject') @RequirePermission(ALLOC, 'EDIT')
  reject(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) { return this.allocations.reject(u, id, dto.reason); }
  @Post('allocations/:id/guardian') @RequirePermission(ALLOC, 'EDIT')
  setGuardian(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: SetGuardianDto) { return this.allocations.setGuardian(u, id, dto); }
  @Post('allocations/:id/guardian/end') @RequirePermission(ALLOC, 'EDIT')
  endGuardian(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) { return this.allocations.endGuardian(u, id, dto.reason); }
  @Post('allocations/:id/release') @RequirePermission(ALLOC, 'EDIT')
  release(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) { return this.allocations.release(u, id, dto.reason, dto.effectiveDate); }
  @Get('allocation-members') @RequirePermission(ALLOC, 'VIEW')
  allocationMembers(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.allocations.searchMembers(u, q); }
  @Get('farmers/:farmerId') @RequirePermission(ALLOC, 'VIEW')
  farmerDetail(@CurrentUser() u: RequestUser, @Param('farmerId') id: string) { return this.allocations.farmerDetail(u, id); }

  // Transfers
  @Get('transfers') @RequirePermission(ALLOC, 'VIEW')
  listTransfers(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.allocations.listTransfers(u, q); }
  // Emancipation: a dependent registered with a guardian becomes an independent member
  @Get('emancipations') @RequirePermission(ALLOC, 'VIEW')
  emancipations(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.emancipation.list(u, q); }
  @Post('emancipations') @RequirePermission(ALLOC, 'CREATE')
  requestEmancipation(@CurrentUser() u: RequestUser, @Body() dto: EmancipationRequestDto) { return this.emancipation.requestAtOffice(u, dto); }
  @Post('emancipations/:id/approve') @RequirePermission(TRANSFER_APPROVAL, 'EDIT')
  approveEmancipation(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: EmancipationDecisionDto) { return this.emancipation.approve(u, id, dto.note); }
  @Post('emancipations/:id/reject') @RequirePermission(TRANSFER_APPROVAL, 'EDIT')
  rejectEmancipation(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) { return this.emancipation.reject(u, id, dto.reason); }

  @Post('transfers') @RequirePermission(ALLOC, 'CREATE')
  createTransfer(@CurrentUser() u: RequestUser, @Body() dto: CreateTransferDto) { return this.allocations.createTransfer(u, dto); }
  @Post('transfers/:id/approve') @RequirePermission(TRANSFER_APPROVAL, 'EDIT')
  approveTransfer(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.allocations.approveTransfer(u, id); }
  @Post('transfers/:id/reject') @RequirePermission(ALLOC, 'EDIT')
  rejectTransfer(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) { return this.allocations.closeTransfer(u, id, 'REJECTED', dto.reason); }
  @Post('transfers/:id/cancel') @RequirePermission(ALLOC, 'EDIT')
  cancelTransfer(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) { return this.allocations.closeTransfer(u, id, 'CANCELLED', dto.reason); }

  // Leadership
  @Get('leadership') @RequirePermission(LEAD, 'VIEW')
  listLeadership(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.leadership.list(u, q); }
  @Post('leadership') @RequirePermission(LEAD, 'CREATE')
  appoint(@CurrentUser() u: RequestUser, @Body() dto: AppointLeaderDto) { return this.leadership.appoint(u, dto); }
  @Post('leadership/:id/end') @RequirePermission(LEAD, 'EDIT')
  endLeadership(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: EndLeadershipDto) { return this.leadership.end(u, id, dto); }
  @Get('leadership-members') @RequirePermission(LEAD, 'VIEW')
  leadershipMembers(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.allocations.searchMembers(u, q); }

  // Documents (files are uploaded through POST /uploads, then registered here)
  @Get('documents') @RequirePermission(STRUCTURE, 'VIEW')
  listDocuments(@CurrentUser() u: RequestUser, @Query() q: Q) { return this.documents.list(u, q); }
  @Post('documents') @RequirePermission(STRUCTURE, 'CREATE')
  createDocument(@CurrentUser() u: RequestUser, @Body() dto: CreateDocumentDto) { return this.documents.create(u, dto); }
  @Post('documents/:id/archive') @RequirePermission(STRUCTURE, 'EDIT')
  archiveDocument(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.documents.archive(u, id); }
}

/**
 * The receiving member's side of a transfer. Open to any signed-in member: the service only lets the member the
 * hectare is being transferred to see or answer a transfer.
 */
@ApiTags('irrigation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('irrigation/my-transfers')
export class MyTransfersController {
  constructor(private readonly allocations: AllocationService) {}

  @Get()
  incoming(@CurrentUser() u: RequestUser) { return this.allocations.incomingTransfers(u); }
  @Post(':id/accept')
  accept(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.allocations.respondToTransfer(u, id, true); }
  @Post(':id/decline')
  decline(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: DeclineTransferDto) { return this.allocations.respondToTransfer(u, id, false, dto.reason); }
}

/**
 * A member's own side: their hectares, starting a transfer, and asking for a dependent to be released as an independent member.
 * Open to any signed-in member; the services only let someone act on hectares that are theirs.
 */
@ApiTags('irrigation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('irrigation/my-plots')
export class MyPlotsController {
  constructor(private readonly allocations: AllocationService, private readonly emancipation: EmancipationService) {}

  @Get()
  mine(@CurrentUser() u: RequestUser) { return this.allocations.myPlots(u); }
  @Post('transfers')
  transfer(@CurrentUser() u: RequestUser, @Body() dto: MyTransferRequestDto) { return this.allocations.requestMyTransfer(u, dto); }
  @Post('transfers/:id/cancel')
  cancelTransfer(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.allocations.cancelMyTransfer(u, id); }
  @Post('emancipations')
  requestEmancipation(@CurrentUser() u: RequestUser, @Body() dto: EmancipationRequestDto) { return this.emancipation.requestMine(u, dto); }
  @Post('emancipations/:id/cancel')
  cancelEmancipation(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.emancipation.cancelMine(u, id); }
}
