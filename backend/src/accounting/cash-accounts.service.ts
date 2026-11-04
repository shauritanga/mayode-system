import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CashAccountKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { bookingMoment, localDate, round2 } from './tax';
import { resolveCashAccount } from './cash-resolve';

type Db = Prisma.TransactionClient | PrismaService;

export interface CashAccountInput { name: string; kind: CashAccountKind; provider?: string; accountNumber?: string; notes?: string; openingBalance?: number; openingDate?: string }
export interface CashAccountPatch { name?: string; provider?: string; accountNumber?: string; notes?: string; isActive?: boolean; isDefault?: boolean }
export interface TransferInput { fromAccountId?: string | null; toAccountId?: string | null; amount: number; date: string; note?: string }

/** The cooperative's named places for money: the cash box, bank accounts and mobile money wallets. */
@Injectable()
export class CashAccountsService {
  constructor(private readonly prisma: PrismaService, private readonly accounting: AccountingService) {}

  private mamcos(scope: LedgerScope): string {
    if (!scope.mamcosId) throw new BadRequestException('Choose a cooperative.');
    return scope.mamcosId;
  }

  /** Balance of each money account, and of the money not yet assigned to one. Debits to the cash account are money in. */
  private async balances(mamcosId: string, db: Db = this.prisma) {
    const cash = await db.account.findUnique({ where: { code: '1000' }, select: { id: true } });
    if (!cash) return new Map<string | null, number>();
    const rows = await db.ledgerEntry.groupBy({ by: ['cashAccountId'], where: { mamcosId, accountId: cash.id }, _sum: { debit: true, credit: true } });
    return new Map(rows.map((r) => [r.cashAccountId, round2((r._sum.debit ?? 0) - (r._sum.credit ?? 0))]));
  }

