import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LedgerScope } from './accounting.service';
import { isMonthEnd, localDate } from './tax';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Closing the books: once a period is closed nothing can be posted on or before its last day, so figures that have been
 * reported stay put. Closing moves forward month by month; reopening needs a reason and is recorded forever.
 */
@Injectable()
export class PeriodLockService {
  constructor(private readonly prisma: PrismaService) {}

  private key(scope: LedgerScope) {
    return scope.mamcosId ?? null;
  }

  async status(scope: LedgerScope) {
    const mamcosId = this.key(scope);
    const scopeKey = mamcosId ?? 'platform';
    const [lock, events] = await Promise.all([
      this.prisma.accountingLock.findUnique({ where: { scopeKey } }),
      this.prisma.accountingLockEvent.findMany({ where: { scopeKey }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: events.map((e) => e.byUserId).filter((x): x is string => !!x) } },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const nameOf = (id: string | null) => {
      const u = users.find((x) => x.id === id);
      return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.phone : null;
    };
    return {
      closedThrough: lock ? lock.closedThrough.toISOString().slice(0, 10) : null,
      events: events.map((e) => ({
        id: e.id, action: e.action, fromDate: e.fromDate?.toISOString().slice(0, 10) ?? null,
        toDate: e.toDate?.toISOString().slice(0, 10) ?? null, reason: e.reason, by: nameOf(e.byUserId), createdAt: e.createdAt,
      })),
    };
  }

  private validateThrough(through: string) {
    if (!DAY.test(through)) throw new BadRequestException('Choose a date (YYYY-MM-DD).');
    if (!isMonthEnd(through)) throw new BadRequestException('Books are closed a whole month at a time: choose the last day of a month.');
  }

  /** What would be true if the books were closed through `through`: do they balance, and is anything still unfinished. */
  async check(scope: LedgerScope, through: string) {
    this.validateThrough(through);
    const mamcosId = this.key(scope);
    const end = new Date(`${through}T23:59:59.999+03:00`);
    const sums = await this.prisma.ledgerEntry.aggregate({
      where: { mamcosId, entryDate: { lte: end } },
      _sum: { debit: true, credit: true },
    });
    const difference = Math.round(((sums._sum.debit ?? 0) - (sums._sum.credit ?? 0)) * 100) / 100;
    const [draftStatements, draftPayrollRuns, unpaidBills] = mamcosId
      ? await Promise.all([
          this.prisma.bankStatement.count({ where: { mamcosId, status: 'DRAFT', periodEnd: { lte: end } } }),
          this.prisma.payrollRun.count({ where: { mamcosId, status: 'DRAFT', period: { lte: through.slice(0, 7) } } }),
          this.prisma.bill.count({ where: { mamcosId, status: 'OVERDUE', dueDate: { lte: end } } }),
        ])
      : [0, 0, 0];
    const warnings: string[] = [];
    if (draftStatements) warnings.push(`${draftStatements} bank statement${draftStatements > 1 ? 's' : ''} not yet reconciled`);
    if (draftPayrollRuns) warnings.push(`${draftPayrollRuns} payroll run${draftPayrollRuns > 1 ? 's' : ''} still in draft`);
    if (unpaidBills) warnings.push(`${unpaidBills} overdue supplier bill${unpaidBills > 1 ? 's' : ''}`);
    return { through, balanced: Math.abs(difference) < 0.005, difference, draftStatements, draftPayrollRuns, warnings };
  }

  async close(through: string, scope: LedgerScope, actorId?: string | null) {
    this.validateThrough(through);
    if (through >= localDate(new Date())) throw new BadRequestException('A month can be closed only after it has ended.');
    const mamcosId = this.key(scope);
    const scopeKey = mamcosId ?? 'platform';
    const check = await this.check(scope, through);
    if (!check.balanced) throw new BadRequestException(`The books do not balance (difference ${check.difference}); fix that before closing.`);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.accountingLock.findUnique({ where: { scopeKey } });
      const from = current ? current.closedThrough.toISOString().slice(0, 10) : null;
      if (from && through <= from) throw new ConflictException(`The books are already closed through ${from}.`);
      await tx.accountingLock.upsert({
        where: { scopeKey },
        create: { scopeKey, mamcosId, closedThrough: new Date(`${through}T00:00:00.000Z`), updatedById: actorId ?? null },
        update: { closedThrough: new Date(`${through}T00:00:00.000Z`), updatedById: actorId ?? null },
      });
      await tx.accountingLockEvent.create({
        data: { scopeKey, mamcosId, action: 'CLOSE', fromDate: from ? new Date(`${from}T00:00:00.000Z`) : null, toDate: new Date(`${through}T00:00:00.000Z`), byUserId: actorId ?? null },
      });
      return { closedThrough: through, warnings: check.warnings };
    });
  }

  /** Reopens the books back to `to` (an earlier month end), or entirely when `to` is empty. A reason is required. */
  async reopen(to: string | null | undefined, reason: string, scope: LedgerScope, actorId?: string | null) {
    const why = reason?.trim();
    if (!why || why.length < 10) throw new BadRequestException('Explain why the books are being reopened (at least 10 characters).');
    if (to) this.validateThrough(to);
    const mamcosId = this.key(scope);
    const scopeKey = mamcosId ?? 'platform';
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.accountingLock.findUnique({ where: { scopeKey } });
      if (!current) throw new BadRequestException('The books are not closed.');
      const from = current.closedThrough.toISOString().slice(0, 10);
      if (to && to >= from) throw new BadRequestException(`Choose a date before ${from}, or leave it empty to reopen everything.`);
      if (to) {
        await tx.accountingLock.update({ where: { scopeKey }, data: { closedThrough: new Date(`${to}T00:00:00.000Z`), updatedById: actorId ?? null } });
      } else {
        await tx.accountingLock.delete({ where: { scopeKey } });
      }
      await tx.accountingLockEvent.create({
        data: { scopeKey, mamcosId, action: 'REOPEN', fromDate: new Date(`${from}T00:00:00.000Z`), toDate: to ? new Date(`${to}T00:00:00.000Z`) : null, reason: why, byUserId: actorId ?? null },
      });
      return { closedThrough: to ?? null };
    });
  }
}
