import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { hasGrant } from '../auth/role-access';
import { CloseDrawerDto, ReceiveDrawerDto } from './dto/staff-tasks.dto';
import { cents, day, num, tenantOf, today } from './common';

/**
 * The Cashier's end of day: what they collected (taken from the receipts they issued, not typed in), the cash they counted, and the
 * difference. The Accountant receives the summary and signs for any difference.
 */
@Injectable()
export class CashDrawerService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  /** What this person collected on a day, by how it was paid. Harvest-deduction entries are not money received. */
  private async tally(mamcosId: string, userId: string, date: Date) {
    const rows = await this.prisma.duePayment.findMany({ where: { mamcosId, recordedById: userId, paidOn: date, voidedAt: null }, select: { amount: true, method: true } });
    const by = { CASH: 0, MOBILE_MONEY: 0, BANK: 0 } as Record<string, number>;
    let count = 0;
    for (const r of rows) { if (r.method in by) { by[r.method] = cents(by[r.method] + num(r.amount)); count++; } }
    return { cash: by.CASH, mobile: by.MOBILE_MONEY, bank: by.BANK, payments: count, total: cents(by.CASH + by.MOBILE_MONEY + by.BANK) };
  }

  /** Today's tally for the signed-in cashier, whether it has been closed, and past days with collections that were never closed. */
  async mine(actor: RequestUser, dayParam?: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const date = dayParam ? day(dayParam) : today();
    if (date > today()) throw new BadRequestException('Choose a day that has happened');
    const [tally, closed, recent] = await Promise.all([
      this.tally(mamcosId, actor.id, date),
      this.prisma.cashDrawerClose.findUnique({ where: { mamcosId_day_cashierId: { mamcosId, day: date, cashierId: actor.id } } }),
      this.prisma.duePayment.findMany({ where: { mamcosId, recordedById: actor.id, voidedAt: null, paidOn: { gte: new Date(date.getTime() - 14 * 86_400_000), lt: date } }, select: { paidOn: true }, distinct: ['paidOn'] }),
    ]);
    const closedDays = new Set((await this.prisma.cashDrawerClose.findMany({ where: { mamcosId, cashierId: actor.id, day: { gte: new Date(date.getTime() - 14 * 86_400_000), lt: date } }, select: { day: true } })).map((c) => c.day.toISOString().slice(0, 10)));
    return { day: date.toISOString().slice(0, 10), ...tally, closed: closed ? this.shape(closed) : null, unclosedDays: recent.map((r) => r.paidOn.toISOString().slice(0, 10)).filter((d) => !closedDays.has(d)).sort() };
  }

  private shape(c: Awaited<ReturnType<CashDrawerService['load']>>) {
    return {
      id: c.id, day: c.day.toISOString().slice(0, 10), cashierId: c.cashierId, payments: c.paymentsCount, expectedCash: num(c.expectedCash), expectedMobile: num(c.expectedMobile), expectedBank: num(c.expectedBank),
      countedCash: num(c.countedCash), variance: num(c.variance), note: c.note, status: c.status, submittedAt: c.submittedAt, receivedAt: c.receivedAt, receivedById: c.receivedById, receiveNote: c.receiveNote,
    };
  }
  private async load(mamcosId: string, id: string) {
    const c = await this.prisma.cashDrawerClose.findFirst({ where: { id, mamcosId } });
    if (!c) throw new NotFoundException('Cash summary not found');
    return c;
  }

  /** Closes the day: the expected amounts are fixed from the receipts at this moment. A difference needs an explanation. Once per day. */
  async close(actor: RequestUser, dto: CloseDrawerDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const date = dto.day ? day(dto.day) : today();
    if (date > today()) throw new BadRequestException('You cannot close a day that has not happened');
    const t = await this.tally(mamcosId, actor.id, date);
    if (!t.payments && dto.countedCash === 0) throw new BadRequestException('Nothing was collected on this day, so there is nothing to close');
    const variance = cents(dto.countedCash - t.cash);
    if (variance !== 0 && (dto.note?.trim().length ?? 0) < 5) {
      const n = Math.abs(variance).toLocaleString('en-US');
      throw new BadRequestException(variance < 0 ? `The drawer is short by TZS ${n}: explain the difference` : `The drawer is over by TZS ${n}: explain the difference`);
    }
    try {
      const row = await this.prisma.cashDrawerClose.create({
        data: { mamcosId, day: date, cashierId: actor.id, paymentsCount: t.payments, expectedCash: t.cash, expectedMobile: t.mobile, expectedBank: t.bank, countedCash: dto.countedCash, variance, note: dto.note?.trim() || null },
      });
      return this.shape(row);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('You have already closed this day');
      throw e;
    }
  }

  /** The Accountant sees every cashier's summary; a cashier sees their own. */
  async list(actor: RequestUser, q: { status?: string; day?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const all = hasGrant(actor, 'cash_drawer', 'EDIT');
    const rows = await this.prisma.cashDrawerClose.findMany({
      where: { mamcosId, ...(all ? {} : { cashierId: actor.id }), ...(q.status && q.status !== 'ALL' ? { status: q.status } : {}), ...(q.day ? { day: day(q.day) } : {}) }, orderBy: [{ day: 'desc' }, { submittedAt: 'desc' }], take: 100,
    });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.cashierId) } }, select: { id: true, firstName: true, lastName: true, phone: true } });
    const name = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone]));
    return { data: rows.map((r) => ({ ...this.shape(r), cashier: name.get(r.cashierId) ?? null })), seeAll: all };
  }

  /** The Accountant takes the summary. Not their own, and a difference must be explained. */
  async receive(actor: RequestUser, id: string, dto: ReceiveDrawerDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const c = await this.load(mamcosId, id);
    if (c.status !== 'SUBMITTED') throw new ConflictException('This summary has already been received');
    if (c.cashierId === actor.id) throw new ForbiddenException('You cannot receive your own cash summary');
    if (num(c.variance) !== 0 && (dto.note?.trim().length ?? 0) < 5) throw new BadRequestException('This summary has a difference: write what you decided about it');
    const claimed = await this.prisma.cashDrawerClose.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'RECEIVED', receivedById: actor.id, receivedAt: new Date(), receiveNote: dto.note?.trim() || null } });
    if (!claimed.count) throw new ConflictException('This summary has already been received');
    return this.shape(await this.load(mamcosId, id));
  }
}
