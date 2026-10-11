import { PermissionResource } from '../auth/role-access';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { RequestUser } from '../common/ownership.service';
import {
  CompleteRiceCalendarTaskDto,
  RescheduleRiceCalendarTaskDto,
  UpdateRiceProtocolDto,
} from './dto/rice-protocol.dto';
import { RiceProtocolsService } from './rice-protocols.service';

@ApiTags('rice-protocols')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('rice_protocols')
@Controller('rice-protocols')
export class RiceProtocolsController {
  constructor(private readonly protocols: RiceProtocolsService) {}
  @Get('platform/active')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @RequirePermission('rice_protocols', 'VIEW')
  @ApiOperation({
    summary:
      'The platform rice calendar every farmer sees in the mobile app (read-only for everyone but Super Admin)',
  })
  platformCalendar(@Query('varietyId') varietyId?: string) {
    return this.protocols.platformCalendar(varietyId || null);
  }
  @Get('platform')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'All versions of the platform rice calendar (Super Admin)',
  })
  platformVersions(
    @CurrentUser() user: RequestUser,
    @Query('varietyId') varietyId?: string,
  ) {
    return this.protocols.platformVersions(user, varietyId || null);
  }
  @Post('platform/bootstrap')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create the default platform rice calendar (Super Admin)',
  })
  bootstrapPlatform(
    @CurrentUser() user: RequestUser,
    @Query('varietyId') varietyId?: string,
    @Query('copyFrom') copyFrom?: string,
  ) {
    return this.protocols.bootstrapPlatform(user, {
      varietyId: varietyId || null,
      copyFromVarietyId: copyFrom || null,
    });
  }
  @Get('mamcos/:mamcosId/upcoming')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('rice_protocols', 'VIEW')
  @ApiOperation({
    summary:
      "What the cooperative's own calendar says is due soon across its members' crop cycles",
  })
  upcoming(
    @Param('mamcosId') mamcosId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.upcoming(mamcosId, user);
  }
  @Post('mamcos/:mamcosId/bootstrap')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('rice_protocols', 'CREATE')
  @ApiOperation({
    summary:
      "Create a cooperative's own rice calendar (never sent to the mobile app)",
  })
  bootstrap(
    @Param('mamcosId') mamcosId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.bootstrap(mamcosId, user);
  }
  @Get('mamcos/:mamcosId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('rice_protocols', 'VIEW')
  protocolsForMamcos(
    @Param('mamcosId') mamcosId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.getForMamcos(mamcosId, user);
  }
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @RequirePermission('rice_protocols', 'EDIT')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRiceProtocolDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.update(id, dto, user);
  }
  @Get('crop-cycles/:cropCycleId/tasks')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @RequirePermission('rice_protocols', 'VIEW')
  tasks(
    @Param('cropCycleId') cropCycleId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.tasksForCycle(cropCycleId, user);
  }
  @Get('crop-cycles/:cropCycleId/readiness')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FARMER,
  )
  @RequirePermission('rice_protocols', 'VIEW')
  readiness(
    @Param('cropCycleId') cropCycleId: string,
    @Query('includeWarehouse') includeWarehouse: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols
      .tasksForCycle(cropCycleId, user)
      .then(() =>
        this.protocols.readiness(cropCycleId, includeWarehouse === 'true'),
      );
  }
  @Patch('tasks/:id/schedule')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
  )
  @RequirePermission('rice_protocols', 'EDIT')
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleRiceCalendarTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.rescheduleTask(id, dto, user);
  }
  @Post('tasks/:id/complete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @RequirePermission('rice_protocols', 'CREATE')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteRiceCalendarTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.completeTask(id, dto, user);
  }
}
