import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { LendersService } from './lenders.service';
import { CreateLenderDto, UpdateLenderDto } from './dto/loans.dto';

@ApiTags('lenders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('lenders')
export class LendersController {
  constructor(private readonly lenders: LendersService) {}

  @Get()
  @RequirePermission('loans', 'VIEW')
  findAll() {
    return this.lenders.findAll();
  }

  @Get(':id')
  @RequirePermission('loans', 'VIEW')
  findOne(@Param('id') id: string) {
    return this.lenders.findOne(id);
  }

  @Post()
  @RequirePermission('loans', 'CREATE')
  create(@Body() dto: CreateLenderDto) {
    return this.lenders.create(dto);
  }

  @Patch(':id')
  @RequirePermission('loans', 'EDIT')
  update(@Param('id') id: string, @Body() dto: UpdateLenderDto) {
    return this.lenders.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('loans', 'DELETE')
  remove(@Param('id') id: string) {
    return this.lenders.remove(id);
  }
}
