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
import { MamcosService } from './mamcos.service';
import { CreateMamcosDto, UpdateMamcosDto, AssignFarmerDto, CreateSecretaryDto } from './dto/mamcos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('mamcos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mamcos')
export class MamcosController {
  constructor(private readonly mamcosService: MamcosService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new MAMCOS cooperative scheme (Admin only)' })
  create(@Body() createMamcosDto: CreateMamcosDto) {
    return this.mamcosService.create(createMamcosDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all MAMCOS cooperative schemes' })
  findAll() {
    return this.mamcosService.findAll();
  }

  @Get('secretary-dashboard')
  @Roles(UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Get MAMCOS Secretary dashboard (active scheme, farmers, stability bonus)' })
  getSecretaryDashboard(@CurrentUser() user: { id: string }) {
    return this.mamcosService.getSecretaryDashboard(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get MAMCOS details by ID' })
  findOne(@Param('id') id: string) {
    return this.mamcosService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Update MAMCOS scheme details' })
  update(@Param('id') id: string, @Body() updateMamcosDto: UpdateMamcosDto) {
    return this.mamcosService.update(id, updateMamcosDto);
  }

  @Post(':id/assign-farmer')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Assign a farmer to a MAMCOS cooperative scheme' })
  assignFarmer(@Param('id') id: string, @Body() assignFarmerDto: AssignFarmerDto) {
    return this.mamcosService.assignFarmer(id, assignFarmerDto);
  }

  @Post(':id/secretary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Register a secretary for a MAMCOS cooperative scheme' })
  createSecretary(@Param('id') id: string, @Body() createSecretaryDto: CreateSecretaryDto) {
    return this.mamcosService.createSecretary(id, createSecretaryDto);
  }
}
