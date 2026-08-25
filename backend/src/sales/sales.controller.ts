import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import {
  CollectBuyerPaymentDto,
  CreateSaleDto,
  SettleSaleDto,
} from './dto/sales.dto';
import { CreateDispatchDto } from './dto/dispatch.dto';
import { SalesService } from './sales.service';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('sales', 'CREATE')
  @ApiOperation({
    summary:
      'Create a cooperative sale and allocate revenue by source inventory weight',
  })
  create(@Body() dto: CreateSaleDto) {
    return this.sales.create(dto);
  }
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @RequirePermission('sales', 'VIEW')
  findAll() {
    return this.sales.findAll();
  }
  @Post(':id/settle')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  settle(@Param('id') id: string, @Body() dto: SettleSaleDto) {
    return this.sales.settle(id, dto.paymentDate);
  }
  @Post(':id/collect')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  collect(@Param('id') id: string, @Body() dto: CollectBuyerPaymentDto) {
    return this.sales.collectBuyerPayment(id, dto.phoneNumber);
  }
  @Get('traceability/:reference')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.BUYER,
  )
  traceability(@Param('reference') reference: string) {
    return this.sales.traceability(reference);
  }
  @Get(':reference/dispatch-lookup')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  dispatchLookup(@Param('reference') reference: string) {
    return this.sales.dispatchLookup(reference);
  }
  @Post(':reference/dispatch')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  createDispatch(
    @Param('reference') reference: string,
    @Body() dto: CreateDispatchDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sales.createDispatch(reference, dto, user.id);
  }
  @Get(':idOrInvoice')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  findOne(@Param('idOrInvoice') idOrInvoice: string) {
    return this.sales.findOne(idOrInvoice);
  }
}
