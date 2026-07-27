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
import { SuggestedUpdateStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmCorrectionsService } from './farm-corrections.service';
import {
  RecordFarmDataValueDto,
  ResolveFarmDataConflictDto,
  ReviewFarmUpdateDto,
  SubmitFarmUpdateDto,
} from './dto/farm-corrections.dto';

const STAFF_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

@ApiTags('farm-corrections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farms/:farmId')
export class FarmCorrectionsController {
  constructor(private readonly corrections: FarmCorrectionsService) {}

  // ---- Suggested updates ("Add More Details" / "Suggest Correction") ----

  @Post('suggested-updates')
  @ApiOperation({
    summary: 'Suggest a correction to a farm field (owner/renter/officer)',
  })
  submit(
    @Param('farmId') farmId: string,
    @Body() dto: SubmitFarmUpdateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.corrections.submitUpdate(farmId, dto, user);
  }

  @Get('suggested-updates')
  @ApiOperation({ summary: "List a farm's suggested corrections" })
  listForFarm(
    @Param('farmId') farmId: string,
    @Query('status') status?: SuggestedUpdateStatus,
  ) {
    return this.corrections.listForFarm(farmId, status);
  }

  // ---- Data values (source-tracked field data) ----

  @Post('data-values')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      'Record a source-tracked value for a farm attribute (AMCOS/officer/satellite/etc.)',
  })
  recordValue(
    @Param('farmId') farmId: string,
    @Body() dto: RecordFarmDataValueDto,
  ) {
    return this.corrections.recordValue(farmId, dto);
  }

  @Get('data-values')
  @ApiOperation({ summary: "List a farm's source-tracked data values" })
  listValues(@Param('farmId') farmId: string) {
    return this.corrections.listValuesForFarm(farmId);
  }

  @Patch('data-values/:fieldName/resolve')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      'Resolve a conflicting field value by picking the approved source (staff)',
  })
  resolveConflict(
    @Param('farmId') farmId: string,
    @Param('fieldName') fieldName: string,
    @Body() dto: ResolveFarmDataConflictDto,
  ) {
    return this.corrections.resolveConflict(
      farmId,
      fieldName,
      dto.approvedValueId,
    );
  }
}

@ApiTags('farm-corrections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suggested-updates')
export class SuggestedUpdatesController {
  constructor(private readonly corrections: FarmCorrectionsService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      'All suggested farm corrections, optionally filtered by status (staff review queue)',
  })
  listAll(@Query('status') status?: SuggestedUpdateStatus) {
    return this.corrections.listAll(status);
  }

  @Patch(':id/review')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Approve, reject, or merge a suggested correction (staff only)',
  })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewFarmUpdateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.corrections.review(id, dto, user);
  }
}

@ApiTags('farm-corrections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farm-data-conflicts')
export class FarmDataConflictsController {
  constructor(private readonly corrections: FarmCorrectionsService) {}

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary:
      'All unresolved conflicting farm data values across farms (staff only)',
  })
  listConflicts() {
    return this.corrections.listConflicts();
  }
}
