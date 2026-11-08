import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmDefaultsService } from './farm-defaults.service';
import { CaseQueryDto, ReleaseDto, TakeOverDto } from './dto/farm-defaults.dto';

@ApiTags('farm-defaults')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('farm-defaults')
export class FarmDefaultsController {
  constructor(private readonly defaults: FarmDefaultsService) {}

  // fixed paths before ":id"
  @Get('me') @Roles(UserRole.FARMER)
  me(@CurrentUser() u: RequestUser) { return this.defaults.forMe(u.id); }

  @Get('payers') @RequirePermission('farm_administration', 'VIEW')
  payers(@CurrentUser() u: RequestUser, @Query() q: CaseQueryDto & { exclude?: string }) { return this.defaults.payers(u, q); }

  @Get('farmer/:farmerId') @RequirePermission('farmers', 'VIEW')
  forFarmer(@CurrentUser() u: RequestUser, @Param('farmerId') farmerId: string, @Query('mamcosId') m?: string) { return this.defaults.forFarmer(u, farmerId, m); }

  @Post('check') @RequirePermission('farm_administration', 'CREATE')
  check(@CurrentUser() u: RequestUser, @Query('mamcosId') m?: string) { return this.defaults.checkNow(u, m); }

  @Get() @RequirePermission('farm_administration', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: CaseQueryDto) { return this.defaults.list(u, q); }

  @Post(':id/take-over') @RequirePermission('farm_administration', 'EDIT')
  takeOver(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: TakeOverDto, @Query('mamcosId') m?: string) { return this.defaults.takeOver(u, id, dto, m); }

  @Post(':id/release') @RequirePermission('farm_administration', 'EDIT')
  release(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReleaseDto, @Query('mamcosId') m?: string) { return this.defaults.release(u, id, dto, m); }
}
