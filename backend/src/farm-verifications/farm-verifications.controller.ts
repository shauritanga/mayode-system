import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FarmVerificationsService } from './farm-verifications.service';
import { VerifyFarmDto } from './dto/verify-farm.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('farm-verifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farm-verifications')
export class FarmVerificationsController {
  constructor(
    private readonly farmVerificationsService: FarmVerificationsService,
  ) {}

  @Post()
  @Roles(UserRole.FIELD_OFFICER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Submit farm verification proof & neighbor details (Field Officer / Admin only)',
  })
  verifyFarm(
    @CurrentUser() user: { id: string },
    @Body() verifyFarmDto: VerifyFarmDto,
  ) {
    return this.farmVerificationsService.verifyFarm(user.id, verifyFarmDto);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get all farm verification records across the system',
  })
  findAll() {
    return this.farmVerificationsService.findAll();
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary: 'Get farm verification details by verification record ID',
  })
  findOne(@Param('id') id: string) {
    return this.farmVerificationsService.findOne(id);
  }

  @Get('farm/:farmId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({ summary: 'Get all verification history for a specific farm' })
  findByFarmId(@Param('farmId') farmId: string) {
    return this.farmVerificationsService.findByFarmId(farmId);
  }
}
