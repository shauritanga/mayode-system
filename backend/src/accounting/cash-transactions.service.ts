import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { localDate, round2, bookingMoment } from './tax';
import { resolveCashAccount } from './cash-resolve';

export type CashKind = 'EXPENSE' | 'INCOME';
export type CashInput = {
  kind: CashKind;
  date: string;
  /** What actually moved, VAT included when `includesVat` is set. */
  amount: number;
  accountCode: string;
  party?: string;
  method?: 'CASH' | 'BANK' | 'MOBILE_MONEY';
  /** The money account it went through; wins over `method`. */
  cashAccountId?: string;
  reference?: string;
  note?: string;
  /** The amount already contains VAT (only for a VAT-registered cooperative). */
  includesVat?: boolean;
  attachments?: string[];
};

type Tx = Prisma.TransactionClient;
type Opts = { tx?: Tx; replacesId?: string };

/**
 * Accounts a person may pick. Anything the system posts itself (salaries, depreciation, loan and procurement flows, dues,
 * memberships …) is left out, so one thing is never booked twice.
 */
const CATEGORIES: Record<CashKind, string[]> = {
  EXPENSE: ['5000', '5410', '5600', '5610', '5620', '5630', '5640', '5690'],
  INCOME: ['4100', '4400', '4410', '4490'],
};

/** Everyday money out and money in, in plain terms. Each one books a journal against the cash and mobile-money account. */
@Injectable()
export class CashTransactionsService {
  constructor(private readonly prisma: PrismaService, private readonly accounting: AccountingService) {}


  private mamcos(scope: LedgerScope): string {
    if (!scope.mamcosId) throw new BadRequestException('Choose a cooperative first.');
    return scope.mamcosId;
  }

  async categories(kind: CashKind) {
    if (!CATEGORIES[kind]) throw new BadRequestException('Choose expense or income.');
    const accounts = await this.accounting.listAccounts();
    return CATEGORIES[kind].map((code) => accounts.find((a) => a.code === code)).filter((a) => !!a && a.isActive).map((a) => ({ code: a!.code, name: a!.name }));
  }

