import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { RewardsService } from './rewards.service';
import { CreateRewardCampaignDto } from './dto/rewards.dto';

@ApiTags('rewards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  // ---- Farmer-facing ----

  @Get('mine')
  @ApiOperation({ summary: "The current farmer's announced reward wins" })
  myAwards(@CurrentUser() user: RequestUser) {
    return this.rewards.myAwards(user);
  }

  @Patch('winners/:id/confirm')
  @ApiOperation({ summary: 'Farmer confirms they received the reward' })
  confirmReceipt(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.rewards.confirmReceipt(id, user);
  }

  // ---- Admin / reward manager ----

  @Post('campaigns')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @RequirePermission('rewards', 'CREATE')
  @ApiOperation({ summary: 'Create a reward campaign (admin)' })
  createCampaign(
    @Body() dto: CreateRewardCampaignDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.rewards.createCampaign(dto, user);
  }

  @Get('campaigns')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
  @RequirePermission('rewards', 'VIEW')
  @ApiOperation({ summary: 'List reward campaigns' })
  listCampaigns() {
    return this.rewards.listCampaigns();
  }

  @Get('campaigns/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
  @RequirePermission('rewards', 'VIEW')
  @ApiOperation({ summary: 'Campaign detail with winners' })
  getCampaign(@Param('id') id: string) {
    return this.rewards.getCampaign(id);
  }

  @Get('campaigns/:id/eligible')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({ summary: 'List eligible farmer ids for a campaign' })
  async eligible(@Param('id') id: string) {
    const eligible = await this.rewards.computeEligible(id);
    return { count: eligible.length, farmerIds: eligible };
  }

  @Post('campaigns/:id/select')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Run auditable random winner selection (admin)' })
  select(@Param('id') id: string) {
    return this.rewards.runSelection(id);
  }

  @Get('campaigns/:id/reproduce')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
  @ApiOperation({
    summary: 'Reproduce winners from the stored seed + snapshot (audit)',
  })
  reproduce(@Param('id') id: string) {
    return this.rewards.reproduceSelection(id);
  }

  @Post('campaigns/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Approve & announce winners — notifies each in-app + SMS (admin)',
  })
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.rewards.approveAndNotify(id, user);
  }
}
