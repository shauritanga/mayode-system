import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { FarmingSeasonsService } from './farming-seasons.service';
import {
  CreateFarmingSeasonDto,
  UpdateFarmingSeasonDto,
} from './dto/farming-seasons.dto';

@ApiTags('farming-seasons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('farming-seasons')
export class FarmingSeasonsController {
  constructor(private readonly seasons: FarmingSeasonsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('farming_seasons', 'CREATE')
  @ApiOperation({
    summary:
      'Create a farming season (Admin only; periods are configurable, never hard-coded)',
  })
  create(@Body() dto: CreateFarmingSeasonDto) {
    return this.seasons.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List farming seasons' })
  findAll() {
    return this.seasons.findAll();
  }

  @Get('current')
  @ApiOperation({
    summary: 'Get the current (registration-open/active) farming season',
  })
  findCurrent() {
    return this.seasons.findCurrent();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a farming season by ID' })
  findOne(@Param('id') id: string) {
    return this.seasons.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('farming_seasons', 'EDIT')
  @ApiOperation({ summary: 'Update a farming season (Admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateFarmingSeasonDto) {
    return this.seasons.update(id, dto);
  }
}
