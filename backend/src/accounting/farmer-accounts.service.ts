import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService, LedgerScope } from './accounting.service';
import { resolveCashAccount } from './cash-resolve';
import { bookingMoment, localDate, round2 } from './tax';

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));
const sellerKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export interface PayoutInput {
  farmerId?: string;
  /** For a seller who is not a registered farmer. */
  sellerName?: string;
  amount: number;
  paidOn: string;
  method?: string;
  cashAccountId?: string;
  reference?: string;
  note?: string;
}

/**
 * What the cooperative owes the farmers it buys paddy from, what it has paid them, and what they owe the cooperative (dues),
 * all per farmer. Paying a farmer clears the "farmer settlement payable" the purchase created.
 */
@Injectable()
export class FarmerAccountsService {
  constructor(private readonly prisma: PrismaService, private readonly accounting: AccountingService) {}

  private mamcos(scope: LedgerScope): string {
    if (!scope.mamcosId) throw new BadRequestException('Choose a cooperative.');
    return scope.mamcosId;
  }

  /** Paddy bought at a price, per payee. Deliveries priced at the collection centre are tracked where they were recorded, not here. */
  private async purchases(mamcosId: string) {
    const rows = await this.prisma.goodsReceipt.findMany({
      where: { mamcosId, status: 'CONFIRMED', pricePerKg: { gt: 0 }, valuedBySource: null },
      select: { id: true, reference: true, farmerId: true, sellerName: true, grossKg: true, rejectedKg: true, pricePerKg: true, receivedAt: true },
      orderBy: { receivedAt: 'asc' },
    });
    return rows
      .filter((r) => r.farmerId || r.sellerName?.trim())
      .map((r) => {
        const kg = round2(r.grossKg - r.rejectedKg);
        return { id: r.id, reference: r.reference, key: r.farmerId ? `f:${r.farmerId}` : `s:${sellerKey(r.sellerName!)}`, farmerId: r.farmerId, sellerName: r.sellerName?.trim() ?? null, kg, pricePerKg: r.pricePerKg!, value: round2(kg * r.pricePerKg!), date: r.receivedAt };
      });
  }

  private payeeKey(p: { farmerId: string | null; sellerName: string | null }) {
    return p.farmerId ? `f:${p.farmerId}` : `s:${sellerKey(p.sellerName!)}`;
  }

  private async debtsByFarmer(mamcosId: string, farmerIds: string[]) {
    const dues = await this.prisma.farmerDue.findMany({
      where: { mamcosId, status: 'ACTIVE', farmerId: { in: farmerIds } },
      select: { farmerId: true, amount: true, waivedAmount: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
    });
    const out = new Map<string, number>();
    for (const d of dues) {
      const balance = num(d.amount) - num(d.waivedAmount) - d.payments.reduce((n, p) => n + num(p.amount), 0);
      if (balance > 0) out.set(d.farmerId, round2((out.get(d.farmerId) ?? 0) + balance));
    }
    return out;
  }

  async owed(scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const [purchases, payouts] = await Promise.all([
      this.purchases(mamcosId),
      this.prisma.farmerPayout.findMany({ where: { mamcosId, voidedAt: null }, select: { farmerId: true, sellerName: true, amount: true, paidOn: true } }),
    ]);
    type Row = { key: string; farmerId: string | null; name: string; bought: number; paid: number; lastBought: Date | null };
    const rows = new Map<string, Row>();
    const row = (key: string, farmerId: string | null, name: string): Row => {
      const r = rows.get(key) ?? { key, farmerId, name, bought: 0, paid: 0, lastBought: null };
      rows.set(key, r);
      return r;
    };
    for (const p of purchases) { const r = row(p.key, p.farmerId, p.sellerName ?? ''); r.bought = round2(r.bought + p.value); r.lastBought = p.date; }
    for (const p of payouts) { const r = row(this.payeeKey(p), p.farmerId, p.sellerName ?? ''); r.paid = round2(r.paid + num(p.amount)); }
    const farmerIds = [...rows.values()].map((r) => r.farmerId).filter((x): x is string => !!x);
    const [farmers, debts] = await Promise.all([
      this.prisma.farmer.findMany({ where: { id: { in: farmerIds } }, select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } }),
      this.debtsByFarmer(mamcosId, farmerIds),
    ]);
    const items = [...rows.values()].map((r) => {
      const f = farmers.find((x) => x.id === r.farmerId);
      return {
        key: r.key, farmerId: r.farmerId, sellerName: r.farmerId ? null : r.name, name: f ? `${f.firstName} ${f.lastName}` : `${r.name} (not a registered farmer)`,
        memberNumber: f?.controlNumber ?? null, phone: f?.user?.phone ?? null, bought: r.bought, paid: r.paid, owed: round2(r.bought - r.paid),
        debts: r.farmerId ? debts.get(r.farmerId) ?? 0 : 0, lastBought: r.lastBought,
      };
    }).sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
    return { items, totalOwed: round2(items.reduce((n, i) => n + Math.max(i.owed, 0), 0)), totalPaid: round2(items.reduce((n, i) => n + i.paid, 0)), totalDebts: round2(items.reduce((n, i) => n + i.debts, 0)) };
  }

