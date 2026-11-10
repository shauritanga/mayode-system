import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { CashDrawerService } from './cash-drawer.service';
import { InputDistributionService } from './input-distribution.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { MaintenanceService } from './maintenance.service';
import { ComplianceReportService } from './compliance-report.service';
import {
  AcknowledgeDto, CloseDrawerDto, CreateOrderDto, CreateScheduleDto, DoneDto, DrawerQueryDto, IssueInputDto, IssueQueryDto,
  OrderQueryDto, ReasonDto, ReceiveDrawerDto, ReceiveOrderDto, UpdateScheduleDto,
} from './dto/staff-tasks.dto';

const guards = [JwtAuthGuard, RolesGuard, PermissionsGuard];

@ApiTags('cash-drawer') @ApiBearerAuth() @UseGuards(...guards) @Controller('cash-drawer')
export class CashDrawerController {
  constructor(private readonly svc: CashDrawerService) {}
  @Get('today') @RequirePermission('cash_drawer', 'VIEW')
  mine(@CurrentUser() u: RequestUser, @Query('day') d?: string, @Query('mamcosId') m?: string) { return this.svc.mine(u, d, m); }
  @Post('close') @RequirePermission('cash_drawer', 'CREATE')
  close(@CurrentUser() u: RequestUser, @Body() dto: CloseDrawerDto, @Query('mamcosId') m?: string) { return this.svc.close(u, dto, m); }
  @Get() @RequirePermission('cash_drawer', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: DrawerQueryDto) { return this.svc.list(u, q, q.mamcosId); }
  @Post(':id/receive') @RequirePermission('cash_drawer', 'EDIT')
  receive(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReceiveDrawerDto, @Query('mamcosId') m?: string) { return this.svc.receive(u, id, dto, m); }
}

@ApiTags('input-distribution') @ApiBearerAuth() @UseGuards(...guards) @Controller('input-distribution')
export class InputDistributionController {
  constructor(private readonly svc: InputDistributionService) {}
  @Get('items') @RequirePermission('input_distribution', 'VIEW')
  items(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.items(u, m); }
  @Get() @RequirePermission('input_distribution', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: IssueQueryDto) { return this.svc.list(u, q, q.mamcosId); }
  @Post() @RequirePermission('input_distribution', 'CREATE')
  issue(@CurrentUser() u: RequestUser, @Body() dto: IssueInputDto, @Query('mamcosId') m?: string) { return this.svc.issue(u, dto, m); }
  @Post(':id/acknowledge') @RequirePermission('input_distribution', 'EDIT')
  acknowledge(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: AcknowledgeDto, @Query('mamcosId') m?: string) { return this.svc.acknowledge(u, id, dto.code, m); }
  @Post(':id/resend') @RequirePermission('input_distribution', 'EDIT')
  resend(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.svc.resend(u, id, m); }
}

@ApiTags('purchase-orders') @ApiBearerAuth() @UseGuards(...guards) @Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}
  @Get() @RequirePermission('purchase_orders', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: OrderQueryDto) { return this.svc.list(u, q, q.mamcosId); }
  @Post() @RequirePermission('purchase_orders', 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateOrderDto, @Query('mamcosId') m?: string) { return this.svc.create(u, dto, m); }
  @Get(':id') @RequirePermission('purchase_orders', 'VIEW')
  detail(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.svc.detail(u, id, m); }
  @Post(':id/approve') @RequirePermission('purchase_order_approval', 'EDIT')
  approve(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.svc.approve(u, id, m); }
  @Post(':id/cancel') @RequirePermission('purchase_orders', 'EDIT')
  cancel(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto, @Query('mamcosId') m?: string) { return this.svc.cancel(u, id, dto.reason, m); }
  @Post(':id/receive') @RequirePermission('purchase_orders', 'EDIT')
  receive(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReceiveOrderDto, @Query('mamcosId') m?: string) { return this.svc.receive(u, id, dto, m); }
}

@ApiTags('maintenance') @ApiBearerAuth() @UseGuards(...guards) @Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly svc: MaintenanceService) {}
  @Get('structure') @RequirePermission('maintenance_schedule', 'VIEW')
  structure(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.structure(u, m); }
  @Get() @RequirePermission('maintenance_schedule', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.list(u, m); }
  @Post() @RequirePermission('maintenance_schedule', 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateScheduleDto, @Query('mamcosId') m?: string) { return this.svc.create(u, dto, m); }
  @Post(':id/done') @RequirePermission('maintenance_schedule', 'EDIT')
  done(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: DoneDto, @Query('mamcosId') m?: string) { return this.svc.done(u, id, dto, m); }
  @Patch(':id') @RequirePermission('maintenance_schedule', 'EDIT')
  update(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateScheduleDto, @Query('mamcosId') m?: string) { return this.svc.update(u, id, dto, m); }
}

@ApiTags('compliance') @ApiBearerAuth() @UseGuards(...guards) @Controller('compliance-report')
export class ComplianceReportController {
  constructor(private readonly svc: ComplianceReportService) {}
  @Get() @RequirePermission('governance', 'VIEW')
  report(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.svc.report(u, m); }
}
