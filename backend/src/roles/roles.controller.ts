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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionResource } from '../auth/role-access';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { DelegatingActor } from '../auth/delegation';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

@ApiTags('roles')
@ApiBearerAuth()
// Super Admin always passes. Cooperative admins pass only with an explicit `roles` grant,
// and RolesService confines them to their own AMCOS and to what they hold themselves.
@UseGuards(JwtAuthGuard, RolesGuard)
@PermissionResource('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('resources')
  getResources(@CurrentUser() actor: DelegatingActor) {
    return this.roles.getResources(actor);
  }

  @Get()
  findAll(@CurrentUser() actor: DelegatingActor) {
    return this.roles.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: DelegatingActor) {
    return this.roles.findOne(id, actor);
  }

  @Post()
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: DelegatingActor) {
    return this.roles.create(dto, actor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() actor: DelegatingActor) {
    return this.roles.update(id, dto, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: DelegatingActor) {
    return this.roles.remove(id, actor);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id') id: string, @CurrentUser() actor: DelegatingActor) {
    return this.roles.getPermissions(id, actor);
  }

  @Put(':id/permissions')
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto, @CurrentUser() actor: DelegatingActor) {
    return this.roles.setPermissions(id, dto, actor);
  }
}
