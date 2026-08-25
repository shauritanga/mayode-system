import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { MembershipsService } from './memberships.service';
import {
  ApproveMembershipDto,
  CreateMembershipPlanDto,
  StartMembershipDto,
} from './dto/memberships.dto';

@ApiTags('memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'List active membership plans' })
  listPlans() {
    return this.memberships.listPlans();
  }

  @Post('plans')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('memberships', 'CREATE')
  @ApiOperation({ summary: 'Create a membership plan (Admin only)' })
  createPlan(@Body() dto: CreateMembershipPlanDto) {
    return this.memberships.createPlan(dto);
  }

  @Get('me')
  @ApiOperation({
    summary:
      "Current user's membership status (active flag + latest membership)",
  })
  myMembership(@CurrentUser() user: { id: string }) {
    return this.memberships.myMembership(user.id);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.AUDITOR,
    UserRole.MAMCOS_SECRETARY,
  )
  @RequirePermission('memberships', 'VIEW')
  @ApiOperation({
    summary: 'All memberships, optionally filtered by status (staff only)',
  })
  listAll(@Query('status') status: MembershipStatus | undefined, @CurrentUser() user: RequestUser) {
    return this.memberships.listAll(status, user);
  }

  @Post('start')
  @ApiOperation({
    summary:
      'Start a membership. Pushes a ClickPesa mobile-money prompt when configured, otherwise awaits admin approval.',
  })
  start(
    @CurrentUser() user: { id: string; phone?: string },
    @Body() dto: StartMembershipDto,
  ) {
    return this.memberships.start(user, dto);
  }

  @Post('reconcile')
  @ApiOperation({
    summary:
      "Re-check the current user's latest pending payment with ClickPesa (mobile poll)",
  })
  reconcile(@CurrentUser() user: { id: string }) {
    return this.memberships.reconcileForUser(user.id);
  }

  @Post('reconcile-pending')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Staff: re-check ClickPesa for all pending memberships with an order reference',
  })
  reconcilePending() {
    return this.memberships.reconcilePendingPayments();
  }

  @Post(':id/reconcile')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Staff: re-check ClickPesa for one membership by id',
  })
  reconcileOne(@Param('id') id: string) {
    return this.memberships.reconcileById(id);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('memberships', 'EDIT')
  @ApiOperation({
    summary: 'Confirm payment and activate a membership (Admin only)',
  })
  approve(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ApproveMembershipDto,
  ) {
    return this.memberships.approve(id, user.id, dto);
  }

  @Post('process-expiries')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Run expiry housekeeping: renewal reminders + auto-expire (Admin; also runs on a daily cron)',
  })
  processExpiries() {
    return this.memberships.processExpiries();
  }
}
