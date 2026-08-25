import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AccountingService } from './accounting.service';
import {
  CreateBillDto,
  CreateBudgetDto,
  CreateInvoiceDto,
} from './dto/accounting.dto';
@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.AUDITOR)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}
  @Get('statements') statements(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.statements(from, to);
  }
  @Get('profit-loss') pnl(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.profitAndLoss(from, to);
  }
  @Get('balance-sheet') balance(@Query('to') to?: string) {
    return this.accounting.balanceSheet(to);
  }
  @Get('cash-flow') cashFlow(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.cashFlow(from, to);
  }
  @Get('trial-balance') trialBalance(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.trialBalance(from, to);
  }
  @Get('ratios') ratios(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.ratios(from, to);
  }
  @Post('invoices') invoice(@Body() dto: CreateInvoiceDto) {
    return this.accounting.createInvoice(dto);
  }
  @Post('bills') bill(@Body() dto: CreateBillDto) {
    return this.accounting.createBill(dto);
  }
  @Post('bills/:id/pay') payBill(@Param('id') id: string) {
    return this.accounting.payBill(id);
  }
  @Get('receivables') receivables() {
    return this.accounting.receivables();
  }
  @Get('payables') payables() {
    return this.accounting.payables();
  }
  @Get('accounts') accounts() {
    return this.accounting.listAccounts();
  }
  @Post('budgets')
  @RequirePermission('accounting', 'CREATE')
  budget(@Body() dto: CreateBudgetDto) {
    return this.accounting.createBudget(dto);
  }
  @Get('budgets')
  @RequirePermission('accounting', 'VIEW')
  budgets() {
    return this.accounting.findAllBudgets();
  }
  @Get('budgets/:id')
  @RequirePermission('accounting', 'VIEW')
  budgetDetail(@Param('id') id: string) {
    return this.accounting.findBudget(id);
  }
  @Get('budgets/:id/actual')
  @RequirePermission('accounting', 'VIEW')
  actual(@Param('id') id: string) {
    return this.accounting.budgetActual(id);
  }
}
