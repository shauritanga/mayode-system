import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { WaterService } from './water.service';
import { CreateScheduleDto, CreateWaterLogDto, ResolveIssueDto, UpdateScheduleDto } from './dto/water.dto';

@ApiTags('water')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('water')
export class WaterController {
  constructor(private readonly water: WaterService) {}

  @Get('structure') @RequirePermission('water', 'VIEW')
  structure(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.water.structure(u, m); }

  @Get('overview') @RequirePermission('water', 'VIEW')
  overview(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.water.overview(u, m); }

  @Get('schedules') @RequirePermission('water_schedules', 'VIEW')
  schedules(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.water.schedules(u, m); }

  @Post('schedules') @RequirePermission('water_schedules', 'CREATE')
  createSchedule(@CurrentUser() u: RequestUser, @Body() dto: CreateScheduleDto, @Query('mamcosId') m?: string) { return this.water.createSchedule(u, dto, m); }

  @Patch('schedules/:id') @RequirePermission('water_schedules', 'EDIT')
  updateSchedule(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateScheduleDto, @Query('mamcosId') m?: string) { return this.water.updateSchedule(u, id, dto, m); }

  @Get('logs') @RequirePermission('water', 'VIEW')
  logs(@CurrentUser() u: RequestUser, @Query() q: { from?: string; to?: string; canalId?: string; issues?: string; mamcosId?: string }) { return this.water.logs(u, q, q.mamcosId); }

  @Post('logs') @RequirePermission('water', 'CREATE')
  log(@CurrentUser() u: RequestUser, @Body() dto: CreateWaterLogDto, @Query('mamcosId') m?: string) { return this.water.log(u, dto, m); }

  @Post('logs/:id/resolve') @RequirePermission('water', 'EDIT')
  resolve(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ResolveIssueDto, @Query('mamcosId') m?: string) { return this.water.resolveIssue(u, id, dto, m); }
}
