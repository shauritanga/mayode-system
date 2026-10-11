import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SaleOrderStatus } from '@prisma/client';
import { PermissionResource } from '../auth/role-access';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { SaleOrdersService } from './sale-orders.service';
import {
  ApproveSaleOrderDto,
  CancelSaleOrderDto,
  CreateSaleOrderDto,
  LoadStatusDto,
  LoadTruckDto,
} from './dto/sale-order.dto';

@ApiTags('sale-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('sale_orders')
@Controller('sale-orders')
export class SaleOrdersController {
  constructor(private readonly orders: SaleOrdersService) {}

  @Post()
  @RequirePermission('sale_orders', 'CREATE')
  @ApiOperation({
    summary:
      'Salesperson reserves stock for a buyer; a reference number is issued',
  })
  reserve(@Body() dto: CreateSaleOrderDto, @CurrentUser() user: RequestUser) {
    return this.orders.reserve(dto, user);
  }

  @Get()
  @RequirePermission('sale_orders', 'VIEW')
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('status') status?: SaleOrderStatus,
    @Query('q') q?: string,
  ) {
    return this.orders.findAll(user, { status, q });
  }

  @Get('lots')
  @RequirePermission('sale_orders', 'CREATE')
  @ApiOperation({
    summary:
      'Lots in a warehouse with rice left to sell (for the new-order form)',
  })
  lots(
    @Query('warehouseId') warehouseId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.sellableLots(warehouseId, user);
  }

  @Get('lookup/:reference')
  @RequirePermission('warehouse_desk', 'VIEW')
  @ApiOperation({
    summary:
      'Warehouse keeper looks up an order by the reference the buyer presents',
  })
  lookup(
    @Param('reference') reference: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.lookup(reference, user);
  }

  @Get(':id')
  @RequirePermission('sale_orders', 'VIEW')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.orders.detail(id, user);
  }

  @Post(':id/cancel')
  @RequirePermission('sale_orders', 'EDIT')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelSaleOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.cancel(id, dto.reason, user);
  }

  @Post(':id/confirm')
  @RequirePermission('warehouse_desk', 'EDIT')
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body('note') note?: string,
  ) {
    return this.orders.confirm(id, user, note);
  }

  @Post(':id/approve')
  @RequirePermission('release_approvals', 'EDIT')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveSaleOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.approve(id, dto, user);
  }

  @Post(':id/loads')
  @RequirePermission('warehouse_desk', 'EDIT')
  @ApiOperation({
    summary:
      'Load one truck against a confirmed order (weighed, with vehicle details). Repeat per trip until the order is fully loaded.',
  })
  loadTruck(
    @Param('id') id: string,
    @Body() dto: LoadTruckDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.loadTruck(id, dto, user);
  }

  @Post(':id/loads/:loadId/status')
  @RequirePermission('warehouse_desk', 'EDIT')
  loadStatus(
    @Param('id') id: string,
    @Param('loadId') loadId: string,
    @Body() dto: LoadStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.setLoadStatus(id, loadId, dto, user);
  }

  @Post(':id/close-short')
  @RequirePermission('release_approvals', 'EDIT')
  @ApiOperation({
    summary:
      'Manager closes a part-loaded order at the weight loaded; unloaded stock goes back on sale and the sale shrinks to match',
  })
  closeShort(
    @Param('id') id: string,
    @Body() dto: CancelSaleOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.closeShort(id, dto.reason, user);
  }

  @Post(':id/complete')
  @RequirePermission('warehouse_desk', 'EDIT')
  complete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.orders.complete(id, user);
  }
}
