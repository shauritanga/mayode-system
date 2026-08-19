import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { CreateAiIntegrationRecordDto } from './dto/ai-integration-record.dto';
import { IntegrationsService } from './integrations.service';

const STAFF = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('ai-catalog')
  @Roles(...STAFF, UserRole.FARMER, UserRole.BUYER)
  @ApiOperation({
    summary:
      'AI product catalog — primary Field Advisory MVP plus equipment intake types',
  })
  catalog() {
    return this.integrations.catalog();
  }

  @Post('ai-records')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
  )
  @ApiOperation({
    summary:
      'Store AI/equipment evidence (soil tests, drone reports, sorter, QR, logistics)',
  })
  createAiRecord(
    @Body() dto: CreateAiIntegrationRecordDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.integrations.assertKnownSourceType(dto.sourceType);
    return this.integrations.create(dto, user);
  }

  @Post('ai-records/field-advisory/:cropCycleId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary:
      'Generate mayode.field-advisory.v1 for a crop cycle and store as FIELD_ADVISORY',
  })
  generateFieldAdvisory(
    @Param('cropCycleId') cropCycleId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.integrations.generateFieldAdvisory(cropCycleId, user);
  }

  @Get('ai-records/mine')
  @Roles(UserRole.FARMER, ...STAFF)
  @ApiOperation({
    summary:
      'List AI records visible to the caller (farmers: own farms; membership gates full recommendation)',
  })
  listMine(
    @CurrentUser() user: RequestUser,
    @Query('sourceType') sourceType?: string,
    @Query('farmId') farmId?: string,
    @Query('cropCycleId') cropCycleId?: string,
  ) {
    return this.integrations.listForUser(user, {
      farmId,
      cropCycleId,
      sourceType,
    });
  }

  @Get('ai-records/lot/:lotId/quality')
  @Roles(...STAFF, UserRole.BUYER)
  @ApiOperation({
    summary: 'Sorter / QR quality evidence for a lot (sales & traceability)',
  })
  lotQuality(@Param('lotId') lotId: string) {
    return this.integrations.lotQualityEvidence(lotId);
  }

  @Get('ai-records')
  @Roles(...STAFF)
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
