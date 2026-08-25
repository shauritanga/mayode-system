import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { CreateInputCostDto, CreateRevenueDto } from './dto/finance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { UserRole } from '@prisma/client';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('cost')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
  )
  @RequirePermission('finance', 'CREATE')
  @ApiOperation({
    summary:
      'Log a production input cost (Seeds, fertilizer, labor, tractor tillage, etc.)',
  })
  addInputCost(
    @Body() dto: CreateInputCostDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.addInputCost(dto, user);
  }

  @Post('revenue')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FARMER,
  )
  @RequirePermission('finance', 'CREATE')
  @ApiOperation({
    summary:
      'Log harvest sales revenue & Fairtrade premium (farmer self-report or staff-recorded)',
  })
  addRevenue(@Body() dto: CreateRevenueDto, @CurrentUser() user: RequestUser) {
    return this.financeService.addRevenue(dto, user);
  }

  @Get('costs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
  @RequirePermission('finance', 'VIEW')
  @ApiOperation({
    summary: 'Get all input costs across the system (staff only)',
  })
  findAllInputCosts() {
    return this.financeService.findAllInputCosts();
  }

  @Get('crop-cycle/:cropCycleId/summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FIELD_OFFICER,
    UserRole.MAMCOS_SECRETARY,
    UserRole.AUDITOR,
    UserRole.FINANCIAL_PROVIDER,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary:
      'Get complete financial summary & profitability margin for a crop cycle',
  })
  getCropCycleFinancialSummary(
    @Param('cropCycleId') cropCycleId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.getCropCycleFinancialSummary(cropCycleId, user);
  }

  @Get('farmer/:farmerId/summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.AUDITOR,
    UserRole.FINANCIAL_PROVIDER,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary: 'Get overall farmer financial summary (all crop cycles combined)',
  })
  getFarmerFinancialSummary(
    @Param('farmerId') farmerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.financeService.getFarmerFinancialSummary(farmerId, user);
  }
}
