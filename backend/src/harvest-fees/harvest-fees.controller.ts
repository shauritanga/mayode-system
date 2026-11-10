import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { HarvestFeesService } from './harvest-fees.service';
import { HarvestGateService } from './harvest-gate.service';
import { ClearanceQueryDto, DecideRateDto, GateQueryDto, HoldPassDto, LogArrivalDto, OpenHarvestDto, ProposeRateDto, ReconcileDto, ReportIncidentDto, ResolveIncidentDto, SplitDto, UsePassDto } from './dto/harvest-fees.dto';

@ApiTags('harvest')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('harvest')
export class HarvestFeesController {
  constructor(private readonly harvest: HarvestFeesService, private readonly gate: HarvestGateService) {}

  @Get('structure') @RequirePermission('harvest_clearance', 'VIEW')
  structure(@CurrentUser() u: RequestUser, @Query('mamcosId') mamcosId?: string) { return this.harvest.structure(u, mamcosId); }

  @Get('rates') @RequirePermission('harvest_fees', 'VIEW')
  rates(@CurrentUser() u: RequestUser, @Query('mamcosId') mamcosId?: string) { return this.harvest.listRates(u, mamcosId); }

  @Post('rates') @RequirePermission('harvest_fees', 'CREATE')
  propose(@CurrentUser() u: RequestUser, @Body() dto: ProposeRateDto, @Query('mamcosId') mamcosId?: string) { return this.harvest.proposeRate(dto, u, mamcosId); }

  @Patch('rates/:id/decision') @RequirePermission('harvest_fee_approval', 'EDIT')
  decide(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: DecideRateDto, @Query('mamcosId') mamcosId?: string) { return this.harvest.decideRate(id, dto, u, mamcosId); }

  @Post('open') @RequirePermission('harvest_fees', 'CREATE')
  open(@CurrentUser() u: RequestUser, @Body() dto: OpenHarvestDto, @Query('mamcosId') mamcosId?: string) { return this.harvest.openHarvest(dto, u, mamcosId); }

  @Get('blocks/:blockId/clearance') @RequirePermission('harvest_clearance', 'VIEW')
  clearance(@CurrentUser() u: RequestUser, @Param('blockId') blockId: string, @Query() q: ClearanceQueryDto) { return this.harvest.clearance(blockId, u, q.typeId); }

  @Get('canals/:canalId/summary') @RequirePermission('harvest_clearance', 'VIEW')
  canal(@CurrentUser() u: RequestUser, @Param('canalId') canalId: string) { return this.harvest.canalSummary(canalId, u); }

  // ── The gate: passes, arrivals, incidents ──
  @Get('passes/lookup') @RequirePermission('harvest_passes', 'VIEW')
  lookup(@CurrentUser() u: RequestUser, @Query() q: GateQueryDto) { return this.gate.lookup(u, q.code ?? ''); }

  @Post('passes/use') @RequirePermission('harvest_passes', 'EDIT')
  use(@CurrentUser() u: RequestUser, @Body() dto: UsePassDto) { return this.gate.usePass(u, dto); }

  @Post('passes/:id/hold') @RequirePermission('harvest_fees', 'EDIT')
  hold(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: HoldPassDto) { return this.gate.hold(u, id, dto.reason); }

  @Post('passes/:id/release') @RequirePermission('harvest_fees', 'EDIT')
  release(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.gate.release(u, id); }

  @Get('arrivals') @RequirePermission('harvest_passes', 'VIEW')
  arrivals(@CurrentUser() u: RequestUser, @Query() q: GateQueryDto) { return this.gate.listArrivals(u, q); }

  @Post('arrivals') @RequirePermission('harvest_passes', 'CREATE')
  logArrival(@CurrentUser() u: RequestUser, @Body() dto: LogArrivalDto) { return this.gate.logArrival(u, dto); }

  @Post('arrivals/:id/depart') @RequirePermission('harvest_passes', 'CREATE')
  depart(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.gate.depart(u, id); }

  @Get('incidents') @RequirePermission('harvest_passes', 'VIEW')
  incidents(@CurrentUser() u: RequestUser, @Query() q: GateQueryDto) { return this.gate.listIncidents(u, q); }

  @Post('incidents') @RequirePermission('harvest_passes', 'CREATE')
  reportIncident(@CurrentUser() u: RequestUser, @Body() dto: ReportIncidentDto) { return this.gate.reportIncident(u, dto); }

  @Post('incidents/:id/resolve') @RequirePermission('harvest_passes', 'EDIT')
  resolveIncident(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ResolveIncidentDto) { return this.gate.resolveIncident(u, id, dto.resolution); }

  // ── Ring-fencing and the Accountant's daily reconciliation ──
  @Get('fund-split') @RequirePermission('harvest_fees', 'VIEW')
  split(@CurrentUser() u: RequestUser, @Query() q: GateQueryDto) { return this.gate.getSplit(u, q.mamcosId); }

  @Put('fund-split') @RequirePermission('harvest_fee_approval', 'EDIT')
  setSplit(@CurrentUser() u: RequestUser, @Body() dto: SplitDto, @Query() q: GateQueryDto) { return this.gate.setSplit(u, dto.maintenancePercent, q.mamcosId); }

  @Get('reconciliation') @RequirePermission('harvest_fees', 'VIEW')
  reconciliation(@CurrentUser() u: RequestUser, @Query() q: GateQueryDto) { return this.gate.reconciliation(u, q.day, q.mamcosId); }

  @Post('reconciliation') @RequirePermission('harvest_fees', 'EDIT')
  reconcile(@CurrentUser() u: RequestUser, @Body() dto: ReconcileDto, @Query() q: GateQueryDto) { return this.gate.reconcile(u, dto.day, dto.note, q.mamcosId); }
}
