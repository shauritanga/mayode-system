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
import { MamcosService } from './mamcos.service';
import {
  CreateMamcosDto,
  UpdateMamcosDto,
  AssignFarmerDto,
  CreateSecretaryDto,
} from './dto/mamcos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { UserRole } from '@prisma/client';

@ApiTags('mamcos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('mamcos')
export class MamcosController {
  constructor(private readonly mamcosService: MamcosService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('mamcos', 'CREATE')
  @ApiOperation({
    summary: 'Create a new MAMCOS cooperative scheme (Admin only)',
  })
  create(@Body() createMamcosDto: CreateMamcosDto) {
    return this.mamcosService.create(createMamcosDto);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @RequirePermission('mamcos', 'VIEW')
  @ApiOperation({ summary: 'Get all MAMCOS cooperative schemes' })
  findAll(@CurrentUser() user: RequestUser) {
    return this.mamcosService.findAll(user);
  }

  @Get('secretary-dashboard')
  @Roles(UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Get MAMCOS Secretary dashboard (active scheme, farmers, stability bonus)',
  })
  getSecretaryDashboard(@CurrentUser() user: { id: string }) {
    return this.mamcosService.getSecretaryDashboard(user.id);
  }

  @Get('staff/field-officers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Platform-wide field officer directory (for admin assignment pickers)',
  })
  findAllFieldOfficers() {
    return this.mamcosService.findAllFieldOfficers();
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @RequirePermission('mamcos', 'VIEW')
  @ApiOperation({ summary: 'Get MAMCOS details by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.mamcosService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('mamcos', 'EDIT')
  @ApiOperation({ summary: 'Update MAMCOS scheme details' })
  update(@Param('id') id: string, @Body() updateMamcosDto: UpdateMamcosDto) {
    return this.mamcosService.update(id, updateMamcosDto);
  }

  @Post(':id/assign-farmer')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  @ApiOperation({ summary: 'Assign a farmer to a MAMCOS cooperative scheme' })
  assignFarmer(
    @Param('id') id: string,
    @Body() assignFarmerDto: AssignFarmerDto,
  ) {
    return this.mamcosService.assignFarmer(id, assignFarmerDto);
  }

  @Post(':id/secretary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Register a secretary for a MAMCOS cooperative scheme',
  })
  createSecretary(
    @Param('id') id: string,
    @Body() createSecretaryDto: CreateSecretaryDto,
  ) {
    return this.mamcosService.createSecretary(id, createSecretaryDto);
  }
}
