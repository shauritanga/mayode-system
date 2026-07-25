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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmAlertsService } from './farm-alerts.service';
import { CreateFarmAlertDto } from './dto/farm-alerts.dto';

@ApiTags('farm-alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farm-alerts')
export class FarmAlertsController {
  constructor(private readonly alerts: FarmAlertsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Current user's farm alerts. Premium details are stripped for non-members (locked=true).",
  })
  list(@CurrentUser() user: RequestUser) {
    return this.alerts.listForUser(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Alert detail — full recommendation for members, preview + CTA for free users.',
  })
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.alerts.getOne(id, user);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Mark an alert as completed (members/staff only)' })
  complete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.alerts.complete(id, user);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Create a farm alert manually (staff only)' })
  create(@Body() dto: CreateFarmAlertDto) {
    return this.alerts.createAlert(dto);
  }

  @Post('generate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Run the rule-based alert generator across all farms (admin)' })
  generateAll() {
    return this.alerts.generateAll();
  }

  @Post('generate/farm/:farmId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Run the alert generator for one farm (staff)' })
  async generateForFarm(@Param('farmId') farmId: string) {
    return { created: await this.alerts.generateForFarm(farmId) };
  }
}
