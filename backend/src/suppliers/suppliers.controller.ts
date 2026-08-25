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
import { UpsertSupplierDto } from './dto/supplier.dto';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('suppliers', 'CREATE')
  create(@Body() dto: UpsertSupplierDto) {
    return this.suppliers.create(dto);
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
  findAll() {
    return this.suppliers.findAll();
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
  findOne(@Param('id') id: string) {
    return this.suppliers.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('suppliers', 'EDIT')
  update(@Param('id') id: string, @Body() dto: UpsertSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('suppliers', 'DELETE')
  remove(@Param('id') id: string) {
    return this.suppliers.remove(id);
  }
}
