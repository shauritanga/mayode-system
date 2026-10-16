import { PermissionResource } from '../auth/role-access';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryRecordDto,
  UpdateInventoryStatusDto,
  CreateLotDto,
  FarmerReportDeliveryDto,
  UpdateInventoryRecordDto,
  RecordFarmerPaymentDto,
  CollectionCentreDto,
} from './dto/inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { UserRole } from '@prisma/client';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('records')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  @RequirePermission('inventory', 'CREATE')
  @ApiOperation({
    summary:
      'Receive harvest inventory at warehouse with auto-generated tracking code (INV-YYYY-XXXX)',
  })
  receiveInventory(
    @Body() createInventoryRecordDto: CreateInventoryRecordDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.receiveInventory(
      createInventoryRecordDto,
      user,
    );
  }

  @Post('records/mine')
  @Roles(UserRole.FARMER)
  @RequirePermission('inventory', 'CREATE')
  @ApiOperation({
    summary:
      'Report a warehouse delivery: farmers self-report their own crop cycles; grant-holding staff may record on a farmer’s behalf (attributed to the cycle’s farmer)',
  })
  reportMyDelivery(
    @CurrentUser() user: RequestUser,
    @Body() dto: FarmerReportDeliveryDto,
  ) {
    return this.inventoryService.reportMyDelivery(user, dto);
  }

  @Get('records/mine')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'List warehouse receipts for the logged-in farmer' })
  findMyRecords(
    @CurrentUser() user: RequestUser,
    @Query('cropCycleId') cropCycleId?: string,
  ) {
    return this.inventoryService.findMyRecords(user, cropCycleId);
  }

  @Get('summary/mine')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: 'Warehouse stock summary for the logged-in farmer' })
  mySummary(@CurrentUser() user: RequestUser) {
    return this.inventoryService.mySummary(user);
  }

  @Get('records')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @RequirePermission('inventory', 'VIEW')
  @ApiOperation({ summary: 'Get all received harvest inventory records' })
  findAllRecords(@CurrentUser() user: RequestUser) {
    return this.inventoryService.findAllRecords(user);
  }

  @Get('dashboard-summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary:
      'Warehouse dashboard aggregates: totals by grade, warehouse, status and variety',
  })
  dashboardSummary(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryService.dashboardSummary(user, {
      from,
      to,
      warehouseId,
    });
  }

  @Get('records/:id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @RequirePermission('inventory', 'VIEW')
  @ApiOperation({ summary: 'Get inventory record details by ID' })
  findRecordById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.inventoryService.findRecordById(id, user);
  }

  @Patch('records/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('inventory', 'EDIT')
  @ApiOperation({
    summary:
      'Complete a delivery after weighing and grading: price, variety, bags, centre, batch',
  })
  updateRecord(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryRecordDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateRecord(id, dto, user);
  }

  @Post('records/:id/payments')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('inventory', 'EDIT')
  @ApiOperation({ summary: 'Record a payment made to the farmer for a delivery' })
  recordFarmerPayment(
    @Param('id') id: string,
    @Body() dto: RecordFarmerPaymentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.recordFarmerPayment(id, dto, user);
  }

  @Get('centres')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @RequirePermission('inventory', 'VIEW')
  @ApiOperation({ summary: 'Collection centres' })
  listCentres(@CurrentUser() user: RequestUser) {
    return this.inventoryService.listCentres(user);
  }

  @Post('centres')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('inventory', 'CREATE')
  @ApiOperation({ summary: 'Add a collection centre' })
  createCentre(
    @Body() dto: CollectionCentreDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.createCentre(dto, user);
  }

  @Patch('centres/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('inventory', 'EDIT')
  @ApiOperation({ summary: 'Edit or deactivate a collection centre' })
  updateCentre(
    @Param('id') id: string,
    @Body() dto: CollectionCentreDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateCentre(id, dto, user);
  }

  @Patch('records/:id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary: 'Update inventory warehouse storage status and location',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() updateInventoryStatusDto: UpdateInventoryStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.updateStatus(
      id,
      updateInventoryStatusDto,
      user,
    );
  }

  @Post('lots')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Combine multiple inventory records into a single Fairtrade export Lot',
  })
  createLot(
    @Body() createLotDto: CreateLotDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.createLot(createLotDto, user);
  }

  @Get('lots')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({ summary: 'Get all export Lots' })
  findAllLots(@CurrentUser() user: RequestUser) {
    return this.inventoryService.findAllLots(user);
  }

  @Get('lots/:lotNumber')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get Lot complete traceability details by Lot Number',
  })
  findLotByNumber(
    @Param('lotNumber') lotNumber: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryService.findLotByNumber(lotNumber, user);
  }
}
