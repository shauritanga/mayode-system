import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ProductCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { Actor, assertVisible, batchBalances, lockBatches, scope, Tx } from './ops-common';

/** Which inventory account holds each kind of stock. Broken rice sits with rice. */
export const INVENTORY_ACCOUNT: Record<ProductCategory, '1200' | '1210' | '1220'> = {
  PADDY: '1200',
  PROCESSED: '1210',
  BROKEN: '1210',
  BYPRODUCT: '1220',
};
export const INVENTORY_ACCOUNT_NAMES: Record<string, string> = { '1200': 'Paddy', '1210': 'Rice', '1220': 'By-products' };

const money = (n: number) => Math.round(n * 100) / 100;

type BatchLite = { id: string; ownerType: string; unitCost: number | null; mamcosId: string | null; product: { category: ProductCategory } };

/** True when the books carry this batch: the cooperative owns it and a cost per kg is known. */
export const isValued = (b: { ownerType: string; unitCost: number | null }) => b.ownerType === 'COOPERATIVE' && b.unitCost != null && b.unitCost > 0;

/**
 * Turns warehouse events into ledger journals, inside the same transaction as the stock change, so stock and books cannot drift apart.
 * Only stock the cooperative owns and has a cost for is booked; stock held for farmers or customers never touches the accounts.
 */
