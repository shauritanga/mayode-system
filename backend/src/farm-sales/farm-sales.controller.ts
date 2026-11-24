import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { FarmSalesService } from './farm-sales.service';
import { CreateFarmSaleDto, PayFeeDto } from './dto/farm-sales.dto';

/** Farms for sale inside the member's own AMCOS. Open to any signed-in user; the service scopes everything. */
@ApiTags('farm-sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('farm-sales')
export class FarmSalesController {
  constructor(private readonly sales: FarmSalesService) {}

  @Get() list(@CurrentUser() u: RequestUser) { return this.sales.list(u); }
  @Get('mine') mine(@CurrentUser() u: RequestUser) { return this.sales.mine(u); }
  @Get('fee') async fee() { return { amount: await this.sales.feeAmount() }; }
  @Get(':id') get(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.sales.get(u, id); }
  @Post() create(@CurrentUser() u: RequestUser, @Body() dto: CreateFarmSaleDto) { return this.sales.create(u, dto); }
  @Post(':id/pay-fee') payFee(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: PayFeeDto) { return this.sales.payFee(u, id, dto.phoneNumber); }
  @Post(':id/withdraw') withdraw(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.sales.withdraw(u, id); }
  @Post(':id/buy') buy(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: PayFeeDto) { return this.sales.buy(u, id, dto.phoneNumber); }
  @Post(':id/reconcile') reconcile(@CurrentUser() u: RequestUser, @Param('id') id: string) { return this.sales.reconcileMine(u, id); }
}
