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
import { DisputeStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto, ResolveDisputeDto } from './dto/disputes.dto';

const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

@ApiTags('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @Roles(...STAFF_ROLES)
  @RequirePermission('disputes', 'CREATE')
  @ApiOperation({
    summary:
      'Open a dispute (ownership conflict, duplicate claim, boundary overlap, etc.)',
  })
  create(@Body() dto: CreateDisputeDto, @CurrentUser() user: RequestUser) {
    return this.disputes.create(dto, user);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @RequirePermission('disputes', 'VIEW')
  @ApiOperation({
    summary: 'All disputes, optionally filtered by status (staff only)',
  })
  findAll(@Query('status') status?: DisputeStatus) {
    return this.disputes.findAll(status);
  }

  @Get('farm/:farmId')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Disputes for a specific farm' })
  findForFarm(@Param('farmId') farmId: string) {
    return this.disputes.findForFarm(farmId);
  }

  @Patch(':id/resolve')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Resolve, reject, or escalate a dispute (staff only)',
  })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.disputes.resolve(id, dto, user);
  }
}
