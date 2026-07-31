import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CollectBuyerPaymentDto, CreateSaleDto, SettleSaleDto } from './dto/sales.dto';
import { SalesService } from './sales.service';

@ApiTags('sales') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}
  @Post() @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Create a cooperative sale and allocate revenue by source inventory weight' })
  create(@Body() dto: CreateSaleDto) { return this.sales.create(dto); }
  @Get()
  findAll() { return this.sales.findAll(); }
  @Post(':id/settle') @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  settle(@Param('id') id: string, @Body() dto: SettleSaleDto) { return this.sales.settle(id, dto.paymentDate); }
  @Post(':id/collect') @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  collect(@Param('id') id: string, @Body() dto: CollectBuyerPaymentDto) { return this.sales.collectBuyerPayment(id, dto.phoneNumber); }
  @Get('traceability/:reference')
  traceability(@Param('reference') reference: string) { return this.sales.traceability(reference); }
  @Get(':idOrInvoice')
  findOne(@Param('idOrInvoice') idOrInvoice: string) { return this.sales.findOne(idOrInvoice); }
}
