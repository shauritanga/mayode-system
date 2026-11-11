import {
  Body,
  Controller,
  ForbiddenException,
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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { OwnershipService } from '../common/ownership.service';
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
  constructor(private readonly varieties: RiceVarietiesService, private readonly ownership: OwnershipService) {}

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
    const isSuper = user.role === UserRole.SUPER_ADMIN;
    // a cooperative's staff may also see its own switched-off types, to bring them back
    const hidden = includeInactive === 'true' && (isSuper || !!user.mamcosId);
    return this.varieties.list(hidden, isSuper ? undefined : this.ownership.resolveTenantMamcosId(user));
  }

  @Post()
  @RequirePermission('amcos_settings', 'EDIT')
  @ApiOperation({ summary: 'Super Admin adds a platform-wide rice type; a cooperative adds its own' })
  create(@Body() dto: CreateRiceVarietyDto, @CurrentUser() user: RequestUser) {
    return this.varieties.create(dto, this.ownerOf(user));
  }

  /** Super Admin adds platform-wide types (null); anyone else adds to their own cooperative. */
  private ownerOf(user: RequestUser): string | null {
    if (user.role === UserRole.SUPER_ADMIN) return null;
    const own = this.ownership.resolveTenantMamcosId(user);
    if (!own) throw new ForbiddenException('Rice types belong to a cooperative');
    return own;
  }

  @Patch(':id')
  @RequirePermission('amcos_settings', 'EDIT')
  @ApiOperation({
    summary: 'Edit, hide or restore a rice type (Super Admin: any; a cooperative: its own)',
  })
  update(@Param('id') id: string, @Body() dto: UpdateRiceVarietyDto, @CurrentUser() user: RequestUser) {
    return this.varieties.update(id, dto, user.role === UserRole.SUPER_ADMIN ? undefined : this.ownership.resolveTenantMamcosId(user));
  }
}