  async list(scope: LedgerScope, f: { kind?: CashKind; from?: string; to?: string; q?: string; limit?: number } = {}) {
    const mamcosId = this.mamcos(scope);
    const q = f.q?.trim();
    const rows = await this.prisma.cashTransaction.findMany({
      where: {
        mamcosId, ...(f.kind ? { kind: f.kind } : {}),
        ...(f.from || f.to ? { transactionDate: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00.000Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T00:00:00.000Z`) } : {}) } } : {}),
        ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { party: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { cashAccount: { select: { id: true, name: true } } },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(f.limit ?? 500, 1), 2000),
    });
    const accounts = await this.accounting.listAccounts();
    const items = rows.map((r) => ({
      id: r.id, kind: r.kind, number: r.number, date: r.transactionDate.toISOString().slice(0, 10), amount: Number(r.amount), vatAmount: Number(r.vatAmount),
      accountCode: r.accountCode, category: accounts.find((a) => a.code === r.accountCode)?.name ?? r.accountCode, party: r.party, method: r.method,
      reference: r.reference, note: r.note, status: r.status, voidReason: r.voidReason, account: r.cashAccount?.name ?? null,
      attachments: r.attachments ?? [], rejectedReason: r.rejectedReason, createdById: r.createdById, replacesId: r.replacesId,
    }));
    const live = items.filter((i) => i.status === 'POSTED');
    return { items, total: round2(live.reduce((n, i) => n + i.amount, 0)), count: live.length, pending: items.filter((i) => i.status === 'PENDING_APPROVAL').length };
  }

  /** Books the journal of a record: the cost or income against cash (and VAT when there is some). */
  private async book(tx: Tx, row: { id: string; kind: string; number: string; party: string | null; amount: Prisma.Decimal | number; vatAmount: Prisma.Decimal | number; accountCode: string; cashAccountId: string | null }, date: Date, mamcosId: string, actorId?: string | null) {
    const amount = Number(row.amount), vat = Number(row.vatAmount), net = round2(amount - vat), wallet = row.cashAccountId;
    const label = `${row.kind === 'EXPENSE' ? 'Expense' : 'Income'} ${row.number}${row.party ? `: ${row.party}` : ''}`;
    await this.accounting.postToLedger(row.kind === 'EXPENSE' ? 'Expense' : 'Income', row.id, date, label,
      row.kind === 'EXPENSE'
        ? [{ code: row.accountCode, debit: net }, ...(vat ? [{ code: '1400', debit: vat }] : []), { code: '1000', credit: amount, cashAccountId: wallet }]
        : [{ code: '1000', debit: amount, cashAccountId: wallet }, { code: row.accountCode, credit: net }, ...(vat ? [{ code: '2400', credit: vat }] : [])],
      mamcosId, actorId, tx);
  }

  async create(dto: CashInput, scope: LedgerScope, actorId?: string | null, opts: Opts = {}) {
    const mamcosId = this.mamcos(scope);
    if (!CATEGORIES[dto.kind]) throw new BadRequestException('Choose expense or income.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) throw new BadRequestException('Choose a date.');
    if (dto.date > localDate(new Date())) throw new BadRequestException('The date cannot be in the future.');
    const amount = round2(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero.');
    if (!CATEGORIES[dto.kind].includes(dto.accountCode)) throw new BadRequestException('Choose a category from the list.');
    const m = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { vatRegistered: true, vatRate: true, expenseApprovalThreshold: true } });
    if (!m) throw new NotFoundException('Cooperative not found');
    const rate = Number(m.vatRate);
    const vat = m.vatRegistered && dto.includesVat ? round2((amount * rate) / (100 + rate)) : 0;
    const date = bookingMoment(dto.date); // midday in Tanzania, or now when that is still ahead
    const prefix = dto.kind === 'EXPENSE' ? 'EXP' : 'INC';
    const account = (await this.accounting.listAccounts()).find((a) => a.code === dto.accountCode);
    if (!account || !account.isActive || account.type !== (dto.kind === 'EXPENSE' ? AccountType.EXPENSE : AccountType.INCOME)) {
      throw new BadRequestException('Choose a category from the list.');
    }
    const limit = m.expenseApprovalThreshold == null ? 0 : Number(m.expenseApprovalThreshold);
    const needsApproval = dto.kind === 'EXPENSE' && limit > 0 && amount >= limit;
    const run = async (tx: Tx) => {
      const number = await this.accounting.nextNumber(tx, mamcosId, date, prefix, prefix);
      const wallet = await resolveCashAccount(tx, mamcosId, { cashAccountId: dto.cashAccountId, method: dto.method });
      const walletKind = wallet ? (await tx.cashAccount.findUnique({ where: { id: wallet }, select: { kind: true } }))?.kind : undefined;
      const row = await tx.cashTransaction.create({
        data: {
          mamcosId, kind: dto.kind, number, transactionDate: new Date(`${dto.date}T00:00:00.000Z`), amount, vatAmount: vat, accountCode: dto.accountCode, cashAccountId: wallet,
          party: dto.party?.trim() || null, method: walletKind ?? dto.method ?? 'CASH', reference: dto.reference?.trim() || null, note: dto.note?.trim() || null, createdById: actorId ?? null,
          attachments: (dto.attachments ?? []).filter(Boolean).slice(0, 5), replacesId: opts.replacesId ?? null,
          status: needsApproval ? 'PENDING_APPROVAL' : 'POSTED',
        },
      });
      // A large expense is only booked once a second person approves it.
      if (!needsApproval) await this.book(tx, row, date, mamcosId, actorId);
      return row;
    };
    return opts.tx ? run(opts.tx) : this.prisma.$transaction(run);
  }

  /** Approves a large expense: a different person from the one who recorded it, and only then does it reach the books. */
  async approve(id: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const row = await this.prisma.cashTransaction.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Record not found');
    if (row.status !== 'PENDING_APPROVAL') throw new ConflictException('This record is not waiting for approval');
    if (actorId && row.createdById === actorId) throw new BadRequestException('Another person must approve this expense');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cashTransaction.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'POSTED', approvedById: actorId ?? null, approvedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('This record is not waiting for approval');
      await this.book(tx, row, bookingMoment(row.transactionDate.toISOString().slice(0, 10)), mamcosId, actorId);
      return tx.cashTransaction.findUniqueOrThrow({ where: { id } });
    });
  }

  async reject(id: string, reason: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const why = reason?.trim();
    if (!why || why.length < 5) throw new BadRequestException('Say why this is being cancelled (at least a few words).');
    const row = await this.prisma.cashTransaction.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Record not found');
    const claimed = await this.prisma.cashTransaction.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'REJECTED', rejectedReason: why, approvedById: actorId ?? null, approvedAt: new Date() } });
    if (claimed.count !== 1) throw new ConflictException('This record is not waiting for approval');
    return this.prisma.cashTransaction.findUniqueOrThrow({ where: { id } });
  }

  /** Cancels a record: its journal is offset by a mirror journal, the record itself stays visible as void. */
  async voidOne(id: string, reason: string, scope: LedgerScope, actorId?: string | null, opts: Opts = {}) {
    const mamcosId = this.mamcos(scope);
    const why = reason?.trim();
    if (!why || why.length < 5) throw new BadRequestException('Say why this is being cancelled (at least a few words).');
    const row = await this.prisma.cashTransaction.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Record not found');
    if (row.status === 'VOID' || row.status === 'REJECTED') throw new ConflictException('This record is already cancelled');
    const run = async (tx: Tx) => {
      const claimed = await tx.cashTransaction.updateMany({ where: { id, status: row.status }, data: { status: 'VOID', voidedAt: new Date(), voidedById: actorId ?? null, voidReason: why } });
      if (claimed.count !== 1) throw new ConflictException('This record is already cancelled');
      // a record still waiting for approval was never booked, so there is nothing to offset
      if (row.status === 'POSTED') await this.accounting.postToLedger(row.kind === 'EXPENSE' ? 'Expense' : 'Income', row.id, new Date(), `Cancelled ${row.number}`, [], mamcosId, actorId, tx);
      return tx.cashTransaction.findUniqueOrThrow({ where: { id } });
    };
    return opts.tx ? run(opts.tx) : this.prisma.$transaction(run);
  }

  /** Fixes the details that do not touch the books: who, reference, note and receipts. */
  async update(id: string, dto: { party?: string; reference?: string; note?: string; attachments?: string[] }, scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const row = await this.prisma.cashTransaction.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Record not found');
    if (row.status === 'VOID' || row.status === 'REJECTED') throw new ConflictException('A cancelled record cannot be changed');
    return this.prisma.cashTransaction.update({
      where: { id },
      data: {
        ...(dto.party !== undefined ? { party: dto.party.trim() || null } : {}),
        ...(dto.reference !== undefined ? { reference: dto.reference.trim() || null } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
        ...(dto.attachments !== undefined ? { attachments: dto.attachments.filter(Boolean).slice(0, 5) } : {}),
      },
    });
  }

  /** Changes the amount, date, category or account: the old record is cancelled and a new one booked in its place, together or not at all. */
  async correct(id: string, dto: CashInput & { reason: string }, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const row = await this.prisma.cashTransaction.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Record not found');
    if (row.kind !== dto.kind) throw new BadRequestException('A correction keeps the same kind: expense or income.');
    return this.prisma.$transaction(async (tx) => {
      await this.voidOne(id, `Corrected: ${dto.reason}`, scope, actorId, { tx });
      return this.create(dto, scope, actorId, { tx, replacesId: id });
    });
  }

  async settings(scope: LedgerScope) {
    const m = await this.prisma.mamcos.findUnique({ where: { id: this.mamcos(scope) }, select: { expenseApprovalThreshold: true } });
    return { approvalThreshold: m?.expenseApprovalThreshold == null ? null : Number(m.expenseApprovalThreshold) };
  }

  async saveSettings(scope: LedgerScope, dto: { approvalThreshold?: number | null }) {
    const v = dto.approvalThreshold;
    await this.prisma.mamcos.update({ where: { id: this.mamcos(scope) }, data: { expenseApprovalThreshold: v && v > 0 ? round2(v) : null } });
    return this.settings(scope);
  }
}
