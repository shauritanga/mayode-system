import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { MeetingsService } from './meetings.service';
import { AttendanceDto, CancelMeetingDto, CloseMeetingDto, CreateMeetingDto, MeetingQueryDto, ResolutionDto, UpdateMeetingDto } from './dto/meetings.dto';

const R = 'board_meetings';

@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  // The member's own side (fixed paths before ":id")
  @Get('mine') @Roles(UserRole.FARMER)
  mine(@CurrentUser() u: RequestUser) { return this.meetings.forMe(u); }

  @Post(':id/check-in') @Roles(UserRole.FARMER)
  checkIn(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.meetings.selfCheckIn(u, id); }

  // The office
  @Get('resolutions') @RequirePermission(R, 'VIEW')
  resolutions(@CurrentUser() u: RequestUser, @Query() q: MeetingQueryDto) { return this.meetings.resolutions(u, q); }

  @Get() @RequirePermission(R, 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: MeetingQueryDto) { return this.meetings.list(u, q); }

  @Post() @RequirePermission(R, 'CREATE')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateMeetingDto, @Query('mamcosId') m?: string) { return this.meetings.create(u, dto, m); }

  @Get(':id') @RequirePermission(R, 'VIEW')
  detail(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.meetings.detail(u, id, m); }

  @Patch(':id') @RequirePermission(R, 'EDIT')
  update(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateMeetingDto, @Query('mamcosId') m?: string) { return this.meetings.update(u, id, dto, m); }

  @Post(':id/cancel') @RequirePermission(R, 'EDIT')
  cancel(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: CancelMeetingDto, @Query('mamcosId') m?: string) { return this.meetings.cancel(u, id, dto, m); }

  @Post(':id/open-check-in') @RequirePermission(R, 'EDIT')
  openCheckIn(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.meetings.openCheckIn(u, id, m); }

  @Post(':id/attendance') @RequirePermission(R, 'EDIT')
  attendance(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: AttendanceDto, @Query('mamcosId') m?: string) { return this.meetings.markPresent(u, id, dto, m); }

  @Post(':id/start') @RequirePermission(R, 'EDIT')
  start(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') m?: string) { return this.meetings.start(u, id, m); }

  @Post(':id/resolutions') @RequirePermission(R, 'EDIT')
  addResolution(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ResolutionDto, @Query('mamcosId') m?: string) { return this.meetings.addResolution(u, id, dto, m); }

  @Post(':id/close') @RequirePermission(R, 'EDIT')
  close(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: CloseMeetingDto, @Query('mamcosId') m?: string) { return this.meetings.close(u, id, dto, m); }
}
