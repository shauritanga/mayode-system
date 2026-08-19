import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PartnerApiGuard } from './partner-api.guard';
import { PartnerApiService } from './partner-api.service';

@ApiTags('partner-api')
@Controller('partner')
export class PartnerApiController {
  constructor(private readonly partners: PartnerApiService) {}

  @Get('v1/docs')
  @ApiOperation({
    summary: 'Partner API v1 discovery document (auth, endpoints, schema)',
  })
  docs() {
    return this.partners.docs();
  }

  @Post('keys')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Issue a partner API key (plaintext returned once)',
  })
  key(@Body('partnerName') partnerName: string) {
    return this.partners.createKey(partnerName);
  }

  @Get('keys')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'List partner API keys (no secrets)' })
  listKeys() {
    return this.partners.listKeys();
  }

  @Patch('keys/:id/revoke')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Revoke a partner API key' })
  revoke(@Param('id') id: string) {
    return this.partners.revokeKey(id);
  }

  @Get('keys/:id/requests')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Audit log of partner API requests for a key' })
  requests(@Param('id') id: string, @Query('take') take?: string) {
    return this.partners.listRequests(id, take ? Number(take) : 50);
  }

  @Get('v1/farmers/:id/credit-profile')
  @UseGuards(PartnerApiGuard)
  @ApiHeader({ name: 'X-API-Key', required: true })
  @ApiOperation({
    summary:
      'Consent-gated credit profile (schema mayode.credit-profile.v1). Audited per request.',
  })
  profile(@Param('id') id: string, @Req() req: any) {
    return this.partners.creditProfile(req.partnerApiKey.id, id, req.ip);
  }
}
