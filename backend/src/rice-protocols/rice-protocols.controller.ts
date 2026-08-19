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
import type { RequestUser } from '../common/ownership.service';
import {
  CompleteRiceCalendarTaskDto,
  RescheduleRiceCalendarTaskDto,
  UpdateRiceProtocolDto,
} from './dto/rice-protocol.dto';
import { RiceProtocolsService } from './rice-protocols.service';

@ApiTags('rice-protocols')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rice-protocols')
export class RiceProtocolsController {
  constructor(private readonly protocols: RiceProtocolsService) {}
  @Post('mamcos/:mamcosId/bootstrap')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary: 'Create the default Mbalari rice calendar for a cooperative',
  })
  bootstrap(
    @Param('mamcosId') mamcosId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.bootstrap(mamcosId, user);
  }
  @Get('mamcos/:mamcosId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  protocolsForMamcos(
    @Param('mamcosId') mamcosId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.getForMamcos(mamcosId, user);
  }
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
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
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleRiceCalendarTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.rescheduleTask(id, dto, user);
  }
  @Post('tasks/:id/complete')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteRiceCalendarTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.protocols.completeTask(id, dto, user);
  }
}
