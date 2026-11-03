import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { localDate, round2 } from './tax';

const CASH = '1000';
const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
const cents = (n: number | string | Prisma.Decimal) => Math.round(Number(n) * 100);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type StatementInput = {
  accountLabel: string;
  kind?: 'BANK' | 'MOBILE_MONEY' | 'CASH';
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  lines: { date: string; description: string; reference?: string; amount: number }[];
};

/**
 * Checks the cash book (ledger account 1000) against what the bank or mobile-money provider says. Each statement line is
 * matched to the ledger entry that recorded the same money; what has no match is a mistake, a missing entry (bank charges,
 * interest) or an item still in transit — and a statement can be reconciled only when every line is accounted for.
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService, private readonly accounting: AccountingService) {}

  private mamcos(scope: LedgerScope): string {
    if (!scope.mamcosId) throw new BadRequestException('Choose a cooperative first.');
    return scope.mamcosId;
  }
  private async statementOf(id: string, mamcosId: string) {
    const st = await this.prisma.bankStatement.findFirst({ where: { id, mamcosId }, include: { lines: { orderBy: [{ lineDate: 'asc' }, { amount: 'asc' }] } } });
    if (!st) throw new NotFoundException('Statement not found');
    return st;
  }
  private assertDraft(st: { status: string }) {
    if (st.status === 'RECONCILED') throw new ConflictException('This statement is reconciled. Reopen it to make changes.');
  }
  /** Cash-book entries (signed: money in positive) in a window, with whether a statement line already claims them. */
  private async cashEntries(mamcosId: string, from: Date, to: Date, onlyUnmatched: boolean) {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { mamcosId, account: { code: CASH }, entryDate: { gte: from, lte: to }, ...(onlyUnmatched ? { bankLine: null } : {}) },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, entryNumber: true, entryDate: true, description: true, debit: true, credit: true, sourceType: true },
    });
    return rows.map((r) => ({ id: r.id, entryNumber: r.entryNumber, date: ymd(new Date(r.entryDate.getTime() + 3 * 3_600_000)), description: r.description, sourceType: r.sourceType, amount: round2(r.debit - r.credit) }));
  }

  async list(scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const rows = await this.prisma.bankStatement.findMany({ where: { mamcosId }, orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }], include: { lines: { select: { amount: true, ledgerEntryId: true } } } });
    return rows.map((s) => {
      const sum = s.lines.reduce((n, l) => n + cents(l.amount), 0);
      return {
        id: s.id, accountLabel: s.accountLabel, kind: s.kind, periodStart: ymd(s.periodStart), periodEnd: ymd(s.periodEnd),
        openingBalance: Number(s.openingBalance), closingBalance: Number(s.closingBalance), status: s.status, reconciledAt: s.reconciledAt,
        lineCount: s.lines.length, unmatched: s.lines.filter((l) => !l.ledgerEntryId).length,
        arithmeticDifference: (cents(s.closingBalance) - cents(s.openingBalance) - sum) / 100,
      };
    });
  }

  async create(dto: StatementInput, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    if (!dto.accountLabel?.trim()) throw new BadRequestException('Name the account this statement is for.');
    if (dto.periodEnd < dto.periodStart) throw new BadRequestException('The statement ends before it starts.');
    if (!dto.lines?.length) throw new BadRequestException('Add at least one statement line.');
    for (const l of dto.lines) {
      if (!l.amount || !Number.isFinite(l.amount)) throw new BadRequestException('Every statement line needs a non-zero amount (money out is negative).');
      if (l.date < dto.periodStart || l.date > dto.periodEnd) throw new BadRequestException(`Line "${l.description}" is dated outside the statement period.`);
    }
    const created = await this.prisma.bankStatement.create({
      data: {
        mamcosId, accountLabel: dto.accountLabel.trim(), kind: dto.kind ?? 'BANK',
        periodStart: new Date(`${dto.periodStart}T00:00:00.000Z`), periodEnd: new Date(`${dto.periodEnd}T00:00:00.000Z`),
        openingBalance: dto.openingBalance, closingBalance: dto.closingBalance, createdById: actorId ?? null,
        lines: { create: dto.lines.map((l) => ({ lineDate: new Date(`${l.date}T00:00:00.000Z`), description: l.description.trim() || 'Statement line', reference: l.reference?.trim() || null, amount: l.amount })) },
      },
    });
    await this.autoMatch(created.id, scope, actorId);
    return this.detail(created.id, scope);
  }

  async detail(id: string, scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const st = await this.statementOf(id, mamcosId);
    const from = new Date(st.periodStart.getTime() - WINDOW_DAYS * DAY_MS);
    const to = new Date(st.periodEnd.getTime() + (WINDOW_DAYS + 1) * DAY_MS);
    const [candidates, entries] = await Promise.all([
      this.cashEntries(mamcosId, from, to, true),
      this.prisma.ledgerEntry.findMany({ where: { id: { in: st.lines.map((l) => l.ledgerEntryId).filter((x): x is string => !!x) } }, select: { id: true, entryNumber: true, entryDate: true, description: true } }),
    ]);
    const sum = st.lines.reduce((n, l) => n + cents(l.amount), 0);
    return {
      id: st.id, accountLabel: st.accountLabel, kind: st.kind, status: st.status, reconciledAt: st.reconciledAt,
      periodStart: ymd(st.periodStart), periodEnd: ymd(st.periodEnd),
      openingBalance: Number(st.openingBalance), closingBalance: Number(st.closingBalance),
      linesTotal: sum / 100,
      arithmeticDifference: (cents(st.closingBalance) - cents(st.openingBalance) - sum) / 100,
      unmatchedLines: st.lines.filter((l) => !l.ledgerEntryId).length,
      lines: st.lines.map((l) => {
        const e = entries.find((x) => x.id === l.ledgerEntryId);
        return { id: l.id, date: ymd(l.lineDate), description: l.description, reference: l.reference, amount: Number(l.amount), ledgerEntryId: l.ledgerEntryId, matched: e ? { entryNumber: e.entryNumber, description: e.description } : null };
      }),
      unmatchedLedger: candidates,
    };
  }

  /** Pairs lines with cash-book entries of exactly the same amount within a week of each other, closest dates first. */
  async autoMatch(id: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const st = await this.statementOf(id, mamcosId);
    this.assertDraft(st);
    const from = new Date(st.periodStart.getTime() - WINDOW_DAYS * DAY_MS);
    const to = new Date(st.periodEnd.getTime() + (WINDOW_DAYS + 1) * DAY_MS);
    const pool = (await this.cashEntries(mamcosId, from, to, true)).map((e) => ({ ...e, cents: cents(e.amount), t: new Date(`${e.date}T00:00:00.000Z`).getTime(), taken: false }));
    const pairs: { lineId: string; entryId: string }[] = [];
    for (const line of st.lines.filter((l) => !l.ledgerEntryId)) {
      const t = line.lineDate.getTime();
      let best: (typeof pool)[number] | null = null;
      for (const e of pool) {
        if (e.taken || e.cents !== cents(line.amount)) continue;
        const gap = Math.abs(e.t - t);
        if (gap <= WINDOW_DAYS * DAY_MS && (!best || gap < Math.abs(best.t - t))) best = e;
      }
      if (best) { best.taken = true; pairs.push({ lineId: line.id, entryId: best.id }); }
    }
    await this.prisma.$transaction(pairs.map((p) => this.prisma.bankStatementLine.update({ where: { id: p.lineId }, data: { ledgerEntryId: p.entryId, matchedAt: new Date(), matchedById: actorId ?? null } })));
    return { matched: pairs.length, remaining: st.lines.filter((l) => !l.ledgerEntryId).length - pairs.length };
  }

  async match(lineId: string, ledgerEntryId: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, statement: { mamcosId } }, include: { statement: true } });
    if (!line) throw new NotFoundException('Statement line not found');
    this.assertDraft(line.statement);
    const entry = await this.prisma.ledgerEntry.findFirst({ where: { id: ledgerEntryId, mamcosId, account: { code: CASH } }, include: { bankLine: true } });
    if (!entry) throw new NotFoundException('That is not a cash-book entry of this cooperative.');
    if (entry.bankLine) throw new ConflictException('That cash-book entry is already matched to another statement line.');
    if (cents(entry.debit - entry.credit) !== cents(line.amount)) throw new BadRequestException('The amounts differ, so these cannot be the same transaction.');
    await this.prisma.bankStatementLine.update({ where: { id: lineId }, data: { ledgerEntryId, matchedAt: new Date(), matchedById: actorId ?? null } });
    return this.detail(line.statementId, scope);
  }

  async unmatch(lineId: string, scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, statement: { mamcosId } }, include: { statement: true } });
    if (!line) throw new NotFoundException('Statement line not found');
    this.assertDraft(line.statement);
    await this.prisma.bankStatementLine.update({ where: { id: lineId }, data: { ledgerEntryId: null, matchedAt: null, matchedById: null } });
    return this.detail(line.statementId, scope);
  }

  /** A line the books never recorded (bank charge, interest, deposit): journal it against `accountId` and match it. */
  async adjust(lineId: string, dto: { accountId: string; description?: string }, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, statement: { mamcosId } }, include: { statement: true } });
    if (!line) throw new NotFoundException('Statement line not found');
    this.assertDraft(line.statement);
    if (line.ledgerEntryId) throw new ConflictException('This line is already matched.');
    const cash = await this.prisma.account.findUnique({ where: { code: CASH } });
    if (!cash || dto.accountId === cash.id) throw new BadRequestException('Choose the account the other side of this transaction belongs to.');
    const amount = Math.abs(Number(line.amount));
    const moneyIn = Number(line.amount) > 0;
    const text = dto.description?.trim() || line.description;
    const journal = await this.accounting.createJournalEntry({
      entryDate: ymd(line.lineDate), description: text,
      lines: moneyIn
        ? [{ accountId: cash.id, debit: amount }, { accountId: dto.accountId, credit: amount }]
        : [{ accountId: dto.accountId, debit: amount }, { accountId: cash.id, credit: amount }],
    }, { mamcosId }, actorId);
    const cashRow = await this.prisma.ledgerEntry.findFirst({ where: { journalId: journal!.id, accountId: cash.id } });
    await this.prisma.bankStatementLine.update({ where: { id: lineId }, data: { ledgerEntryId: cashRow!.id, matchedAt: new Date(), matchedById: actorId ?? null } });
    return this.detail(line.statementId, scope);
  }

  async reconcile(id: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const st = await this.statementOf(id, mamcosId);
    this.assertDraft(st);
    const diff = (cents(st.closingBalance) - cents(st.openingBalance) - st.lines.reduce((n, l) => n + cents(l.amount), 0)) / 100;
    if (diff !== 0) throw new BadRequestException(`The statement lines do not add up to its balances (difference ${diff}). Check the opening balance, closing balance and lines.`);
    const open = st.lines.filter((l) => !l.ledgerEntryId).length;
    if (open) throw new BadRequestException(`Some statement lines are not matched to the books yet (${open} left).`);
    await this.prisma.bankStatement.update({ where: { id }, data: { status: 'RECONCILED', reconciledAt: new Date(), reconciledById: actorId ?? null } });
    return this.detail(id, scope);
  }
  async reopen(id: string, scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const st = await this.statementOf(id, mamcosId);
    if (st.status !== 'RECONCILED') throw new BadRequestException('This statement is not reconciled.');
    await this.prisma.bankStatement.update({ where: { id }, data: { status: 'DRAFT', reconciledAt: null, reconciledById: null } });
    return this.detail(id, scope);
  }
  async remove(id: string, scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const st = await this.statementOf(id, mamcosId);
    this.assertDraft(st);
    await this.prisma.bankStatement.delete({ where: { id } });
    return { deleted: true };
  }

  /** The cash book against the statements as of a date: what the books say, what the banks say, and what explains the gap. */
  async summary(scope: LedgerScope, asOf?: string) {
    const mamcosId = this.mamcos(scope);
    const day = asOf ?? localDate(new Date());
    const end = new Date(`${day}T23:59:59.999+03:00`);
    const sums = await this.prisma.ledgerEntry.aggregate({ where: { mamcosId, account: { code: CASH }, entryDate: { lte: end } }, _sum: { debit: true, credit: true } });
    const ledgerBalance = round2((sums._sum.debit ?? 0) - (sums._sum.credit ?? 0));
    const statements = await this.prisma.bankStatement.findMany({ where: { mamcosId, periodEnd: { lte: new Date(`${day}T00:00:00.000Z`) } }, include: { lines: { select: { amount: true, ledgerEntryId: true } } }, orderBy: { periodEnd: 'asc' } });
    const latest = new Map<string, (typeof statements)[number]>();
    for (const s of statements) latest.set(s.accountLabel, s);
    const statementsTotal = round2([...latest.values()].reduce((n, s) => n + Number(s.closingBalance), 0));
    const since = statements.length ? new Date(Math.min(...statements.map((s) => s.periodStart.getTime()))) : null;
    const unmatchedLedger = since ? await this.cashEntries(mamcosId, since, end, true) : [];
    const unmatchedLedgerNet = round2(unmatchedLedger.reduce((n, e) => n + e.amount, 0));
    const unmatchedLinesNet = round2(statements.flatMap((s) => s.lines).filter((l) => !l.ledgerEntryId).reduce((n, l) => n + Number(l.amount), 0));
    const difference = round2(ledgerBalance - unmatchedLedgerNet + unmatchedLinesNet - statementsTotal);
    return {
      asOf: day, ledgerBalance, statementsTotal, unmatchedLedgerNet, unmatchedLinesNet, difference,
      reconciled: statements.length > 0 && Math.abs(difference) < 0.005,
      hasStatements: statements.length > 0,
      accounts: [...latest.values()].map((s) => ({ label: s.accountLabel, kind: s.kind, periodEnd: ymd(s.periodEnd), closingBalance: Number(s.closingBalance), status: s.status })),
      unmatchedLedger: unmatchedLedger.slice(0, 200),
    };
  }
}
