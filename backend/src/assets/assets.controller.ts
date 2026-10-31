import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { AssetsService } from './assets.service';
import {
  AssetListQueryDto, CreateAssetDto, CreateMaintenanceDto, DepreciationPeriodDto, DisposeAssetDto, ReassignCustodyDto, UpdateAssetDto,
} from './dto/assets.dto';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get() @RequirePermission('assets', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: AssetListQueryDto) { return this.assets.list(u, q); }
  @Post() @RequirePermission('assets', 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateAssetDto, @Query('mamcosId') m?: string) { return this.assets.create(u, dto, m); }

  // fixed paths before ":id"
  @Get('due') @RequirePermission('assets', 'VIEW')
  due(@CurrentUser() u: RequestUser, @Query() q: { mamcosId?: string; days?: string }) { return this.assets.due(u, q); }
  @Get('disposals') @RequirePermission('assets', 'VIEW')
  disposals(@CurrentUser() u: RequestUser, @Query() q: { mamcosId?: string }) { return this.assets.listDisposals(u, q); }
  @Get('depreciation/runs') @RequirePermission('assets', 'VIEW')
  runs(@CurrentUser() u: RequestUser, @Query() q: { mamcosId?: string }) { return this.assets.depreciationRuns(u, q); }
  @Get('depreciation/preview') @RequirePermission('assets', 'VIEW')
  preview(@CurrentUser() u: RequestUser, @Query() q: DepreciationPeriodDto) { return this.assets.depreciationPreview(u, q); }
  @Post('depreciation/run') @RequirePermission('assets', 'EDIT')
  run(@CurrentUser() u: RequestUser, @Query() q: DepreciationPeriodDto) { return this.assets.runDepreciation(u, q.period, q.mamcosId); }

  @Get(':id') @RequirePermission('assets', 'VIEW')
  get(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.assets.get(u, id, m); }
  @Patch(':id') @RequirePermission('assets', 'EDIT')
  update(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateAssetDto, @Query('mamcosId') m?: string) { return this.assets.update(u, id, dto, m); }
  @Delete(':id') @RequirePermission('assets', 'DELETE')
  archive(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.assets.archive(u, id, m); }
  @Post(':id/maintenance') @RequirePermission('assets', 'EDIT')
  maintenance(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: CreateMaintenanceDto, @Query('mamcosId') m?: string) { return this.assets.addMaintenance(u, id, dto, m); }
  @Post(':id/custody') @RequirePermission('assets', 'EDIT')
  custody(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReassignCustodyDto, @Query('mamcosId') m?: string) { return this.assets.reassign(u, id, dto, m); }
  @Post(':id/dispose') @RequirePermission('assets', 'EDIT')
  dispose(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: DisposeAssetDto, @Query('mamcosId') m?: string) { return this.assets.dispose(u, id, dto, m); }
}
