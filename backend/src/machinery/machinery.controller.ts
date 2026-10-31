import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { MachineryService } from './machinery.service';
import {
  CreateActivityDto, CreateEquipmentDto, ListQueryDto, MarkFeePaidDto, UpdateActivityDto, UpdateEquipmentDto,
} from './dto/machinery.dto';

@ApiTags('machinery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('machinery')
export class MachineryController {
  constructor(private readonly machinery: MachineryService) {}

  @Get('equipment') @RequirePermission('machinery', 'VIEW')
  listEquipment(@CurrentUser() u: RequestUser, @Query() q: { mamcosId?: string; includeInactive?: string }) { return this.machinery.listEquipment(u, q); }
  @Post('equipment') @RequirePermission('machinery', 'CREATE')
  createEquipment(@CurrentUser() u: RequestUser, @Body() dto: CreateEquipmentDto, @Query('mamcosId') m?: string) { return this.machinery.createEquipment(u, dto, m); }
  @Patch('equipment/:id') @RequirePermission('machinery', 'EDIT')
  updateEquipment(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateEquipmentDto, @Query('mamcosId') m?: string) { return this.machinery.updateEquipment(u, id, dto, m); }

  @Get('activities') @RequirePermission('machinery', 'VIEW')
  listActivities(@CurrentUser() u: RequestUser, @Query() q: ListQueryDto) { return this.machinery.listActivities(u, q); }
  @Post('activities') @RequirePermission('machinery', 'CREATE')
  createActivity(@CurrentUser() u: RequestUser, @Body() dto: CreateActivityDto, @Query('mamcosId') m?: string) { return this.machinery.createActivity(u, dto, m); }
  @Patch('activities/:id') @RequirePermission('machinery', 'EDIT')
  updateActivity(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateActivityDto, @Query('mamcosId') m?: string) { return this.machinery.updateActivity(u, id, dto, m); }
  @Post('activities/:id/fee-paid') @RequirePermission('machinery', 'EDIT')
  feePaid(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: MarkFeePaidDto, @Query('mamcosId') m?: string) { return this.machinery.markFeePaid(u, id, dto.paidOn, m); }
}
