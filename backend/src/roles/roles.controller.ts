import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('resources')
  getResources() {
    return this.roles.getResources();
  }

  @Get()
  findAll() {
    return this.roles.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.roles.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id') id: string) {
    return this.roles.getPermissions(id);
  }

  @Put(':id/permissions')
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.roles.setPermissions(id, dto);
  }
}
