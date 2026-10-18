import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, batchBalances, lockBatches, nextRef, owner, OpsNotifyService, scope, Tx } from './ops-common';
import { outputsExceedInput, r3, runBalance } from './ops-rules';
import { CreateRunDto } from './dto/warehouse.dto';

type User = Actor & { id: string };
/** Runs losing more than this share of what went in are flagged for management. */
export const LOSS_ALERT_PCT = 5;
/** Milling that returns less head rice than this per 100 kg of paddy is flagged. */
export const LOW_YIELD_PCT = 55;

@Injectable()
export class ProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: OpsNotifyService,
  ) {}

  /** Records a run and moves the stock in one transaction: inputs leave, outputs arrive, the difference is the recorded loss. */
  async create(dto: CreateRunDto, actor: User) {
    if (!dto.inputs.length) throw new BadRequestException('Choose the batches being processed');
    if (!dto.outputs.length) throw new BadRequestException('Record what the run produced');
    const merged = new Map<string, number>();
    for (const i of dto.inputs) merged.set(i.batchId, r3((merged.get(i.batchId) ?? 0) + i.quantityKg));
    const inputKg = r3([...merged.values()].reduce((t, v) => t + v, 0));
    if (outputsExceedInput(inputKg, dto.outputs)) throw new BadRequestException('The outputs add up to more than the rice that went in. Recheck the weights.');
    for (const o of dto.outputs) {
      if ((o.kind === 'PRODUCT' || o.kind === 'BROKEN') && !o.productId) throw new BadRequestException('Choose the product for each rice output');
    }

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse || !warehouse.isActive) throw new NotFoundException('Warehouse not found');
    const outProducts = new Map((await this.prisma.product.findMany({ where: { id: { in: dto.outputs.map((o) => o.productId).filter((x): x is string => !!x) } } })).map((p) => [p.id, p]));
    for (const o of dto.outputs) {
      if (!o.productId) continue;
      const p = outProducts.get(o.productId);
      if (!p || !p.isActive) throw new NotFoundException('Product not found');
      if (o.kind === 'PRODUCT' && p.category !== 'PROCESSED') throw new BadRequestException(`${p.name} is not a processed rice product`);
      if (o.kind === 'BROKEN' && p.category !== 'BROKEN') throw new BadRequestException(`${p.name} is not a broken rice product`);
      if (!['PRODUCT', 'BROKEN'].includes(o.kind) && p.category !== 'BYPRODUCT') throw new BadRequestException(`${p.name} is not a by-product`);
    }

    const run = await this.prisma.$transaction(async (tx: Tx) => {
      const ids = [...merged.keys()];
      const batches = await tx.stockBatch.findMany({ where: { id: { in: ids } }, include: { product: true } });
      if (batches.length !== ids.length) throw new NotFoundException('A chosen batch was not found');
      for (const b of batches) assertVisible(actor, b, 'Batch');
      await lockBatches(tx, ids);
      const bal = await batchBalances(tx, ids, dto.warehouseId);
      for (const b of batches) {
        const need = merged.get(b.id)!;
        const have = bal.get(b.id)!.availableKg;
        if (need > have + 0.0005) throw new ConflictException(`Batch ${b.reference} has only ${have} kg free at this warehouse (${bal.get(b.id)!.reservedKg} kg is reserved for orders)`);
        if (dto.kind === 'MILLING' && b.product.category !== 'PADDY') throw new BadRequestException(`Batch ${b.reference} is not paddy, so it cannot be milled`);
        if (dto.kind === 'PACKAGING' && b.product.category !== 'PROCESSED') throw new BadRequestException(`Batch ${b.reference} is not processed rice, so it cannot be repackaged`);
      }
      const varieties = [...new Set(batches.map((b) => b.riceVariety).filter(Boolean))];
      const variety = varieties.length === 1 ? varieties[0] : varieties.length > 1 ? 'Mixed' : null;
      const balance = runBalance(inputKg, dto.outputs);
      const run = await tx.processingRun.create({
        data: {
          mamcosId: owner(actor), reference: await nextRef(tx, 'PR'), kind: dto.kind, warehouseId: dto.warehouseId,
          processedAt: dto.processedAt ? new Date(dto.processedAt) : new Date(), machine: dto.machine?.trim() || null, operatorName: dto.operatorName?.trim() || null,
          operatorUserId: actor.id, inputKg, outputKg: balance.outputKg, lossKg: balance.lossKg, lossNote: dto.lossNote?.trim() || null, createdByUserId: actor.id,
        },
      });
      for (const [batchId, quantityKg] of merged) {
        await tx.processingInput.create({ data: { runId: run.id, batchId, quantityKg } });
        await tx.stockLedgerEntry.create({ data: { batchId, warehouseId: dto.warehouseId, type: 'PROCESS_OUT', quantityKg: -quantityKg, refType: 'processing', refId: run.id, createdByUserId: actor.id } });
      }
      for (const o of dto.outputs) {
        let batchId: string | null = null;
        if (o.productId) {
          const p = outProducts.get(o.productId)!;
          const b = await tx.stockBatch.create({
            data: {
              mamcosId: run.mamcosId, reference: await nextRef(tx, 'BT'), productId: o.productId, warehouseId: dto.warehouseId, storageLocation: o.destinationLocation?.trim() || null,
              riceVariety: variety ?? p.riceVariety, grade: p.grade, processingRunId: run.id, outputKind: o.kind,
            },
          });
          batchId = b.id;
          await tx.stockLedgerEntry.create({ data: { batchId: b.id, warehouseId: dto.warehouseId, type: 'PROCESS_IN', quantityKg: o.quantityKg, refType: 'processing', refId: run.id, createdByUserId: actor.id } });
        }
        await tx.processingOutput.create({ data: { runId: run.id, batchId, productId: o.productId ?? null, kind: o.kind, quantityKg: o.quantityKg, destinationLocation: o.destinationLocation?.trim() || null, note: o.note?.trim() || null } });
      }
      return { run, balance };
    });

    const flagged = run.balance.lossPct > LOSS_ALERT_PCT || (dto.kind === 'MILLING' && run.balance.milledYieldPct < LOW_YIELD_PCT);
    if (flagged) {
      await this.notify.tellPermission('ops_reports', 'VIEW', run.run.mamcosId, {
        type: 'OPS_PROCESSING_DISCREPANCY', title: 'Processing run needs a look',
        body: `${run.run.reference}: ${run.balance.lossPct}% unaccounted${dto.kind === 'MILLING' ? `, ${run.balance.milledYieldPct}% milled rice yield` : ''}.`, data: { runId: run.run.id },
      });
    }
    return this.detail(run.run.id, actor);
  }

  async detail(id: string, actor: Actor) {
    const run = await this.prisma.processingRun.findUnique({
      where: { id },
      include: {
        warehouse: { select: { name: true } },
        inputs: { include: { batch: { select: { reference: true, riceVariety: true, product: { select: { name: true, brand: true } } } } } },
        outputs: { include: { product: { select: { name: true, brand: true } } } },
        batches: { select: { id: true, reference: true, outputKind: true } },
      },
    });
    assertVisible(actor, run, 'Processing run');
    return { ...run, ...runBalance(run.inputKg, run.outputs), flagged: this.isFlagged(run) };
  }

  private isFlagged(run: { kind: string; inputKg: number; outputs: { kind: string; quantityKg: number }[] }) {
    const b = runBalance(run.inputKg, run.outputs);
    return b.lossPct > LOSS_ALERT_PCT || (run.kind === 'MILLING' && b.milledYieldPct < LOW_YIELD_PCT);
  }

  async list(actor: Actor, f: { from?: string; to?: string; kind?: string; flagged?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    const runs = await this.prisma.processingRun.findMany({
      where: { ...scope(actor), ...(f.kind ? { kind: f.kind as never } : {}), ...(f.from || to ? { processedAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      include: { warehouse: { select: { name: true } }, outputs: { select: { kind: true, quantityKg: true } } },
      orderBy: { processedAt: 'desc' },
      take: 300,
    });
    const rows = runs.map((r) => ({ ...r, ...runBalance(r.inputKg, r.outputs), flagged: this.isFlagged(r) }));
    return f.flagged === 'true' ? rows.filter((r) => r.flagged) : rows;
  }

  /** Average yield and loss over the period, run by run, so management can see which runs fell short. */
  async yieldReport(actor: Actor, f: { from?: string; to?: string } = {}) {
    const runs = (await this.list(actor, { ...f, kind: 'MILLING' })) as Awaited<ReturnType<ProcessingService['list']>>;
    const inputKg = r3(runs.reduce((t, r) => t + r.inputKg, 0));
    const riceKg = r3(runs.reduce((t, r) => t + r.outputs.filter((o) => o.kind === 'PRODUCT').reduce((s, o) => s + o.quantityKg, 0), 0));
    const lossKg = r3(runs.reduce((t, r) => t + r.lossKg, 0));
    return {
      runs: runs.length, paddyMilledKg: inputKg, milledRiceKg: riceKg, lossKg,
      averageYieldPct: inputKg > 0 ? Math.round((riceKg / inputKg) * 10000) / 100 : 0,
      averageLossPct: inputKg > 0 ? Math.round((lossKg / inputKg) * 10000) / 100 : 0,
      flagged: runs.filter((r) => r.flagged).length,
      rows: runs,
    };
  }

  /** Undoes a run, but only while none of its output has been used. The original rows stay; opposite rows are added. */
  async reverse(id: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for reversing the run');
    await this.prisma.$transaction(async (tx: Tx) => {
      const run = await tx.processingRun.findUnique({ where: { id }, include: { inputs: true, batches: true } });
      assertVisible(actor, run, 'Processing run');
      const claimed = await tx.processingRun.updateMany({ where: { id, status: 'COMPLETED' }, data: { status: 'REVERSED', reversedAt: new Date(), reversedByUserId: actor.id, reverseReason: reason.trim() } });
      if (!claimed.count) throw new ConflictException('This run has already been reversed');
      const outIds = run.batches.map((b) => b.id);
      await lockBatches(tx, [...outIds, ...run.inputs.map((i) => i.batchId)]);
      const bal = await batchBalances(tx, outIds, run.warehouseId);
      const produced = await tx.stockLedgerEntry.findMany({ where: { refType: 'processing', refId: id, type: 'PROCESS_IN' } });
      for (const p of produced) {
        const b = bal.get(p.batchId)!;
        if (b.physicalKg < p.quantityKg - 0.0005 || b.reservedKg > 0) throw new ConflictException('Some of this run’s output has already been sold, reserved or used, so it cannot be reversed');
        const other = await tx.processingInput.count({ where: { batchId: p.batchId } });
        if (other) throw new ConflictException('This run’s output has already been processed again');
      }
      for (const p of produced) {
        await tx.stockLedgerEntry.create({ data: { batchId: p.batchId, warehouseId: run.warehouseId, type: 'PROCESS_OUT', quantityKg: -p.quantityKg, reason: `Run ${run.reference} reversed: ${reason.trim()}`, refType: 'processing-reversal', refId: id, reversalOfId: p.id, createdByUserId: actor.id } });
      }
      const consumed = await tx.stockLedgerEntry.findMany({ where: { refType: 'processing', refId: id, type: 'PROCESS_OUT' } });
      for (const c of consumed) {
        await tx.stockLedgerEntry.create({ data: { batchId: c.batchId, warehouseId: run.warehouseId, type: 'PROCESS_IN', quantityKg: -c.quantityKg, reason: `Run ${run.reference} reversed: ${reason.trim()}`, refType: 'processing-reversal', refId: id, reversalOfId: c.id, createdByUserId: actor.id } });
      }
    });
    return this.detail(id, actor);
  }
}
