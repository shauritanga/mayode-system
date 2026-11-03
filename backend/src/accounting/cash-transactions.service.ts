import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { localDate, round2 } from './tax';

export type CashKind = 'EXPENSE' | 'INCOME';
export type CashInput = {
  kind: CashKind;
  date: string;
  /** What actually moved, VAT included when `includesVat` is set. */
  amount: number;
  accountCode: string;
  party?: string;
  method?: 'CASH' | 'BANK' | 'MOBILE_MONEY';
  reference?: string;
  note?: string;
  /** The amount already contains VAT (only for a VAT-registered cooperative). */
  includesVat?: boolean;
};

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
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(f.limit ?? 500, 1), 2000),
    });
    const accounts = await this.accounting.listAccounts();
    const items = rows.map((r) => ({
      id: r.id, kind: r.kind, number: r.number, date: r.transactionDate.toISOString().slice(0, 10), amount: Number(r.amount), vatAmount: Number(r.vatAmount),
      accountCode: r.accountCode, category: accounts.find((a) => a.code === r.accountCode)?.name ?? r.accountCode, party: r.party, method: r.method,
      reference: r.reference, note: r.note, status: r.status, voidReason: r.voidReason,
    }));
    const live = items.filter((i) => i.status === 'POSTED');
    return { items, total: round2(live.reduce((n, i) => n + i.amount, 0)), count: live.length };
  }

  async create(dto: CashInput, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    if (!CATEGORIES[dto.kind]) throw new BadRequestException('Choose expense or income.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) throw new BadRequestException('Choose a date.');
    if (dto.date > localDate(new Date())) throw new BadRequestException('The date cannot be in the future.');
    const amount = round2(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero.');
    if (!CATEGORIES[dto.kind].includes(dto.accountCode)) throw new BadRequestException('Choose a category from the list.');
    const m = await this.prisma.mamcos.findUnique({ where: { id: mamcosId }, select: { vatRegistered: true, vatRate: true } });
    if (!m) throw new NotFoundException('Cooperative not found');
    const rate = Number(m.vatRate);
    const vat = m.vatRegistered && dto.includesVat ? round2((amount * rate) / (100 + rate)) : 0;
    const net = round2(amount - vat);
    const date = new Date(`${dto.date}T09:00:00.000Z`); // midday in Tanzania, so the day is unambiguous
    const prefix = dto.kind === 'EXPENSE' ? 'EXP' : 'INC';
    const account = (await this.accounting.listAccounts()).find((a) => a.code === dto.accountCode);
    if (!account || !account.isActive || account.type !== (dto.kind === 'EXPENSE' ? AccountType.EXPENSE : AccountType.INCOME)) {
      throw new BadRequestException('Choose a category from the list.');
    }
    return this.prisma.$transaction(async (tx) => {
      const number = await this.accounting.nextNumber(tx, mamcosId, date, prefix, prefix);
      const row = await tx.cashTransaction.create({
        data: {
          mamcosId, kind: dto.kind, number, transactionDate: new Date(`${dto.date}T00:00:00.000Z`), amount, vatAmount: vat, accountCode: dto.accountCode,
          party: dto.party?.trim() || null, method: dto.method ?? 'CASH', reference: dto.reference?.trim() || null, note: dto.note?.trim() || null, createdById: actorId ?? null,
        },
      });
      const label = `${dto.kind === 'EXPENSE' ? 'Expense' : 'Income'} ${number}${dto.party?.trim() ? `: ${dto.party.trim()}` : ''}`;
      await this.accounting.postToLedger(dto.kind === 'EXPENSE' ? 'Expense' : 'Income', row.id, date, label,
        dto.kind === 'EXPENSE'
          ? [{ code: dto.accountCode, debit: net }, ...(vat ? [{ code: '1400', debit: vat }] : []), { code: '1000', credit: amount }]
          : [{ code: '1000', debit: amount }, { code: dto.accountCode, credit: net }, ...(vat ? [{ code: '2400', credit: vat }] : [])],
        mamcosId, actorId, tx);
      return row;
    });
  }

  /** Cancels a record: its journal is offset by a mirror journal, the record itself stays visible as void. */
  async voidOne(id: string, reason: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const why = reason?.trim();
    if (!why || why.length < 5) throw new BadRequestException('Say why this is being cancelled (at least a few words).');
    const row = await this.prisma.cashTransaction.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Record not found');
    if (row.status === 'VOID') throw new ConflictException('This record is already cancelled');
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.cashTransaction.updateMany({ where: { id, status: 'POSTED' }, data: { status: 'VOID', voidedAt: new Date(), voidedById: actorId ?? null, voidReason: why } });
      if (claimed.count !== 1) throw new ConflictException('This record is already cancelled');
      await this.accounting.postToLedger(row.kind === 'EXPENSE' ? 'Expense' : 'Income', row.id, new Date(), `Cancelled ${row.number}`, [], mamcosId, actorId, tx);
      return tx.cashTransaction.findUniqueOrThrow({ where: { id } });
    });
  }
}
