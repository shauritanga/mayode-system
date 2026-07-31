import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { CreateAiIntegrationRecordDto } from './dto/ai-integration-record.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post('ai-records')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({
    summary:
      'Store future AI/equipment evidence records such as soil tests, drone reports, rice sorter output or QR traceability payloads',
  })
  createAiRecord(
    @Body() dto: CreateAiIntegrationRecordDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.integrations.create(dto, user);
  }

  @Get('ai-records')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({ summary: 'List stored AI/equipment integration evidence' })
  listAiRecords(
    @Query('sourceType') sourceType?: string,
    @Query('farmId') farmId?: string,
    @Query('cropCycleId') cropCycleId?: string,
    @Query('lotId') lotId?: string,
  ) {
    return this.integrations.list({ sourceType, farmId, cropCycleId, lotId });
  }
}
