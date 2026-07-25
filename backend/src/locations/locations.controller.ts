import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LocationsService } from './locations.service';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

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
}
