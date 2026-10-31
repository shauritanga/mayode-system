import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { JoinRequestsService } from './join-requests.service';

class CodeDto { @IsString() @IsNotEmpty() @MaxLength(40) code: string; }
class ReasonDto { @IsString() @IsNotEmpty() @MaxLength(500) reason: string; }

@ApiTags('join-requests')
@Controller('join-requests')
export class JoinRequestsController {
  constructor(private readonly requests: JoinRequestsService) {}

  /** Public, so the sign-up screen can confirm the AMCOS name before the farmer finishes. Rate limited to stop code guessing. */
  @Get('lookup')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  lookup(@Query('code') code: string) { return this.requests.lookup(code); }

  // Farmer side
  @Get('mine') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.FARMER)
  mine(@CurrentUser() u: RequestUser) { return this.requests.mine(u); }

  @Post() @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard) @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Roles(UserRole.FARMER)
  request(@CurrentUser() u: RequestUser, @Body() dto: CodeDto) { return this.requests.request(u, dto.code); }

  @Post(':id/cancel') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.FARMER)
  cancel(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.requests.cancel(u, id); }

  // AMCOS admin side
  @Get() @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @RequirePermission('farmers', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: { status?: string; mamcosId?: string }) { return this.requests.list(u, q); }

  @Post(':id/approve') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @RequirePermission('farmers', 'EDIT')
  approve(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') mamcosId?: string) { return this.requests.approve(u, id, mamcosId); }

  @Post(':id/reject') @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard) @RequirePermission('farmers', 'EDIT')
  reject(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto, @Query('mamcosId') mamcosId?: string) { return this.requests.reject(u, id, dto.reason, mamcosId); }
}
