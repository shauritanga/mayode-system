import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { InputStockService } from './input-stock.service';
import { AdjustInputDto, ReceiveInputDto, ReverseInputDto, TransferInputDto } from './dto/input-stock.dto';

/** Warehouse stock of farm inputs, fuel and packaging bags. Permissions follow the rice side: receiving, stock, dispatch. */
@ApiTags('input-stock') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @Controller('ops/warehouse/inputs')
export class InputStockController {
  constructor(private readonly svc: InputStockService) {}
  @Get('overview') @RequirePermission('ops_stock', 'VIEW')
  overview(@CurrentUser() u: RequestUser, @Query('warehouseId') w?: string, @Query('stockClass') c?: string, @Query('mamcosId') m?: string) { return this.svc.overview(u, { warehouseId: w, stockClass: c }, m); }
  @Get('movements') @RequirePermission('ops_stock', 'VIEW')
  movements(@CurrentUser() u: RequestUser, @Query() q: Record<string, string>) { return this.svc.movements(u, { itemId: q.itemId, warehouseId: q.warehouseId, type: q.type, from: q.from, to: q.to, limit: q.limit ? Number(q.limit) : undefined }, q.mamcosId); }
  @Post('receive') @RequirePermission('ops_receiving', 'CREATE')
  receive(@CurrentUser() u: RequestUser, @Body() dto: ReceiveInputDto, @Query('mamcosId') m?: string) { return this.svc.receive(u, dto, m); }
  @Post('adjust') @RequirePermission('ops_stock', 'EDIT')
  adjust(@CurrentUser() u: RequestUser, @Body() dto: AdjustInputDto, @Query('mamcosId') m?: string) { return this.svc.adjust(u, dto, m); }
  @Post('transfer') @RequirePermission('ops_stock', 'EDIT')
  transfer(@CurrentUser() u: RequestUser, @Body() dto: TransferInputDto, @Query('mamcosId') m?: string) { return this.svc.transfer(u, dto, m); }
  @Post('movements/:id/reverse') @RequirePermission('ops_stock', 'EDIT')
  reverse(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReverseInputDto, @Query('mamcosId') m?: string) { return this.svc.reverse(u, id, dto.reason, m); }
}
