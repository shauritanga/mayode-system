import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CropCyclesService } from './crop-cycles.service';
import { CreateCropCycleDto, UpdateCropCycleDto, CreateActivityLogDto } from './dto/crop-cycles.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('crop-cycles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crop-cycles')
export class CropCyclesController {
  constructor(private readonly cropCyclesService: CropCyclesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Initiate a new seasonal crop cycle for a farm' })
  create(@Body() createCropCycleDto: CreateCropCycleDto) {
    return this.cropCyclesService.create(createCropCycleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all crop cycles across the system' })
  findAll() {
    return this.cropCyclesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get crop cycle details by ID (with activity logs, costs, revenues)' })
  findOne(@Param('id') id: string) {
    return this.cropCyclesService.findOne(id);
  }

  @Get('farm/:farmId')
  @ApiOperation({ summary: 'Get all crop cycles for a specific farm' })
  findByFarmId(@Param('farmId') farmId: string) {
    return this.cropCyclesService.findByFarmId(farmId);
  }

  @Get('farmer/:farmerId')
  @ApiOperation({ summary: 'Get all crop cycles owned by a specific farmer' })
  findByFarmerId(@Param('farmerId') farmerId: string) {
    return this.cropCyclesService.findByFarmerId(farmerId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Update crop cycle status, harvest dates, or actual yields' })
  update(@Param('id') id: string, @Body() updateCropCycleDto: UpdateCropCycleDto) {
    return this.cropCyclesService.update(id, updateCropCycleDto);
  }

  @Post('activity')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Log a farming activity (Land prep, weeding, harvest, etc.) with inputs & labor' })
  logActivity(@CurrentUser() user: { id: string }, @Body() createActivityLogDto: CreateActivityLogDto) {
    return this.cropCyclesService.logActivity(user.id, createActivityLogDto);
  }
}
