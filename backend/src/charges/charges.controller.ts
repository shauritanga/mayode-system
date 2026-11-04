import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { ChargesService } from './charges.service';
import { MonthDto, UpdateChargeDto } from './dto/charges.dto';

@ApiTags('charges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('charges')
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  @Get() @RequirePermission('amcos_settings', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.charges.list(u, m); }

  // fixed paths before ":code"
  @Get('penalties/preview') @RequirePermission('dues', 'VIEW')
  previewPenalties(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.charges.previewPenalties(u, m); }
  @Post('penalties/apply') @RequirePermission('dues', 'CREATE')
  applyPenalties(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.charges.applyPenalties(u, m); }
  @Get('storage/preview') @RequirePermission('dues', 'VIEW')
  previewStorage(@CurrentUser() u: RequestUser, @Query('month') month: string, @Query('mamcosId') m?: string) { return this.charges.previewStorage(u, month, m); }
  @Post('storage/apply') @RequirePermission('dues', 'CREATE')
  applyStorage(@CurrentUser() u: RequestUser, @Body() dto: MonthDto, @Query('mamcosId') m?: string) { return this.charges.applyStorage(u, dto.month, m); }

  @Patch(':code') @RequirePermission('amcos_settings', 'EDIT')
  update(@CurrentUser() u: RequestUser, @Param('code') code: string, @Body() dto: UpdateChargeDto, @Query('mamcosId') m?: string) { return this.charges.update(u, code, dto, m); }
}
