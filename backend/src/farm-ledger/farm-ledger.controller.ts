import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmAccountService } from './farm-account.service';

@ApiTags('farm-ledger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('farm-ledger')
export class FarmLedgerController {
  constructor(private readonly accounts: FarmAccountService) {}

  /** A farmer's whole account: charges, receipts, combine payments, inputs and what is still owed. */
  @Get('farmer/:id') @RequirePermission('dues', 'VIEW')
  farmer(@CurrentUser() u: RequestUser, @Param('id') id: string, @Query('mamcosId') mamcosId?: string) { return this.accounts.forFarmer(u, id, mamcosId); }

  /** One farm's account (the farm is an irrigation hectare). */
  @Get('farm/:hectareId') @RequirePermission('dues', 'VIEW')
  farm(@CurrentUser() u: RequestUser, @Param('hectareId') id: string, @Query('mamcosId') mamcosId?: string) { return this.accounts.forFarm(u, id, mamcosId); }
}