  async list(scope: LedgerScope, opts: { includeInactive?: boolean } = {}) {
    const mamcosId = this.mamcos(scope);
    await this.accounting.listAccounts();
    const [accounts, balances] = await Promise.all([
      this.prisma.cashAccount.findMany({ where: { mamcosId, ...(opts.includeInactive ? {} : { isActive: true }) }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] }),
      this.balances(mamcosId),
    ]);
    const items = accounts.map((a) => ({ ...a, balance: balances.get(a.id) ?? 0 }));
    const unassigned = balances.get(null) ?? 0;
    return { items, unassigned, total: round2(items.reduce((n, a) => n + a.balance, 0) + unassigned) };
  }

  async create(dto: CashAccountInput, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const name = dto.name?.trim().replace(/\s+/g, ' ');
    if (!name || name.length < 2) throw new BadRequestException('Give the account a name of at least two letters.');
    if (!['CASH', 'BANK', 'MOBILE_MONEY'].includes(dto.kind)) throw new BadRequestException('Choose cash, bank or mobile money.');
    const opening = dto.openingBalance == null ? 0 : round2(dto.openingBalance);
    if (opening < 0) throw new BadRequestException('The opening balance cannot be negative.');
    if (dto.openingDate && dto.openingDate > localDate(new Date())) throw new BadRequestException('The opening date cannot be in the future.');
    if (await this.prisma.cashAccount.findFirst({ where: { mamcosId, name: { equals: name, mode: 'insensitive' } } })) throw new ConflictException(`An account called "${name}" already exists.`);
    await this.accounting.listAccounts();
    return this.prisma.$transaction(async (tx) => {
      const hasDefault = await tx.cashAccount.count({ where: { mamcosId, kind: dto.kind, isActive: true, isDefault: true } });
      const account = await tx.cashAccount.create({
        data: { mamcosId, name, kind: dto.kind, provider: dto.provider?.trim() || null, accountNumber: dto.accountNumber?.trim() || null, notes: dto.notes?.trim() || null, isDefault: !hasDefault, createdById: actorId ?? null },
      });
      if (opening > 0) {
        // Money the cooperative already had: cash goes up in this account, matched by the cooperative's own funds.
        await this.accounting.postToLedger('CashOpening', account.id, bookingMoment(dto.openingDate ?? localDate(new Date())), `Opening balance: ${name}`,
          [{ code: '1000', debit: opening, cashAccountId: account.id }, { code: '3000', credit: opening }], mamcosId, actorId, tx);
      }
      return { ...account, balance: opening };
    });
  }

  async update(id: string, dto: CashAccountPatch, scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const current = await this.prisma.cashAccount.findFirst({ where: { id, mamcosId } });
    if (!current) throw new NotFoundException('Money account not found.');
    const name = dto.name === undefined ? undefined : dto.name.trim().replace(/\s+/g, ' ');
    if (name !== undefined) {
      if (name.length < 2) throw new BadRequestException('Give the account a name of at least two letters.');
      if (await this.prisma.cashAccount.findFirst({ where: { mamcosId, id: { not: id }, name: { equals: name, mode: 'insensitive' } } })) throw new ConflictException(`An account called "${name}" already exists.`);
    }
    if (dto.isActive === false && current.isActive) {
      const balance = (await this.balances(mamcosId)).get(id) ?? 0;
      if (Math.abs(balance) >= 0.005) throw new ConflictException('Move the money out of this account before switching it off.');
    }
    return this.prisma.$transaction(async (tx) => {
      const active = dto.isActive ?? current.isActive;
      let isDefault = dto.isDefault ?? current.isDefault;
      if (!active) isDefault = false;
      if (isDefault && active) await tx.cashAccount.updateMany({ where: { mamcosId, kind: current.kind, isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.cashAccount.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}), ...(dto.provider !== undefined ? { provider: dto.provider.trim() || null } : {}),
          ...(dto.accountNumber !== undefined ? { accountNumber: dto.accountNumber.trim() || null } : {}), ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          isActive: active, isDefault,
        },
      });
    });
  }

  /** See resolveCashAccount: the account picked, else the default of the payment's kind, else none. */
  resolve(mamcosId: string | null, pick: { cashAccountId?: string | null; method?: string | null }, db: Db = this.prisma): Promise<string | null> {
    return resolveCashAccount(db, mamcosId, pick);
  }

  // ───────────────────────── moving money between accounts ─────────────────────────

  async transfers(scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const rows = await this.prisma.cashTransfer.findMany({ where: { mamcosId }, include: { from: { select: { id: true, name: true } }, to: { select: { id: true, name: true } } }, orderBy: [{ transferDate: 'desc' }, { createdAt: 'desc' }], take: 300 });
    return rows.map((r) => ({ ...r, amount: Number(r.amount), date: r.transferDate.toISOString().slice(0, 10) }));
  }

  async transfer(dto: TransferInput, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const amount = round2(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) throw new BadRequestException('Choose a date.');
    if (dto.date > localDate(new Date())) throw new BadRequestException('The date cannot be in the future.');
    const from = dto.fromAccountId || null;
    const to = dto.toAccountId || null;
    if (from === to) throw new BadRequestException('Choose two different places to move the money between.');
    const found = await this.prisma.cashAccount.findMany({ where: { mamcosId, id: { in: [from, to].filter((x): x is string => !!x) }, isActive: true } });
    if (found.length !== [from, to].filter(Boolean).length) throw new BadRequestException('Choose your own active money accounts.');
    const date = bookingMoment(dto.date);
    await this.accounting.listAccounts();
    return this.prisma.$transaction(async (tx) => {
      const number = await this.accounting.nextNumber(tx, mamcosId, date, 'TRF', 'TRF');
      const row = await tx.cashTransfer.create({ data: { mamcosId, number, fromAccountId: from, toAccountId: to, amount, transferDate: new Date(`${dto.date}T00:00:00.000Z`), note: dto.note?.trim() || null, createdById: actorId ?? null } });
      const name = (id: string | null) => found.find((a) => a.id === id)?.name ?? 'Not assigned';
      await this.accounting.postToLedger('CashTransfer', row.id, date, `Transfer ${number}: ${name(from)} → ${name(to)}`,
        [{ code: '1000', debit: amount, cashAccountId: to }, { code: '1000', credit: amount, cashAccountId: from }], mamcosId, actorId, tx);
      return row;
    });
  }

  async cancelTransfer(id: string, reason: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const why = reason?.trim();
    if (!why || why.length < 5) throw new BadRequestException('Say why this is being cancelled (at least a few words).');
    const row = await this.prisma.cashTransfer.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Transfer not found.');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cashTransfer.updateMany({ where: { id, status: 'POSTED' }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actorId ?? null, cancelReason: why } });
      if (claimed.count !== 1) throw new ConflictException('This transfer is already cancelled.');
      await this.accounting.postToLedger('CashTransfer', row.id, new Date(), `Cancelled ${row.number}`, [], mamcosId, actorId, tx);
      return tx.cashTransfer.findUniqueOrThrow({ where: { id } });
    });
  }

  // ───────────────────────── the cash book ─────────────────────────

  /**
   * Money in and out of one account (or of one kind of account, or of all of them) with a running balance.
   * `account` is an account id, `unassigned` for money not yet in an account, or empty for everything.
   */
  async cashBook(scope: LedgerScope, q: { account?: string; kind?: CashAccountKind; from?: string; to?: string }) {
    const mamcosId = this.mamcos(scope);
    const cash = await this.prisma.account.findUnique({ where: { code: '1000' }, select: { id: true } });
    if (!cash) return { account: null, opening: 0, closing: 0, totalIn: 0, totalOut: 0, rows: [] };
    let accountFilter: Prisma.LedgerEntryWhereInput = {};
    let label = 'All money accounts';
    if (q.account === 'unassigned') { accountFilter = { cashAccountId: null }; label = 'Not assigned to an account'; }
    else if (q.account) {
      const a = await this.prisma.cashAccount.findFirst({ where: { id: q.account, mamcosId } });
      if (!a) throw new NotFoundException('Money account not found.');
      accountFilter = { cashAccountId: a.id }; label = a.name;
    } else if (q.kind) {
      accountFilter = { cashAccount: { kind: q.kind } };
      label = q.kind === 'MOBILE_MONEY' ? 'All mobile money wallets' : q.kind === 'BANK' ? 'All bank accounts' : 'Cash';
    }
    const base: Prisma.LedgerEntryWhereInput = { mamcosId, accountId: cash.id, ...accountFilter };
    const from = q.from ? new Date(`${q.from}T00:00:00+03:00`) : undefined;
    const to = q.to ? new Date(`${q.to}T23:59:59.999+03:00`) : undefined;
    const before = from ? await this.prisma.ledgerEntry.aggregate({ where: { ...base, entryDate: { lt: from } }, _sum: { debit: true, credit: true } }) : null;
    const opening = before ? round2((before._sum.debit ?? 0) - (before._sum.credit ?? 0)) : 0;
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { ...base, ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      include: { cashAccount: { select: { name: true } } }, orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }, { entryNumber: 'asc' }], take: 5000,
    });
    let running = opening;
    const rows = entries.map((e) => {
      running = round2(running + e.debit - e.credit);
      return { id: e.id, date: e.entryDate, number: e.entryNumber, description: e.description, account: e.cashAccount?.name ?? 'Not assigned', moneyIn: e.debit, moneyOut: e.credit, balance: running, sourceType: e.sourceType };
    });
    return { account: label, opening, closing: running, totalIn: round2(entries.reduce((n, e) => n + e.debit, 0)), totalOut: round2(entries.reduce((n, e) => n + e.credit, 0)), rows };
  }
}
