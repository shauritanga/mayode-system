import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CropCyclesService } from './crop-cycles.service';
import {
  CreateCropCycleDto,
  UpdateCropCycleDto,
  CreateActivityLogDto,
  UpdateActivityLogDto,
  CalendarQueryDto,
} from './dto/crop-cycles.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { UserRole } from '@prisma/client';
import { ExportService } from '../common/export.service';
import { ReportFormatDto } from '../reports/dto/reports.dto';

const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

@ApiTags('crop-cycles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crop-cycles')
export class CropCyclesController {
  constructor(
    private readonly cropCyclesService: CropCyclesService,
    private readonly exporter: ExportService,
  ) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Initiate a new seasonal crop cycle for a farm' })
  create(@Body() dto: CreateCropCycleDto, @CurrentUser() user: RequestUser) {
    return this.cropCyclesService.create(dto, user);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Get all crop cycles across the system (staff only)',
  })
  async findAll(
    @Query() query: ReportFormatDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rows = await this.cropCyclesService.findAll();
    if (!query.format || query.format === 'json') return rows;
    const exportRows = rows.map((cycle: any) => ({
      farmCode: cycle.farm?.farmCode ?? '',
      farmer:
        `${cycle.farmer?.firstName ?? ''} ${cycle.farmer?.lastName ?? ''}`.trim(),
      season: cycle.season,
      riceVariety: cycle.riceVariety ?? '',
      plantingDate: cycle.plantingDate?.toISOString?.() ?? '',
      harvestDate: cycle.harvestDate?.toISOString?.() ?? '',
      actualYieldKg: cycle.actualYieldKg ?? 0,
      status: cycle.status,
    }));
    if (query.format === 'csv') {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="crop-cycles.csv"',
      );
      return response.send(this.exporter.csv(exportRows));
    }
    if (query.format === 'pdf') {
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="crop-cycles.pdf"',
      );
      return response.send(await this.exporter.pdf(exportRows, 'crop-cycles'));
    }
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="crop-cycles.xlsx"',
    );
    return response.send(this.exporter.xlsx(exportRows, 'crop-cycles'));
  }

  @Get('calendar')
  @Roles(UserRole.FARMER)
  @ApiOperation({
    summary:
      "Combined calendar: own activity log entries + upcoming planting/harvest milestones across all the farmer's farms",
  })
  calendar(@CurrentUser() user: RequestUser, @Query() query: CalendarQueryDto) {
    return this.cropCyclesService.calendarForSelf(
      user.id,
      query.from,
      query.to,
    );
  }

  @Get('activity-logs')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Get all activity log entries across the system (staff only)',
  })
  findAllActivityLogs() {
    return this.cropCyclesService.findAllActivityLogs();
  }

  @Get('activity/:id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Get a single activity log entry by ID (staff only)' })
  findActivityLog(@Param('id') id: string) {
    return this.cropCyclesService.findActivityLogById(id);
  }

  @Patch('activity/:id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Edit an activity log entry (staff only)' })
  updateActivityLog(@Param('id') id: string, @Body() dto: UpdateActivityLogDto) {
    return this.cropCyclesService.updateActivityLog(id, dto);
  }

  @Delete('activity/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Delete an activity log entry (staff only)' })
  deleteActivityLog(@Param('id') id: string) {
    return this.cropCyclesService.deleteActivityLog(id);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get crop cycle details by ID (with activity logs, costs, revenues)',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.cropCyclesService.findOne(id, user);
  }

  @Get('farm/:farmId')
  @ApiOperation({ summary: 'Get all crop cycles for a specific farm' })
  findByFarmId(
    @Param('farmId') farmId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cropCyclesService.findByFarmId(farmId, user);
  }

  @Get('farmer/:farmerId')
  @ApiOperation({ summary: 'Get all crop cycles owned by a specific farmer' })
  findByFarmerId(
    @Param('farmerId') farmerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cropCyclesService.findByFarmerId(farmerId, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({
    summary: 'Update crop cycle status, harvest dates, or actual yields',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCropCycleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.cropCyclesService.update(id, dto, user);
  }

  @Post('activity')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Log a farming activity (land prep, weeding, harvest, etc.) with inputs & labor',
  })
  logActivity(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateActivityLogDto,
  ) {
    return this.cropCyclesService.logActivity(user, dto);
  }
}
