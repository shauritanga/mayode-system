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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { FacilitiesService } from './facilities.service';
import {
  UpdateAggregationCentreDto,
  UpdateIrrigationSchemeDto,
  UpsertAggregationCentreDto,
  UpsertIrrigationSchemeDto,
} from './dto/facility.dto';

const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MAMCOS_SECRETARY,
];

@ApiTags('facilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Post('irrigation-schemes')
  @Roles(...STAFF_ROLES)
  @RequirePermission('facilities', 'CREATE')
  createIrrigationScheme(@Body() dto: UpsertIrrigationSchemeDto) {
    return this.facilities.createIrrigationScheme(dto);
  }

  @Get('irrigation-schemes')
  @Roles(...STAFF_ROLES)
  @RequirePermission('facilities', 'VIEW')
  findIrrigationSchemes(@Query('mamcosId') mamcosId?: string) {
    return this.facilities.findIrrigationSchemes(mamcosId);
  }

  @Patch('irrigation-schemes/:id')
  @Roles(...STAFF_ROLES)
  @RequirePermission('facilities', 'EDIT')
  updateIrrigationScheme(
    @Param('id') id: string,
    @Body() dto: UpdateIrrigationSchemeDto,
  ) {
    return this.facilities.updateIrrigationScheme(id, dto);
  }

  @Delete('irrigation-schemes/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('facilities', 'DELETE')
  removeIrrigationScheme(@Param('id') id: string) {
    return this.facilities.removeIrrigationScheme(id);
  }

  @Post('aggregation-centres')
  @Roles(...STAFF_ROLES)
  @RequirePermission('facilities', 'CREATE')
  createAggregationCentre(@Body() dto: UpsertAggregationCentreDto) {
    return this.facilities.createAggregationCentre(dto);
  }

  @Get('aggregation-centres')
  @Roles(...STAFF_ROLES)
  @RequirePermission('facilities', 'VIEW')
  findAggregationCentres(@Query('mamcosId') mamcosId?: string) {
    return this.facilities.findAggregationCentres(mamcosId);
  }

  @Patch('aggregation-centres/:id')
  @Roles(...STAFF_ROLES)
  @RequirePermission('facilities', 'EDIT')
  updateAggregationCentre(
    @Param('id') id: string,
    @Body() dto: UpdateAggregationCentreDto,
  ) {
    return this.facilities.updateAggregationCentre(id, dto);
  }

  @Delete('aggregation-centres/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('facilities', 'DELETE')
  removeAggregationCentre(@Param('id') id: string) {
    return this.facilities.removeAggregationCentre(id);
  }
}
