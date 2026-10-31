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
  // Every report and posting below is confined to one cooperative's books: the caller's own, or — for Super Admin — the
  // one named in ?mamcosId=, or everything when none is named. See AccountingService.scopeFor.
  @Get('statements') statements(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mamcosId') mamcosId?: string,
  ) {
    return this.accounting.statements(this.accounting.scopeFor(user, mamcosId), from, to);
  }
  @Get('profit-loss') pnl(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mamcosId') mamcosId?: string,
  ) {
    return this.accounting.profitAndLoss(this.accounting.scopeFor(user, mamcosId), from, to);
  }
  @Get('balance-sheet') balance(@CurrentUser() user: RequestUser, @Query('to') to?: string, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.balanceSheet(this.accounting.scopeFor(user, mamcosId), to);
  }
  @Get('cash-flow') cashFlow(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mamcosId') mamcosId?: string,
  ) {
    return this.accounting.cashFlow(this.accounting.scopeFor(user, mamcosId), from, to);
  }
  @Get('trial-balance') trialBalance(
    @CurrentUser() user: RequestUser,
    @Query('to') to?: string,
    @Query('mamcosId') mamcosId?: string,
  ) {
    return this.accounting.trialBalance(this.accounting.scopeFor(user, mamcosId), undefined, to);
  }
  @Get('account-balances')
  @RequirePermission('accounting', 'VIEW')
  accountBalances(@CurrentUser() user: RequestUser, @Query('to') to?: string, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.accountBalances(this.accounting.scopeFor(user, mamcosId), to);
  }
  @Get('journal-entries')
  @RequirePermission('accounting', 'VIEW')
  journalEntries(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.journalEntries(this.accounting.scopeFor(user, mamcosId));
  }
  @Post('journal-entries')
  @RequirePermission('accounting', 'CREATE')
  createJournalEntry(@Body() dto: CreateJournalEntryDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.createJournalEntry(dto, this.accounting.scopeFor(user, mamcosId));
  }
  @Get('ratios') ratios(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mamcosId') mamcosId?: string,
  ) {
    return this.accounting.ratios(this.accounting.scopeFor(user, mamcosId), from, to);
  }
  @Post('invoices') invoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.createInvoice(dto, this.accounting.scopeFor(user, mamcosId));
  }
  @Post('bills') bill(@Body() dto: CreateBillDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.createBill(dto, this.accounting.scopeFor(user, mamcosId));
  }
  @Post('bills/:id/pay') payBill(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.payBill(id, this.accounting.scopeFor(user, mamcosId));
  }
  @Get('receivables') receivables(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.receivables(this.accounting.scopeFor(user, mamcosId));
  }
  @Get('payables') payables(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.payables(this.accounting.scopeFor(user, mamcosId));
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
