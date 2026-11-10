import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { HarvestCollectionsService } from './harvest-collections.service';
import { CollectDto, CollectionQueryDto, CreateCollectionDto, CreateCombineDto, HarvestSettingDto, UpdateCombineDto, VoidDto } from './dto/harvest-collections.dto';

@ApiTags('harvest-collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('harvest-collections')
export class HarvestCollectionsController {
  constructor(private readonly svc: HarvestCollectionsService) {}

  @Get('settings') @RequirePermission('harvest_collections', 'VIEW')
  settings(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.settings(u, m); }
  @Put('settings') @RequirePermission('combine_harvesters', 'EDIT')
  saveSettings(@CurrentUser() u: RequestUser, @Body() dto: HarvestSettingDto, @Query('mamcosId') m?: string) { return this.svc.saveSettings(u, dto, m); }

  @Get('combines') @RequirePermission('combine_harvesters', 'VIEW')
  combines(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.listCombines(u, m); }
  @Get('combines/lookup') @RequirePermission('combine_harvesters', 'VIEW')
  lookup(@CurrentUser() u: RequestUser, @Query('registration') r: string, @Query('mamcosId') m?: string) { return this.svc.lookupCombine(u, r, m); }
  @Post('combines') @RequirePermission('combine_harvesters', 'CREATE')
  createCombine(@CurrentUser() u: RequestUser, @Body() dto: CreateCombineDto, @Query('mamcosId') m?: string) { return this.svc.createCombine(u, dto, m); }
  @Patch('combines/:id') @RequirePermission('combine_harvesters', 'EDIT')
  updateCombine(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateCombineDto, @Query('mamcosId') m?: string) { return this.svc.updateCombine(u, id, dto, m); }

  @Get('context') @RequirePermission('harvest_collections', 'CREATE')
  context(@CurrentUser() u: RequestUser, @Query('farmId') farmId: string, @Query('mamcosId') m?: string) { return this.svc.context(u, farmId, m); }
  @Get('pending-payments') @RequirePermission('farm_administration', 'VIEW')
  pending(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.pendingPayments(u, m); }
  @Get('report/by-combine') @RequirePermission('harvest_collections', 'VIEW')
  byCombine(@CurrentUser() u: RequestUser, @Query() q: CollectionQueryDto) { return this.svc.byCombine(u, q); }
  @Get('hectare/:hectareId') @RequirePermission('harvest_collections', 'VIEW')
  hectare(@CurrentUser() u: RequestUser, @Param('hectareId') id: string, @Query('mamcosId') m?: string) { return this.svc.hectareHistory(u, id, m); }

  @Get() @RequirePermission('harvest_collections', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: CollectionQueryDto) { return this.svc.list(u, q); }
  @Post() @RequirePermission('harvest_collections', 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateCollectionDto, @Query('mamcosId') m?: string) { return this.svc.create(u, dto, m); }
  @Get(':id') @RequirePermission('harvest_collections', 'VIEW')
  receipt(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.svc.receipt(u, id, m); }
  @Post(':id/collect') @RequirePermission('harvest_collections', 'EDIT')
  collect(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: CollectDto, @Query('mamcosId') m?: string) { return this.svc.collect(u, id, dto.collectorFarmerId, m); }
  @Post(':id/void') @RequirePermission('harvest_collections', 'EDIT')
  voidIt(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: VoidDto, @Query('mamcosId') m?: string) { return this.svc.voidIt(u, id, dto.reason, m); }
}