@Injectable()
export class StockAccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  /** Paddy bought from a farmer: Dr paddy inventory / Cr farmer settlement payable. */
  async postReceipt(tx: Tx, r: { id: string; reference: string; mamcosId: string | null; receivedAt: Date }, acceptedKg: number, pricePerKg: number, actorId: string) {
    const value = money(acceptedKg * pricePerKg);
    if (value <= 0) return;
    await this.accounting.postToLedger(
      'StockReceipt', r.id, r.receivedAt, `Paddy bought · ${r.reference}`,
      [{ code: '1200', debit: value }, { code: '2200', credit: value }], r.mamcosId, actorId, tx,
    );
  }

  /**
   * A processing run moves the cost of the paddy that went in onto the rice and by-products that came out.
   * Cost is shared by selling value when every output has a price, otherwise by weight; whatever was lost raises the cost per kg of what is left.
   */
  async postRun(
    tx: Tx,
    run: { id: string; reference: string; mamcosId: string | null; processedAt: Date },
    inputs: { batch: BatchLite; quantityKg: number }[],
    outputs: { batchId: string; category: ProductCategory; quantityKg: number; unitPrice: number | null }[],
    actorId: string,
  ) {
    if (!inputs.length || inputs.some((i) => i.batch.ownerType !== 'COOPERATIVE')) return;
    const valueIn = new Map<string, number>();
    let total = 0;
    for (const i of inputs) {
      const v = money(i.quantityKg * (i.batch.unitCost ?? 0));
      if (v <= 0) continue;
      const code = INVENTORY_ACCOUNT[i.batch.product.category];
      valueIn.set(code, money((valueIn.get(code) ?? 0) + v));
      total = money(total + v);
    }
    if (total <= 0 || !outputs.length) return;
    // By-products (bran, husk) only carry cost when they have a selling price; otherwise the rice carries the whole cost.
    const carrying = outputs.filter((o) => o.category !== 'BYPRODUCT' || (o.unitPrice ?? 0) > 0);
    const pool = carrying.length ? carrying : outputs;
    const priced = pool.every((o) => (o.unitPrice ?? 0) > 0);
    const weights = pool.map((o) => o.quantityKg * (priced ? o.unitPrice! : 1));
    const weightSum = weights.reduce((t, w) => t + w, 0);
    let left = total;
    const valueOut = new Map<string, number>();
    for (let n = 0; n < pool.length; n++) {
      const o = pool[n];
      const share = n === pool.length - 1 ? left : money((total * weights[n]) / weightSum);
      left = money(left - share);
      await tx.stockBatch.update({ where: { id: o.batchId }, data: { unitCost: o.quantityKg > 0 ? share / o.quantityKg : null } });
      const code = INVENTORY_ACCOUNT[o.category];
      valueOut.set(code, money((valueOut.get(code) ?? 0) + share));
    }
    await this.accounting.postToLedger(
      'StockRun', run.id, run.processedAt, `Processing · ${run.reference}`,
      [
        ...[...valueOut].map(([code, debit]) => ({ code, debit })),
        ...[...valueIn].map(([code, credit]) => ({ code, credit })),
      ],
      run.mamcosId, actorId, tx,
    );
  }

  /** Reversing a run cancels its journal. */
  async voidRun(tx: Tx, run: { id: string; reference: string; mamcosId: string | null }, actorId: string) {
    await this.accounting.postToLedger('StockRun', run.id, new Date(), `Processing reversed · ${run.reference}`, [], run.mamcosId, actorId, tx);
  }

  /** Rice leaving the warehouse becomes cost of goods sold: Dr cost of goods sold / Cr inventory. */
  async postDispatch(tx: Tx, d: { id: string; reference: string; mamcosId: string | null }, lines: { batchId: string; quantityKg: number }[], actorId: string, sourceType = 'StockDispatch') {
    const batches = await tx.stockBatch.findMany({ where: { id: { in: lines.map((l) => l.batchId) } }, include: { product: { select: { category: true } } } });
    const byId = new Map(batches.map((b) => [b.id, b]));
    const credits = new Map<string, number>();
    let cost = 0;
    for (const l of lines) {
      const b = byId.get(l.batchId);
      if (!b || !isValued(b)) continue;
      const v = money(l.quantityKg * b.unitCost!);
      const code = INVENTORY_ACCOUNT[b.product.category];
      credits.set(code, money((credits.get(code) ?? 0) + v));
      cost = money(cost + v);
    }
    if (cost <= 0) return;
    await this.accounting.postToLedger(
      sourceType, d.id, new Date(), `Cost of goods sold · ${d.reference}`,
      [{ code: '5300', debit: cost }, ...[...credits].map(([code, credit]) => ({ code, credit }))], d.mamcosId, actorId, tx,
    );
  }

  /** A manual adjustment, write-off or count correction: the difference is a loss (or gain) at the batch's cost. */
  async postAdjustment(tx: Tx, entry: { id: string; batchId: string; quantityKg: number; reason?: string | null }, actorId: string) {
    const b = await tx.stockBatch.findUnique({ where: { id: entry.batchId }, include: { product: { select: { category: true } } } });
    if (!b || !isValued(b)) return;
    const value = money(Math.abs(entry.quantityKg) * b.unitCost!);
    if (value <= 0) return;
    const inv = INVENTORY_ACCOUNT[b.product.category];
    const lines = entry.quantityKg < 0
      ? [{ code: '5310', debit: value }, { code: inv, credit: value }]
      : [{ code: inv, debit: value }, { code: '5310', credit: value }];
    await this.accounting.postToLedger('StockAdjust', entry.id, new Date(), `Stock ${entry.quantityKg < 0 ? 'loss' : 'gain'}${entry.reason ? ` · ${entry.reason.slice(0, 80)}` : ''}`, lines, b.mamcosId, actorId, tx);
  }

  /** Gives a batch that has no cost its opening value: Dr inventory / Cr retained earnings. */
  async setOpeningValue(batchId: string, unitCost: number, actor: Actor & { id: string }) {
    if (!(unitCost > 0)) throw new BadRequestException('Enter a cost per kg above zero');
    return this.prisma.$transaction(async (tx) => {
      const b = await tx.stockBatch.findUnique({ where: { id: batchId }, include: { product: { select: { category: true } } } });
      assertVisible(actor, b, 'Batch');
      await lockBatches(tx, [b.id]);
      if (b.ownerType !== 'COOPERATIVE') throw new BadRequestException('This stock belongs to someone else, so it is not part of the cooperative’s books');
      if (b.unitCost != null) throw new ConflictException('This batch already has a cost');
      const { physicalKg } = (await batchBalances(tx, [b.id])).get(b.id)!;
      if (physicalKg <= 0) throw new BadRequestException('There is no stock left in this batch to value');
      const value = money(physicalKg * unitCost);
      await tx.stockBatch.update({ where: { id: b.id }, data: { unitCost } });
      const inv = INVENTORY_ACCOUNT[b.product.category];
      await this.accounting.postToLedger('StockOpening', b.id, new Date(), `Opening stock value · ${b.reference}`, [{ code: inv, debit: value }, { code: '3200', credit: value }], b.mamcosId, actor.id, tx);
      return tx.stockBatch.findUnique({ where: { id: b.id } });
    });
  }

  /**
   * The control that proves the warehouse and the books agree: stock value per inventory account against the account balance.
   * Paddy bought at the collection centre but not yet received into a warehouse is shown separately so it explains the difference.
   */
  async valuation(actor: Actor) {
    const batches = await this.prisma.stockBatch.findMany({ where: { ...scope(actor), ownerType: 'COOPERATIVE' }, include: { product: { select: { category: true } } } });
    const bal = await batchBalances(this.prisma, batches.map((b) => b.id));
    const stock = new Map<string, { kg: number; value: number; uncostedKg: number }>();
    for (const code of ['1200', '1210', '1220']) stock.set(code, { kg: 0, value: 0, uncostedKg: 0 });
    for (const b of batches) {
      const kg = bal.get(b.id)?.physicalKg ?? 0;
      if (kg <= 0) continue;
      const row = stock.get(INVENTORY_ACCOUNT[b.product.category])!;
      row.kg += kg;
      if (b.unitCost != null) row.value += kg * b.unitCost;
      else row.uncostedKg += kg;
    }
    const accounts = await this.prisma.account.findMany({ where: { code: { in: ['1200', '1210', '1220'] } } });
    const entries = await this.prisma.ledgerEntry.groupBy({ by: ['accountId'], where: { ...scope(actor), accountId: { in: accounts.map((a) => a.id) } }, _sum: { debit: true, credit: true } });
    const notReceived = await this.prisma.inventoryRecord.aggregate({
      where: { warehouseId: null, totalValue: { not: null }, ...scope(actor) },
      _sum: { totalValue: true },
    });
    const pending = money(notReceived._sum.totalValue ?? 0);
    const rows = ['1200', '1210', '1220'].map((code) => {
      const acct = accounts.find((a) => a.code === code);
      const e = entries.find((x) => x.accountId === acct?.id);
      const booksValue = money((e?._sum.debit ?? 0) - (e?._sum.credit ?? 0));
      const s = stock.get(code)!;
      const stockValue = money(s.value);
      const explained = code === '1200' ? pending : 0;
      const difference = money(booksValue - stockValue - explained);
      return { code, name: INVENTORY_ACCOUNT_NAMES[code], kg: Math.round(s.kg * 1000) / 1000, uncostedKg: Math.round(s.uncostedKg * 1000) / 1000, stockValue, booksValue, notYetReceived: explained, difference };
    });
    const tolerance = Math.max(batches.length, 1); // each batch can carry a few cents of rounding
    return {
      rows,
      totalStockValue: money(rows.reduce((t, r) => t + r.stockValue, 0)),
      totalBooksValue: money(rows.reduce((t, r) => t + r.booksValue, 0)),
      matches: rows.every((r) => Math.abs(r.difference) <= tolerance),
      uncostedKg: Math.round(rows.reduce((t, r) => t + r.uncostedKg, 0) * 1000) / 1000,
    };
  }
}
