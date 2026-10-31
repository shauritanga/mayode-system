import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { CommunicationsService } from './communications.service';
import { AudienceDto, PageQueryDto, SendCommunicationDto } from './dto/communications.dto';

@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get('channels') @RequirePermission('communication', 'VIEW')
  channels() { return this.communications.channels(); }

  @Get('farmers') @RequirePermission('communication', 'VIEW')
  farmers(@CurrentUser() u: RequestUser, @Query() q: PageQueryDto) { return this.communications.farmers(u, q); }

  @Post('preview') @RequirePermission('communication', 'VIEW')
  preview(@CurrentUser() u: RequestUser, @Body() dto: AudienceDto, @Query('mamcosId') mamcosId?: string) { return this.communications.preview(u, dto, mamcosId); }

  @Post() @RequirePermission('communication', 'CREATE')
  send(@CurrentUser() u: RequestUser, @Body() dto: SendCommunicationDto, @Query('mamcosId') mamcosId?: string) { return this.communications.send(u, dto, mamcosId); }

  @Get() @RequirePermission('communication', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: PageQueryDto) { return this.communications.list(u, q); }

  @Get(':id') @RequirePermission('communication', 'VIEW')
  get(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query() q: PageQueryDto) { return this.communications.get(u, id, q); }
}
