import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CropCyclesService } from './crop-cycles.service';
import {
  CreateCropCycleDto,
  UpdateCropCycleDto,
  CreateActivityLogDto,
  CalendarQueryDto,
} from './dto/crop-cycles.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { UserRole } from '@prisma/client';

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
  constructor(private readonly cropCyclesService: CropCyclesService) {}

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
  )
  @ApiOperation({ summary: 'Initiate a new seasonal crop cycle for a farm' })
  create(@Body() dto: CreateCropCycleDto, @CurrentUser() user: RequestUser) {
    return this.cropCyclesService.create(dto, user);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Get all crop cycles across the system (staff only)',
  })
  findAll() {
    return this.cropCyclesService.findAll();
  }

  @Get('calendar')
  @Roles(UserRole.FARMER)
  @ApiOperation({ summary: "Combined calendar: own activity log entries + upcoming planting/harvest milestones across all the farmer's farms" })
  calendar(@CurrentUser() user: RequestUser, @Query() query: CalendarQueryDto) {
    return this.cropCyclesService.calendarForSelf(user.id, query.from, query.to);
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
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
  )
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
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
  )
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
