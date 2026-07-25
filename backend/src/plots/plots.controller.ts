import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PlotsService } from './plots.service';
import {
  CreatePlotDto,
  UpdatePlotDto,
  UpdatePlotBoundaryDto,
} from './dto/plots.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../common/ownership.service';

@ApiTags('plots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plots')
export class PlotsController {
  constructor(private readonly plotsService: PlotsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Create a plot under a farm (auto plot code, e.g. FP-JD-01-P1)' })
  create(@Body() dto: CreatePlotDto, @CurrentUser() user: RequestUser) {
    return this.plotsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List plots, optionally filtered by farmId' })
  @ApiQuery({ name: 'farmId', required: false })
  findAll(@Query('farmId') farmId?: string) {
    return this.plotsService.findAll(farmId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plot detail (farm, farmer, crop cycles)' })
  findOne(@Param('id') id: string) {
    return this.plotsService.findOne(id);
  }

  @Get('farm/:farmId')
  @ApiOperation({ summary: 'List all plots for a specific farm' })
  findByFarmId(@Param('farmId') farmId: string) {
    return this.plotsService.findByFarmId(farmId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Update plot details' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlotDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.plotsService.update(id, dto, user);
  }

  @Patch(':id/boundary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Update plot GPS boundary (GeoJSON Polygon) and center Lat/Lng' })
  updateBoundary(
    @Param('id') id: string,
    @Body() dto: UpdatePlotBoundaryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.plotsService.updateBoundary(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({ summary: 'Delete a plot' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.plotsService.remove(id, user);
  }
}
