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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FacilitiesService } from './facilities.service';
import {
  UpdateAggregationCentreDto,
  UpdateIrrigationSchemeDto,
  UpsertAggregationCentreDto,
  UpsertIrrigationSchemeDto,
} from './dto/facility.dto';

const STAFF_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY];

@ApiTags('facilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Post('irrigation-schemes')
  @Roles(...STAFF_ROLES)
  createIrrigationScheme(@Body() dto: UpsertIrrigationSchemeDto) {
    return this.facilities.createIrrigationScheme(dto);
  }

  @Get('irrigation-schemes')
  findIrrigationSchemes(@Query('mamcosId') mamcosId?: string) {
    return this.facilities.findIrrigationSchemes(mamcosId);
  }

  @Patch('irrigation-schemes/:id')
  @Roles(...STAFF_ROLES)
  updateIrrigationScheme(@Param('id') id: string, @Body() dto: UpdateIrrigationSchemeDto) {
    return this.facilities.updateIrrigationScheme(id, dto);
  }

  @Delete('irrigation-schemes/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  removeIrrigationScheme(@Param('id') id: string) {
    return this.facilities.removeIrrigationScheme(id);
  }

  @Post('aggregation-centres')
  @Roles(...STAFF_ROLES)
  createAggregationCentre(@Body() dto: UpsertAggregationCentreDto) {
    return this.facilities.createAggregationCentre(dto);
  }

  @Get('aggregation-centres')
  findAggregationCentres(@Query('mamcosId') mamcosId?: string) {
    return this.facilities.findAggregationCentres(mamcosId);
  }

  @Patch('aggregation-centres/:id')
  @Roles(...STAFF_ROLES)
  updateAggregationCentre(@Param('id') id: string, @Body() dto: UpdateAggregationCentreDto) {
    return this.facilities.updateAggregationCentre(id, dto);
  }

  @Delete('aggregation-centres/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  removeAggregationCentre(@Param('id') id: string) {
    return this.facilities.removeAggregationCentre(id);
  }
}
