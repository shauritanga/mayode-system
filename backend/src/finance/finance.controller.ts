import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { CreateInputCostDto, CreateRevenueDto } from './dto/finance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Post('cost')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.FARMER)
  @ApiOperation({ summary: 'Log a production input cost (Seeds, fertilizer, labor, tractor tillage, etc.)' })
  addInputCost(@Body() createInputCostDto: CreateInputCostDto) {
    return this.financeService.addInputCost(createInputCostDto);
  }

  @Post('revenue')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Log harvest sales revenue & Fairtrade premium' })
  addRevenue(@Body() createRevenueDto: CreateRevenueDto) {
    return this.financeService.addRevenue(createRevenueDto);
  }

  @Get('crop-cycle/:cropCycleId/summary')
  @ApiOperation({ summary: 'Get complete financial summary & profitability margin for a crop cycle' })
  getCropCycleFinancialSummary(@Param('cropCycleId') cropCycleId: string) {
    return this.financeService.getCropCycleFinancialSummary(cropCycleId);
  }

  @Get('farmer/:farmerId/summary')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR, UserRole.FINANCIAL_PROVIDER, UserRole.FARMER)
  @ApiOperation({ summary: 'Get overall farmer financial summary (all crop cycles combined)' })
  getFarmerFinancialSummary(@Param('farmerId') farmerId: string) {
    return this.financeService.getFarmerFinancialSummary(farmerId);
  }
}