  /** Everything between the cooperative and one farmer: what was bought, what was paid, and what they owe in dues. */
  async statement(scope: LedgerScope, q: { farmerId?: string; seller?: string }) {
    const mamcosId = this.mamcos(scope);
    if (!q.farmerId && !q.seller?.trim()) throw new BadRequestException('Choose a farmer.');
    const key = q.farmerId ? `f:${q.farmerId}` : `s:${sellerKey(q.seller!)}`;
    const farmer = q.farmerId
      ? await this.prisma.farmer.findFirst({ where: { id: q.farmerId, mamcosId }, select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } })
      : null;
    if (q.farmerId && !farmer) throw new NotFoundException('Farmer not found.');
    const purchases = (await this.purchases(mamcosId)).filter((p) => p.key === key);
    const payouts = await this.prisma.farmerPayout.findMany({
      where: { mamcosId, ...(q.farmerId ? { farmerId: q.farmerId } : { sellerName: { equals: q.seller!.trim(), mode: 'insensitive' } }) },
      include: { cashAccount: { select: { name: true } } }, orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
    });
    const dues = farmer
      ? await this.prisma.farmerDue.findMany({ where: { mamcosId, farmerId: farmer.id, status: 'ACTIVE' }, include: { payments: { where: { voidedAt: null }, select: { amount: true } } }, orderBy: { issuedOn: 'asc' } })
      : [];
    const bought = round2(purchases.reduce((n, p) => n + p.value, 0));
    const paid = round2(payouts.filter((p) => !p.voidedAt).reduce((n, p) => n + num(p.amount), 0));
    const dueRows = dues.map((d) => {
      const paidSoFar = round2(d.payments.reduce((n, p) => n + num(p.amount), 0));
      return { id: d.id, description: d.description, issuedOn: d.issuedOn, dueDate: d.dueDate, amount: num(d.amount), waived: num(d.waivedAmount), paid: paidSoFar, balance: round2(num(d.amount) - num(d.waivedAmount) - paidSoFar) };
    });
    const debts = round2(dueRows.reduce((n, d) => n + Math.max(d.balance, 0), 0));
    const owed = round2(bought - paid);
    return {
      payee: { key, farmerId: farmer?.id ?? null, name: farmer ? `${farmer.firstName} ${farmer.lastName}` : `${q.seller!.trim()} (not a registered farmer)`, memberNumber: farmer?.controlNumber ?? null, phone: farmer?.user?.phone ?? null },
      bought, paid, owed, debts, net: round2(owed - debts),
      purchases: purchases.map((p) => ({ id: p.id, reference: p.reference, date: p.date, kg: p.kg, pricePerKg: p.pricePerKg, value: p.value })),
      payouts: payouts.map((p) => ({ id: p.id, number: p.number, date: p.paidOn, amount: num(p.amount), method: p.method, reference: p.reference, note: p.note, account: p.cashAccount?.name ?? null, voided: !!p.voidedAt, voidReason: p.voidReason })),
      dues: dueRows,
    };
  }

  async payouts(scope: LedgerScope) {
    const mamcosId = this.mamcos(scope);
    const rows = await this.prisma.farmerPayout.findMany({
      where: { mamcosId }, include: { farmer: { select: { firstName: true, lastName: true, controlNumber: true } }, cashAccount: { select: { name: true } } },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], take: 500,
    });
    return rows.map((r) => ({
      id: r.id, number: r.number, date: r.paidOn.toISOString().slice(0, 10), farmerId: r.farmerId, sellerName: r.sellerName,
      name: r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName}` : `${r.sellerName} (not a registered farmer)`, memberNumber: r.farmer?.controlNumber ?? null,
      amount: num(r.amount), method: r.method, reference: r.reference, note: r.note, account: r.cashAccount?.name ?? null, voided: !!r.voidedAt, voidReason: r.voidReason,
    }));
  }

  async pay(dto: PayoutInput, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    if (!!dto.farmerId === !!dto.sellerName?.trim()) throw new BadRequestException('Choose who is being paid.');
    const amount = round2(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.paidOn)) throw new BadRequestException('Choose a date.');
    if (dto.paidOn > localDate(new Date())) throw new BadRequestException('The date cannot be in the future.');
    const farmer = dto.farmerId ? await this.prisma.farmer.findFirst({ where: { id: dto.farmerId, mamcosId }, select: { id: true } }) : null;
    if (dto.farmerId && !farmer) throw new NotFoundException('Farmer not found.');
    const sellerName = dto.sellerName?.trim().replace(/\s+/g, ' ') ?? null;
    const key = dto.farmerId ? `f:${dto.farmerId}` : `s:${sellerKey(sellerName!)}`;
    const date = bookingMoment(dto.paidOn);
    await this.accounting.listAccounts();
    return this.prisma.$transaction(async (tx) => {
      // One payout per person at a time, so two cashiers cannot both pay out the same balance.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${mamcosId}:${key}`}))`;
      const bought = (await this.purchases(mamcosId)).filter((p) => p.key === key).reduce((n, p) => n + p.value, 0);
      const paid = await tx.farmerPayout.aggregate({ where: { mamcosId, voidedAt: null, ...(dto.farmerId ? { farmerId: dto.farmerId } : { sellerName: { equals: sellerName!, mode: 'insensitive' } }) }, _sum: { amount: true } });
      const owed = round2(bought - num(paid._sum.amount));
      if (owed <= 0) throw new ConflictException('Nothing is owed to this person.');
      if (amount > owed + 0.005) throw new ConflictException(`Only ${owed.toLocaleString('en-US')} is owed to this person.`);
      const wallet = await resolveCashAccount(tx, mamcosId, { cashAccountId: dto.cashAccountId, method: dto.method ?? 'CASH' });
      const number = await this.accounting.nextNumber(tx, mamcosId, date, 'PAY', 'PAY');
      const row = await tx.farmerPayout.create({
        data: {
          mamcosId, number, farmerId: dto.farmerId ?? null, sellerName: dto.farmerId ? null : sellerName, amount, paidOn: new Date(`${dto.paidOn}T00:00:00.000Z`),
          method: dto.method ?? 'CASH', reference: dto.reference?.trim() || null, note: dto.note?.trim() || null, cashAccountId: wallet, createdById: actorId ?? null,
        },
      });
      await this.accounting.postToLedger('PaddyPayout', row.id, date, `Paid for paddy ${number}`, [{ code: '2200', debit: amount }, { code: '1000', credit: amount, cashAccountId: wallet }], mamcosId, actorId, tx);
      return row;
    });
  }

  async void(id: string, reason: string, scope: LedgerScope, actorId?: string | null) {
    const mamcosId = this.mamcos(scope);
    const why = reason?.trim();
    if (!why || why.length < 5) throw new BadRequestException('Say why this is being cancelled (at least a few words).');
    const row = await this.prisma.farmerPayout.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Payout not found.');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.farmerPayout.updateMany({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidedById: actorId ?? null, voidReason: why } });
      if (claimed.count !== 1) throw new ConflictException('This payout is already cancelled.');
      await this.accounting.postToLedger('PaddyPayout', row.id, new Date(), `Cancelled ${row.number}`, [], mamcosId, actorId, tx);
      return tx.farmerPayout.findUniqueOrThrow({ where: { id } });
    });
  }
}
