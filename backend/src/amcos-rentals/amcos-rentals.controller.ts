import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { AmcosRentalsService } from './amcos-rentals.service';
import { RaiseRentalDisputeDto, WitnessNoteDto } from './dto/amcos-rentals.dto';

const STAFF = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.MAMCOS_SECRETARY, UserRole.AUDITOR, UserRole.CUSTOM];

/** The cooperative's record of farms rented through M-LAX. No money is ever returned from here. */
@ApiTags('amcos-rentals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...STAFF)
@Controller('amcos-rentals')
export class AmcosRentalsController {
  constructor(private readonly rentals: AmcosRentalsService) {}

  @Get() @RequirePermission('farm_leases', 'VIEW')
  @ApiOperation({ summary: 'Rentals of this cooperative’s farms made through M-LAX (no prices)' })
  list(@CurrentUser() u: RequestUser, @Query() q: { status?: string; q?: string; hectareId?: string }) { return this.rentals.list(u, q); }

  @Get('hectare/:hectareId') @RequirePermission('farm_leases', 'VIEW')
  forHectare(@CurrentUser() u: RequestUser, @Param('hectareId') hectareId: string) { return this.rentals.forHectare(hectareId, u); }

  @Get(':id') @RequirePermission('farm_leases', 'VIEW')
  get(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.rentals.get(id, u); }

  @Put(':id/witness-note') @RequirePermission('farm_leases', 'EDIT')
  note(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: WitnessNoteDto) { return this.rentals.addWitnessNote(id, dto.note, u); }

  @Post(':id/disputes') @RequirePermission('farm_leases', 'CREATE')
  dispute(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: RaiseRentalDisputeDto) { return this.rentals.raiseDispute(id, dto, u); }
}
