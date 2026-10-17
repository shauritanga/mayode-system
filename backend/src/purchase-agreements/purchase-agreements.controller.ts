import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PermissionResource } from '../auth/role-access';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { PurchaseAgreementsService } from './purchase-agreements.service';
import { AgreementStatusDto, CreateAgreementDto, UpdateAgreementDto } from './dto/agreement.dto';

const STAFF = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY];

@ApiTags('purchase-agreements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('buyer_orders')
@Controller('purchase-agreements')
export class PurchaseAgreementsController {
  constructor(private readonly agreements: PurchaseAgreementsService) {}

  @Get()
  @Roles(...STAFF, UserRole.AUDITOR)
  @RequirePermission('buyer_orders', 'VIEW')
  list(@CurrentUser() user: RequestUser, @Query('status') status?: string, @Query('buyerId') buyerId?: string) {
    return this.agreements.list(user, { status, buyerId });
  }

  @Get(':id')
  @Roles(...STAFF, UserRole.AUDITOR)
  @RequirePermission('buyer_orders', 'VIEW')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.agreements.findOne(id, user);
  }

  @Post()
  @Roles(...STAFF)
  @RequirePermission('buyer_orders', 'CREATE')
  create(@Body() dto: CreateAgreementDto, @CurrentUser() user: RequestUser) {
    return this.agreements.create(dto, user);
  }

  @Patch(':id')
  @Roles(...STAFF)
  @RequirePermission('buyer_orders', 'EDIT')
  update(@Param('id') id: string, @Body() dto: UpdateAgreementDto, @CurrentUser() user: RequestUser) {
    return this.agreements.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(...STAFF)
  @RequirePermission('buyer_orders', 'EDIT')
  setStatus(@Param('id') id: string, @Body() dto: AgreementStatusDto, @CurrentUser() user: RequestUser) {
    return this.agreements.setStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('buyer_orders', 'DELETE')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.agreements.remove(id, user);
  }
}
