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
  receiveInventory(@Body() createInventoryRecordDto: CreateInventoryRecordDto) {
    return this.inventoryService.receiveInventory(createInventoryRecordDto);
  }

  @Post('records/mine')
  @Roles(UserRole.FARMER)
  @ApiOperation({
    summary:
      'Farmer self-reports a warehouse delivery for their own crop cycle',
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
  findAllRecords() {
    return this.inventoryService.findAllRecords();
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
  dashboardSummary() {
    return this.inventoryService.dashboardSummary();
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
  findRecordById(@Param('id') id: string) {
    return this.inventoryService.findRecordById(id);
  }

  @Patch('records/:id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary: 'Update inventory warehouse storage status and location',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() updateInventoryStatusDto: UpdateInventoryStatusDto,
  ) {
    return this.inventoryService.updateStatus(id, updateInventoryStatusDto);
  }

  @Post('lots')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Combine multiple inventory records into a single Fairtrade export Lot',
  })
  createLot(@Body() createLotDto: CreateLotDto) {
    return this.inventoryService.createLot(createLotDto);
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
  findAllLots() {
    return this.inventoryService.findAllLots();
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
  findLotByNumber(@Param('lotNumber') lotNumber: string) {
    return this.inventoryService.findLotByNumber(lotNumber);
  }
}
