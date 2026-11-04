import { PermissionResource } from '../auth/role-access';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SuppliersService } from './suppliers.service';
import { UpdateSupplierDto, UpsertSupplierDto } from './dto/supplier.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('suppliers', 'CREATE')
  create(@Body() dto: UpsertSupplierDto, @CurrentUser() user: RequestUser) {
    return this.suppliers.create(dto, user);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @RequirePermission('suppliers', 'VIEW')
  findAll(@CurrentUser() user: RequestUser) {
    return this.suppliers.findAll(user);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @RequirePermission('suppliers', 'VIEW')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.suppliers.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('suppliers', 'EDIT')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() user: RequestUser) {
    return this.suppliers.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('suppliers', 'DELETE')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.suppliers.remove(id, user);
  }
}
