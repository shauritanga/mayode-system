import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PermissionResource } from '../auth/role-access';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowSelfService } from '../auth/decorators/allow-self-service.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { RiceVarietiesService } from './rice-varieties.service';
import {
  CreateRiceVarietyDto,
  UpdateRiceVarietyDto,
} from './dto/rice-variety.dto';

@ApiTags('rice-varieties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('rice_protocols')
@Controller('rice-varieties')
export class RiceVarietiesController {
  constructor(private readonly varieties: RiceVarietiesService) {}

  // The catalog is not sensitive and every farmer or officer needs it to pick a variety.
  @Get()
  @AllowSelfService()
  @ApiOperation({
    summary:
      'Rice varieties farmers can choose (Super Admin may include hidden ones)',
  })
  list(
    @CurrentUser() user: RequestUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.varieties.list(
      includeInactive === 'true' && user.role === UserRole.SUPER_ADMIN,
    );
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin adds a rice variety' })
  create(@Body() dto: CreateRiceVarietyDto) {
    return this.varieties.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Super Admin edits, hides or restores a rice variety',
  })
  update(@Param('id') id: string, @Body() dto: UpdateRiceVarietyDto) {
    return this.varieties.update(id, dto);
  }
}
