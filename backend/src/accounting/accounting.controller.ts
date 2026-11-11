import { PermissionResource } from '../auth/role-access';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
  ReverseJournalDto,
} from './dto/accounting.dto';
import {
  AdjustLineDto, CloseBooksDto, CreateStatementDto, MatchLineDto, ReopenBooksDto,
  CashSettingsDto, CorrectCashTransactionDto, RejectCashTransactionDto, UpdateCashTransactionDto, CreateCashAccountDto, CashTransferDto, FarmerPayoutDto, PayDto, UpdateCashAccountDto, CreateCashTransactionDto, TaxSettingsDto, VatSettlementDto, VoidCashTransactionDto, WithholdingRemittanceDto,
} from './dto/ledger-controls.dto';
import { CashTransactionsService } from './cash-transactions.service';
import { CashAccountsService } from './cash-accounts.service';
import { FarmerAccountsService } from './farmer-accounts.service';
import { PeriodLockService } from './period-lock.service';
import { ReconciliationService } from './reconciliation.service';
import { TaxService } from './tax.service';
import { ReportExportService } from './report-export.service';
import { GenerateReportDto, ListReportArchiveDto } from './dto/report-export.dto';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@PermissionResource('accounting')
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly periods: PeriodLockService,
    private readonly reconciliation: ReconciliationService,
    private readonly tax: TaxService,
    private readonly cash: CashTransactionsService,
    private readonly cashAccounts: CashAccountsService,
    private readonly farmerAccounts: FarmerAccountsService,
    private readonly reportExports: ReportExportService,
  ) {}
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
  journalEntries(
    @CurrentUser() user: RequestUser,
    @Query('mamcosId') mamcosId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sourceType') sourceType?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accounting.journalEntries(this.accounting.scopeFor(user, mamcosId), { from, to, sourceType, q, limit: limit ? Number(limit) : undefined });
  }
  @Post('journal-entries')
  @RequirePermission('accounting', 'CREATE')
  createJournalEntry(@Body() dto: CreateJournalEntryDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.createJournalEntry(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('journal-entries/:journalId/reverse')
  @RequirePermission('accounting', 'EDIT')
  reverseJournal(@Param('journalId') journalId: string, @Body() dto: ReverseJournalDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.reverseJournal(journalId, dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  // PDF / Word / Excel statements for a chosen period. Every one generated is archived so it can be downloaded again.
  @Post('report-exports')
  @RequirePermission('accounting', 'VIEW')
  generateReport(@Body() dto: GenerateReportDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reportExports.generate(this.accounting.scopeFor(user, mamcosId), user, dto);
  }
  @Get('report-exports')
  @RequirePermission('accounting', 'VIEW')
  listReports(@Query() q: ListReportArchiveDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reportExports.list(this.accounting.scopeFor(user, mamcosId), q);
  }
  @Get('report-exports/:id/download')
  @RequirePermission('accounting', 'VIEW')
  async downloadReport(@Param('id') id: string, @CurrentUser() user: RequestUser, @Res() res: Response, @Query('mamcosId') mamcosId?: string) {
    const f = await this.reportExports.file(this.accounting.scopeFor(user, mamcosId), id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
    res.send(Buffer.from(f.content));
  }
  @Get('ratios') ratios(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('mamcosId') mamcosId?: string,
  ) {
    return this.accounting.ratios(this.accounting.scopeFor(user, mamcosId), from, to);
  }
  @Get('invoices')
  @RequirePermission('accounting', 'VIEW')
  invoiceList(@CurrentUser() user: RequestUser, @Query('status') status?: string, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.documents('INVOICE', this.accounting.scopeFor(user, mamcosId), status);
  }
  @Get('bills')
  @RequirePermission('accounting', 'VIEW')
  billList(@CurrentUser() user: RequestUser, @Query('status') status?: string, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.documents('BILL', this.accounting.scopeFor(user, mamcosId), status);
  }
  @Post('invoices')
  @RequirePermission('accounting', 'CREATE')
  invoice(@Body() dto: CreateInvoiceDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.createInvoice(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('invoices/:id/pay')
  @RequirePermission('accounting', 'EDIT')
  payInvoice(@Param('id') id: string, @Body() dto: PayDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.payInvoice(id, this.accounting.scopeFor(user, mamcosId), user.id, dto?.cashAccountId, dto?.amount);
  }
  @Post('invoices/:id/void')
  @RequirePermission('accounting', 'EDIT')
  voidInvoice(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.voidInvoice(id, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('bills')
  @RequirePermission('accounting', 'CREATE')
  bill(@Body() dto: CreateBillDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.createBill(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('bills/:id/pay')
  @RequirePermission('accounting', 'EDIT')
  payBill(@Param('id') id: string, @Body() dto: PayDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.payBill(id, this.accounting.scopeFor(user, mamcosId), user.id, dto?.cashAccountId, dto?.amount);
  }
  @Post('bills/:id/void')
  @RequirePermission('accounting', 'EDIT')
  voidBill(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.accounting.voidBill(id, this.accounting.scopeFor(user, mamcosId), user.id);
  }

  // ───── Closing the books ─────
  @Get('period-lock')
  @RequirePermission('accounting', 'VIEW')
  periodLock(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.periods.status(this.accounting.scopeFor(user, mamcosId));
  }
  @Get('period-lock/check')
  @RequirePermission('accounting', 'VIEW')
  periodLockCheck(@Query('through') through: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.periods.check(this.accounting.scopeFor(user, mamcosId), through);
  }
  @Post('period-lock/close')
  @RequirePermission('accounting', 'EDIT')
  closeBooks(@Body() dto: CloseBooksDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.periods.close(dto.through, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  // Reopening needs the DELETE grant, so the person who closes the books is not automatically the one who can undo it.
  @Post('period-lock/reopen')
  @RequirePermission('accounting', 'DELETE')
  reopenBooks(@Body() dto: ReopenBooksDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.periods.reopen(dto.to, dto.reason, this.accounting.scopeFor(user, mamcosId), user.id);
  }

  // ───── Bank and mobile-money reconciliation ─────
  @Get('reconciliation/summary')
  @RequirePermission('accounting', 'VIEW')
  reconciliationSummary(@CurrentUser() user: RequestUser, @Query('asOf') asOf?: string, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.summary(this.accounting.scopeFor(user, mamcosId), asOf);
  }
  @Get('reconciliation/statements')
  @RequirePermission('accounting', 'VIEW')
  statementsList(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.list(this.accounting.scopeFor(user, mamcosId));
  }
  @Post('reconciliation/statements')
  @RequirePermission('accounting', 'CREATE')
  createStatement(@Body() dto: CreateStatementDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.create(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Get('reconciliation/statements/:id')
  @RequirePermission('accounting', 'VIEW')
  statementDetail(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.detail(id, this.accounting.scopeFor(user, mamcosId));
  }
  @Post('reconciliation/statements/:id/auto-match')
  @RequirePermission('accounting', 'EDIT')
  autoMatch(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.autoMatch(id, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('reconciliation/statements/:id/reconcile')
  @RequirePermission('accounting', 'EDIT')
  reconcile(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.reconcile(id, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('reconciliation/statements/:id/reopen')
  @RequirePermission('accounting', 'DELETE')
  reopenStatement(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.reopen(id, this.accounting.scopeFor(user, mamcosId));
  }
  @Delete('reconciliation/statements/:id')
  @RequirePermission('accounting', 'DELETE')
  deleteStatement(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.remove(id, this.accounting.scopeFor(user, mamcosId));
  }
  @Post('reconciliation/lines/:lineId/match')
  @RequirePermission('accounting', 'EDIT')
  matchLine(@Param('lineId') lineId: string, @Body() dto: MatchLineDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.match(lineId, dto.ledgerEntryId, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('reconciliation/lines/:lineId/unmatch')
  @RequirePermission('accounting', 'EDIT')
  unmatchLine(@Param('lineId') lineId: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.unmatch(lineId, this.accounting.scopeFor(user, mamcosId));
  }
  @Post('reconciliation/lines/:lineId/adjust')
  @RequirePermission('accounting', 'CREATE')
  adjustLine(@Param('lineId') lineId: string, @Body() dto: AdjustLineDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.reconciliation.adjust(lineId, dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }

  // ───── Everyday expenses and income ─────
  @Get('cash-transactions')
  @RequirePermission('accounting', 'VIEW')
  cashList(
    @CurrentUser() user: RequestUser, @Query('kind') kind?: 'EXPENSE' | 'INCOME', @Query('from') from?: string, @Query('to') to?: string,
    @Query('q') q?: string, @Query('mamcosId') mamcosId?: string,
  ) {
    return this.cash.list(this.accounting.scopeFor(user, mamcosId), { kind, from, to, q });
  }
  @Get('cash-transactions/categories')
  @RequirePermission('accounting', 'VIEW')
  cashCategories(@Query('kind') kind: 'EXPENSE' | 'INCOME') {
    return this.cash.categories(kind);
  }
  @Post('cash-transactions')
  @RequirePermission('accounting', 'CREATE')
  cashCreate(@Body() dto: CreateCashTransactionDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.create(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Patch('cash-transactions/:id')
  @RequirePermission('accounting', 'EDIT')
  cashUpdate(@Param('id') id: string, @Body() dto: UpdateCashTransactionDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.update(id, dto, this.accounting.scopeFor(user, mamcosId));
  }
  @Post('cash-transactions/:id/correct')
  @RequirePermission('accounting', 'EDIT')
  cashCorrect(@Param('id') id: string, @Body() dto: CorrectCashTransactionDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.correct(id, dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('cash-transactions/:id/approve')
  @RequirePermission('expense_approval', 'EDIT')
  cashApprove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.approve(id, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('cash-transactions/:id/reject')
  @RequirePermission('expense_approval', 'EDIT')
  cashReject(@Param('id') id: string, @Body() dto: RejectCashTransactionDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.reject(id, dto.reason, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Get('cash-settings')
  @RequirePermission('accounting', 'VIEW')
  cashSettings(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.settings(this.accounting.scopeFor(user, mamcosId));
  }
  @Put('cash-settings')
  @RequirePermission('accounting', 'EDIT')
  saveCashSettings(@Body() dto: CashSettingsDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.saveSettings(this.accounting.scopeFor(user, mamcosId), dto);
  }
  @Post('cash-transactions/:id/void')
  @RequirePermission('accounting', 'EDIT')
  cashVoid(@Param('id') id: string, @Body() dto: VoidCashTransactionDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cash.voidOne(id, dto.reason, this.accounting.scopeFor(user, mamcosId), user.id);
  }

  // ───── farmers: what is owed to them, payouts, statements ─────
  @Get('farmer-accounts')
  @RequirePermission('accounting', 'VIEW')
  farmerOwed(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.farmerAccounts.owed(this.accounting.scopeFor(user, mamcosId));
  }
  @Get('farmer-accounts/statement')
  @RequirePermission('accounting', 'VIEW')
  farmerStatement(@CurrentUser() user: RequestUser, @Query('farmerId') farmerId?: string, @Query('seller') seller?: string, @Query('mamcosId') mamcosId?: string) {
    return this.farmerAccounts.statement(this.accounting.scopeFor(user, mamcosId), { farmerId, seller });
  }
  @Get('farmer-payouts')
  @RequirePermission('accounting', 'VIEW')
  farmerPayouts(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.farmerAccounts.payouts(this.accounting.scopeFor(user, mamcosId));
  }
  @Post('farmer-payouts')
  @RequirePermission('accounting', 'CREATE')
  farmerPay(@Body() dto: FarmerPayoutDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.farmerAccounts.pay(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('farmer-payouts/:id/void')
  @RequirePermission('accounting', 'EDIT')
  farmerPayoutVoid(@Param('id') id: string, @Body() dto: VoidCashTransactionDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.farmerAccounts.void(id, dto.reason, this.accounting.scopeFor(user, mamcosId), user.id);
  }

  // ───── money accounts (cash box, banks, mobile money) ─────
  @Get('cash-accounts')
  @RequirePermission('accounting', 'VIEW')
  cashAccountList(@CurrentUser() user: RequestUser, @Query('includeInactive') includeInactive?: string, @Query('mamcosId') mamcosId?: string) {
    return this.cashAccounts.list(this.accounting.scopeFor(user, mamcosId), { includeInactive: includeInactive === 'true' });
  }
  @Get('cash-accounts/transfers')
  @RequirePermission('accounting', 'VIEW')
  cashTransfers(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cashAccounts.transfers(this.accounting.scopeFor(user, mamcosId));
  }
  @Post('cash-accounts/transfers')
  @RequirePermission('accounting', 'CREATE')
  cashTransfer(@Body() dto: CashTransferDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cashAccounts.transfer(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('cash-accounts/transfers/:id/cancel')
  @RequirePermission('accounting', 'EDIT')
  cashTransferCancel(@Param('id') id: string, @Body() dto: VoidCashTransactionDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cashAccounts.cancelTransfer(id, dto.reason, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('cash-accounts')
  @RequirePermission('accounting', 'CREATE')
  cashAccountCreate(@Body() dto: CreateCashAccountDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cashAccounts.create(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Patch('cash-accounts/:id')
  @RequirePermission('accounting', 'EDIT')
  cashAccountUpdate(@Param('id') id: string, @Body() dto: UpdateCashAccountDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.cashAccounts.update(id, dto, this.accounting.scopeFor(user, mamcosId));
  }
  @Get('cash-book')
  @RequirePermission('accounting', 'VIEW')
  cashBook(
    @CurrentUser() user: RequestUser, @Query('account') account?: string, @Query('kind') kind?: 'CASH' | 'BANK' | 'MOBILE_MONEY',
    @Query('from') from?: string, @Query('to') to?: string, @Query('mamcosId') mamcosId?: string,
  ) {
    return this.cashAccounts.cashBook(this.accounting.scopeFor(user, mamcosId), { account, kind, from, to });
  }

  // ───── VAT and withholding tax ─────
  @Get('tax/settings')
  @RequirePermission('accounting', 'VIEW')
  taxSettings(@CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.tax.settings(this.accounting.scopeFor(user, mamcosId));
  }
  @Patch('tax/settings')
  @RequirePermission('accounting', 'EDIT')
  updateTaxSettings(@Body() dto: TaxSettingsDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.tax.updateSettings(dto, this.accounting.scopeFor(user, mamcosId));
  }
  @Get('tax/vat-return')
  @RequirePermission('accounting', 'VIEW')
  vatReturn(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.tax.vatReturn(this.accounting.scopeFor(user, mamcosId), from, to);
  }
  @Post('tax/vat-settlement')
  @RequirePermission('accounting', 'CREATE')
  settleVat(@Body() dto: VatSettlementDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.tax.settleVat(dto, this.accounting.scopeFor(user, mamcosId), user.id);
  }
  @Post('tax/withholding-remittance')
  @RequirePermission('accounting', 'CREATE')
  remitWithholding(@Body() dto: WithholdingRemittanceDto, @CurrentUser() user: RequestUser, @Query('mamcosId') mamcosId?: string) {
    return this.tax.remitWithholding(dto, this.accounting.scopeFor(user, mamcosId), user.id);
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
