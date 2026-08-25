import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeaseStatus, UserRole, VerificationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmLeasesService } from './farm-leases.service';
import {
  ConfirmOwnershipDto,
  CreateFarmLeaseDto,
  OfficerVerifyLeaseDto,
  SelfOperateDto,
} from './dto/farm-leases.dto';

const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

@ApiTags('farm-leases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('farm-leases')
export class FarmLeasesController {
  constructor(private readonly leases: FarmLeasesService) {}

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
  )
  @RequirePermission('farm_leases', 'CREATE')
  @ApiOperation({
    summary:
      'Owner adds a lease: names the renter for a farm and season (Add Lease)',
  })
  create(@Body() dto: CreateFarmLeaseDto, @CurrentUser() user: RequestUser) {
    return this.leases.create(dto, user);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Leases where the current user is owner or renter' })
  findMine(@CurrentUser() user: RequestUser) {
    return this.leases.findMine(user);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @RequirePermission('farm_leases', 'VIEW')
  @ApiOperation({
    summary: 'All leases, optionally filtered by status (staff only)',
  })
  findAll(
    @Query('status') status?: LeaseStatus,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.leases.findAllLeases(status, user);
  }

  @Get('farm/:farmId')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Leases for a farm' })
  findForFarm(@Param('farmId') farmId: string) {
    return this.leases.findForFarm(farmId);
  }

  @Patch(':id/renter-confirm')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary: 'Renter confirms the lease and becomes the active seasonal user',
  })
  renterConfirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leases.renterConfirm(id, user);
  }

  @Patch(':id/renter-reject')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FARMER,
  )
  @ApiOperation({ summary: 'Renter rejects the lease; the owner is notified' })
  renterReject(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leases.renterReject(id, user);
  }

  @Patch(':id/officer-verify')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
  )
  @ApiOperation({
    summary: 'Officer-assisted verification of a lease (staff only)',
  })
  officerVerify(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: OfficerVerifyLeaseDto,
  ) {
    return this.leases.officerVerify(id, user, dto);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('farm_leases', 'DELETE')
  @ApiOperation({
    summary:
      'Delete a lease that never went active (Admin only). ACTIVE/COMPLETED leases are kept for the audit trail',
  })
  remove(@Param('id') id: string) {
    return this.leases.remove(id);
  }
}

@ApiTags('seasonal-assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('seasonal-assignments')
export class SeasonalAssignmentsController {
  constructor(private readonly leases: FarmLeasesService) {}

  @Post('self-operate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Owner declares self-farming for a season (OWNER_OPERATED assignment)',
  })
  selfOperate(@Body() dto: SelfOperateDto, @CurrentUser() user: RequestUser) {
    return this.leases.selfOperate(dto, user);
  }

  @Get('mine')
  @ApiOperation({
    summary: 'Seasonal assignments where the current user is the active farmer',
  })
  mine(@CurrentUser() user: RequestUser) {
    return this.leases.myAssignments(user);
  }

  @Get('farm/:farmId')
  @Roles(...STAFF_ROLES, UserRole.FARMER)
  @ApiOperation({ summary: 'Seasonal assignments for a farm' })
  forFarm(
    @Param('farmId') farmId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leases.findAssignmentsForFarm(farmId, user);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @RequirePermission('farm_leases', 'VIEW')
  @ApiOperation({ summary: 'All seasonal assignments (staff only)' })
  findAll() {
    return this.leases.findAllAssignments();
  }
}

@ApiTags('farm-ownerships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('farm-ownerships')
export class FarmOwnershipsController {
  constructor(private readonly leases: FarmLeasesService) {}

  @Post('farm/:farmId/confirm')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Owner confirms the farm registered under their profile belongs to them',
  })
  confirm(
    @Param('farmId') farmId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ConfirmOwnershipDto,
  ) {
    return this.leases.confirmOwnership(farmId, user, dto);
  }

  @Get('farm/:farmId')
  @Roles(...STAFF_ROLES, UserRole.FARMER)
  @ApiOperation({ summary: 'Ownership records for a farm' })
  forFarm(
    @Param('farmId') farmId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leases.findOwnershipForFarm(farmId, user);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @RequirePermission('farm_leases', 'VIEW')
  @ApiOperation({
    summary:
      'All ownership records, optionally filtered by status (staff only)',
  })
  findAll(@Query('status') status?: VerificationStatus) {
    return this.leases.findAllOwnerships(status);
  }
}
