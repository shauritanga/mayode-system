import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { ActivitiesService } from './activities.service';

@ApiTags('activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('farmer/:farmerId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @ApiOperation({ summary: "Recent activity feed for a farmer's dashboard" })
  listForFarmer(
    @Param('farmerId') farmerId: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.activities.listForFarmer(
      farmerId,
      user,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
