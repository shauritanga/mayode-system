import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionResource } from '../auth/role-access';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { WarehousesService } from './warehouses.service';
import {
  AdjustStockDto,
  AssignKeeperDto,
  CreateWarehouseDto,
  MakeLotDto,
  ReceiveStockDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';

@ApiTags('warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermission('warehouses', 'VIEW')
  @ApiOperation({
    summary:
      'Warehouses in your scope with live on-hand / reserved / available stock',
  })
  findAll(@CurrentUser() user: RequestUser) {
    return this.warehouses.findAll(user);
  }

  @Post()
  @RequirePermission('warehouses', 'CREATE')
  create(@Body() dto: CreateWarehouseDto, @CurrentUser() user: RequestUser) {
    return this.warehouses.create(dto, user);
  }

  @Get('unreceived-records')
  @RequirePermission('warehouse_desk', 'VIEW')
  unreceived(@CurrentUser() user: RequestUser) {
    return this.warehouses.unreceivedRecords(user);
  }

  @Patch(':id')
  @RequirePermission('warehouses', 'EDIT')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouses.update(id, dto, user);
  }

  @Post(':id/keepers')
  @RequirePermission('warehouses', 'EDIT')
  assignKeeper(
    @Param('id') id: string,
    @Body() dto: AssignKeeperDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouses.assignKeeper(id, dto.userId, user);
  }

  @Delete(':id/keepers/:userId')
  @RequirePermission('warehouses', 'EDIT')
  removeKeeper(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouses.removeKeeper(id, userId, user);
  }

  @Post(':id/receive')
  @RequirePermission('warehouse_desk', 'EDIT')
  @ApiOperation({
    summary: 'Receive harvest into this warehouse (adds an IN stock movement)',
  })
  receive(
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouses.receive(id, dto, user);
  }

  @Post(':id/adjust')
  @RequirePermission('warehouse_desk', 'EDIT')
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouses.adjust(id, dto, user);
  }

  @Post(':id/lots')
  @RequirePermission('warehouse_desk', 'EDIT')
  @ApiOperation({
    summary:
      'Make a sellable lot out of counted stock that no lot accounts for yet',
  })
  makeLot(
    @Param('id') id: string,
    @Body() dto: MakeLotDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.warehouses.makeLot(id, dto, user);
  }

  @Get(':id/movements')
  @RequirePermission('warehouses', 'VIEW')
  movements(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('take', new ParseIntPipe({ optional: true })) take?: number,
  ) {
    return this.warehouses.movements(id, user, take ?? 100);
  }
}
