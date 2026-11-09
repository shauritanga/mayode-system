import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/staff.dto';

/** The AMCOS staff roster. Account on/off switches use PATCH /users/:id (isActive), which already enforces the cooperative boundary. */
@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get() @RequirePermission('users', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: Record<string, string>) { return this.staff.list(u, q); }

  @Get('role-options') @RequirePermission('users', 'VIEW')
  roleOptions(@CurrentUser() u: RequestUser, @Query('mamcosId') mamcosId?: string) { return this.staff.roleOptions(u, mamcosId); }

  /** Registered farmers of this cooperative who are not staff yet, for "add staff from farmers". */
  @Get('farmer-candidates') @RequirePermission('users', 'VIEW')
  farmerCandidates(@CurrentUser() u: RequestUser, @Query('q') q?: string, @Query('mamcosId') mamcosId?: string) { return this.staff.farmerCandidates(u, q, mamcosId); }

  @Post() @RequirePermission('users', 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateStaffDto, @Query('mamcosId') mamcosId?: string) { return this.staff.create(dto, u, mamcosId); }

  /** For a farmer who is also staff: takes the staff role away and leaves the farmer login untouched. */
  @Post(':id/remove-access') @RequirePermission('users', 'EDIT')
  removeAccess(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') mamcosId?: string) { return this.staff.removeAccess(id, u, mamcosId); }

  @Post(':id/reset-credentials') @RequirePermission('users', 'EDIT')
  reset(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') mamcosId?: string) { return this.staff.resetCredentials(id, u, mamcosId); }
}
