import { PermissionResource } from '../auth/role-access';
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AccountingService } from './accounting.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import {
  CreateBillDto,
  CreateBudgetDto,
  CreateMemberContributionDto,
  CreateReserveAllocationDto,
  CreateInvoiceDto,
  CreateJournalEntryDto,
} from './dto/accounting.dto';
@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('accounting')
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
    @Query('to') to?: string,
  ) {
    return this.accounting.trialBalance(undefined, to);
  }
  @Get('account-balances')
  @RequirePermission('accounting', 'VIEW')
  accountBalances(@Query('to') to?: string) {
    return this.accounting.accountBalances(to);
  }
  @Get('journal-entries')
  @RequirePermission('accounting', 'VIEW')
  journalEntries() {
    return this.accounting.journalEntries();
  }
  @Post('journal-entries')
  @RequirePermission('accounting', 'CREATE')
  createJournalEntry(@Body() dto: CreateJournalEntryDto) {
    return this.accounting.createJournalEntry(dto);
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
  @Get('farmer-liabilities') farmerLiabilities(
    @CurrentUser() user: RequestUser,
  ) {
    return this.accounting.farmerLiabilities(user);
  }
  @Get('member-contributions') memberContributions(
    @CurrentUser() user: RequestUser,
  ) {
    return this.accounting.memberContributions(user);
  }
  @Post('member-contributions') createMemberContribution(
    @Body() dto: CreateMemberContributionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accounting.createMemberContribution(dto, user);
  }
  @Get('reserves') reserves(@CurrentUser() user: RequestUser) {
    return this.accounting.reserveAllocations(user);
  }
  @Post('reserves') createReserveAllocation(
    @Body() dto: CreateReserveAllocationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accounting.createReserveAllocation(dto, user);
  }
  @Post('budgets')
  @RequirePermission('accounting', 'CREATE')
  budget(@Body() dto: CreateBudgetDto, @CurrentUser() user: RequestUser) {
    return this.accounting.createBudget(dto, user);
  }
  @Get('budgets')
  @RequirePermission('accounting', 'VIEW')
  budgets(@CurrentUser() user: RequestUser) {
    return this.accounting.findAllBudgets(user);
  }
  @Post('budgets/:id/approve')
  @RequirePermission('accounting', 'EDIT')
  approveBudget(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.accounting.approveBudget(id, user);
  }
  @Get('approved-allocations')
  approvedAllocations(@CurrentUser() user: RequestUser) {
    return this.accounting.approvedAllocations(user);
  }
  @Get('budgets/:id')
  @RequirePermission('accounting', 'VIEW')
  budgetDetail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.accounting.findBudget(id, user);
  }
  @Get('budgets/:id/actual')
  @RequirePermission('accounting', 'VIEW')
  actual(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.accounting.budgetActual(id, user);
  }
}
