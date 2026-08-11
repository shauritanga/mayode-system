import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LocationsService } from './locations.service';
import { CreateDistrictDto, CreateRegionDto, CreateWardDto, UpdateLocationNameDto } from './dto/location.dto';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // Reads stay public — matches the module's existing behavior (used to populate
  // registration/location pickers without requiring auth).
  @Get('regions')
  @ApiOperation({ summary: 'Get all regions in Tanzania (ADM1)' })
  findAllRegions() {
    return this.locationsService.findAllRegions();
  }

  @Get('regions/:regionId/districts')
  @ApiOperation({ summary: 'Get all districts for a specific region (ADM2)' })
  findDistrictsByRegion(@Param('regionId') regionId: string) {
    return this.locationsService.findDistrictsByRegion(regionId);
  }

  @Get('districts/:districtId/wards')
  @ApiOperation({ summary: 'Get all wards for a specific district (ADM3)' })
  findWardsByDistrict(@Param('districtId') districtId: string) {
    return this.locationsService.findWardsByDistrict(districtId);
  }

  // Writes require ADMIN — this is the "Settings > Locations" admin-hierarchy CRUD.
  @Post('regions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createRegion(@Body() dto: CreateRegionDto) {
    return this.locationsService.createRegion(dto);
  }

  @Patch('regions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateRegion(@Param('id') id: string, @Body() dto: UpdateLocationNameDto) {
    return this.locationsService.updateRegion(id, dto);
  }

  @Delete('regions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deleteRegion(@Param('id') id: string) {
    return this.locationsService.deleteRegion(id);
  }

  @Post('districts')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createDistrict(@Body() dto: CreateDistrictDto) {
    return this.locationsService.createDistrict(dto);
  }

  @Patch('districts/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateDistrict(@Param('id') id: string, @Body() dto: UpdateLocationNameDto) {
    return this.locationsService.updateDistrict(id, dto);
  }

  @Delete('districts/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deleteDistrict(@Param('id') id: string) {
    return this.locationsService.deleteDistrict(id);
  }

  @Post('wards')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createWard(@Body() dto: CreateWardDto) {
    return this.locationsService.createWard(dto);
  }

  @Patch('wards/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  updateWard(@Param('id') id: string, @Body() dto: UpdateLocationNameDto) {
    return this.locationsService.updateWard(id, dto);
  }

  @Delete('wards/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deleteWard(@Param('id') id: string) {
    return this.locationsService.deleteWard(id);
  }
}
