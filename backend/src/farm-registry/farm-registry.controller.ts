import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FarmRegistryStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmRegistryService } from './farm-registry.service';
import { PreRegisterFarmDto } from './dto/farm-registry.dto';

@ApiTags('farm-registry')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farm-registry')
export class FarmRegistryController {
  constructor(private readonly registry: FarmRegistryService) {}

  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
  )
  @ApiOperation({
    summary: 'AMCOS/officer pre-registers a farm under a known owner',
  })
  preRegister(
    @Body() dto: PreRegisterFarmDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.registry.preRegister(dto, user);
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({ summary: 'List pre-registered farms (staff)' })
  @ApiQuery({ name: 'status', required: false, enum: FarmRegistryStatus })
  @ApiQuery({ name: 'mamcosId', required: false })
  list(
    @Query('status') status?: FarmRegistryStatus,
    @Query('mamcosId') mamcosId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.registry.listAll(status, mamcosId, user);
  }

  @Get('mine')
  @ApiOperation({
    summary:
      'Pre-registered farms awaiting confirmation from the current owner',
  })
  mine(@CurrentUser() user: RequestUser) {
    return this.registry.mine(user);
  }

  @Post(':id/claim')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Owner confirms & claims a pre-registered farm (materializes a Farm)',
  })
  claim(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.registry.claim(id, user);
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Owner rejects a pre-registered farm as not theirs (marks disputed)',
  })
  reject(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.registry.reject(id, user);
  }

  @Post(':id/resend-confirmation')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
  )
  @ApiOperation({
    summary: 'Resend the owner-confirmation SMS (rate-limited, staff only)',
  })
  resendConfirmation(@Param('id') id: string) {
    return this.registry.resendConfirmation(id);
  }

  @Get(':id/confirmation-requests')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
  )
  @ApiOperation({
    summary: 'Confirmation-request history for a registry record (staff only)',
  })
  confirmationRequests(@Param('id') id: string) {
    return this.registry.listConfirmationRequests(id);
  }
}
