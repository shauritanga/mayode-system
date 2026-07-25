import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryRecordDto, UpdateInventoryStatusDto, CreateLotDto } from './dto/inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('records')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Receive harvest inventory at warehouse with auto-generated tracking code (INV-YYYY-XXXX)' })
  receiveInventory(@Body() createInventoryRecordDto: CreateInventoryRecordDto) {
    return this.inventoryService.receiveInventory(createInventoryRecordDto);
  }

  @Get('records')
  @ApiOperation({ summary: 'Get all received harvest inventory records' })
  findAllRecords() {
    return this.inventoryService.findAllRecords();
  }

  @Get('records/:id')
  @ApiOperation({ summary: 'Get inventory record details by ID' })
  findRecordById(@Param('id') id: string) {
    return this.inventoryService.findRecordById(id);
  }

  @Patch('records/:id/status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Update inventory warehouse storage status and location' })
  updateStatus(@Param('id') id: string, @Body() updateInventoryStatusDto: UpdateInventoryStatusDto) {
    return this.inventoryService.updateStatus(id, updateInventoryStatusDto);
  }

  @Post('lots')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Combine multiple inventory records into a single Fairtrade export Lot' })
  createLot(@Body() createLotDto: CreateLotDto) {
    return this.inventoryService.createLot(createLotDto);
  }

  @Get('lots')
  @ApiOperation({ summary: 'Get all export Lots' })
  findAllLots() {
    return this.inventoryService.findAllLots();
  }

  @Get('lots/:lotNumber')
  @ApiOperation({ summary: 'Get Lot complete traceability details by Lot Number' })
  findLotByNumber(@Param('lotNumber') lotNumber: string) {
    return this.inventoryService.findLotByNumber(lotNumber);
  }
}
