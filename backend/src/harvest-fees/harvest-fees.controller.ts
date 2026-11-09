import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { HarvestFeesService } from './harvest-fees.service';
import { ClearanceQueryDto, DecideRateDto, OpenHarvestDto, ProposeRateDto } from './dto/harvest-fees.dto';

@ApiTags('harvest')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('harvest')
export class HarvestFeesController {
  constructor(private readonly harvest: HarvestFeesService) {}

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
}
