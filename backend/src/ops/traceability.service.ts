import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, scope } from './ops-common';

const MAX_DEPTH = 6;

/** Follows rice both ways: from a processed batch back to farmers, farms and inputs; from paddy forward to customers. */
@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private async batchHead(id: string) {
    return this.prisma.stockBatch.findUnique({
      where: { id },
      include: { product: { select: { name: true, brand: true, category: true } }, warehouse: { select: { name: true } } },
    });
  }

  async backward(batchId: string, actor: Actor, depth = 0): Promise<unknown> {
    const b = await this.batchHead(batchId);
    assertVisible(actor, b, 'Batch');
    const node: Record<string, unknown> = {
      batchId: b.id, reference: b.reference, product: b.product.name, brand: b.product.brand, category: b.product.category,
      variety: b.riceVariety, grade: b.grade, createdAt: b.createdAt,
    };
    if (b.receiptId) {
      const r = await this.prisma.goodsReceipt.findUnique({
        where: { id: b.receiptId },
        include: {
          farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, district: true } },
          farm: { select: { id: true, farmCode: true, name: true, isMayodeFarm: true } },
          plot: { select: { id: true, plotCode: true, name: true } },
          cropCycle: { select: { id: true, season: true, riceVariety: true, plantingDate: true, harvestDate: true, actualYieldKg: true } },
          harvest: true,
        },
      });
      if (r) {
        const cycleId = r.cropCycleId;
        const [inputs, tasks, costs] = cycleId
          ? await Promise.all([
              this.prisma.farmInputMovement.findMany({ where: { cropCycleId: cycleId, type: 'OUT' }, include: { item: { select: { name: true, type: true, unit: true } } }, orderBy: { createdAt: 'asc' } }),
              this.prisma.farmTask.findMany({ where: { cropCycleId: cycleId, status: 'COMPLETED' }, select: { reference: true, title: true, activityType: true, completedAt: true, plotId: true }, orderBy: { completedAt: 'asc' } }),
              this.prisma.inputCost.findMany({ where: { cropCycleId: cycleId }, select: { category: true, itemName: true, quantity: true, unit: true, dateIncurred: true }, orderBy: { dateIncurred: 'asc' } }),
            ])
          : [[], [], []];
        node.source = {
          type: 'RECEIPT', receiptId: r.id, reference: r.reference, receivedAt: r.receivedAt, sourceType: r.sourceType, grossKg: r.grossKg, rejectedKg: r.rejectedKg,
          bags: r.bags, bagWeightKg: r.bagWeightKg, moisturePct: r.moisturePct, quality: r.qualityGrade, inspection: r.inspection,
          farmer: r.farmer, sellerName: r.sellerName, farm: r.farm, plot: r.plot, cropCycle: r.cropCycle,
          harvest: r.harvest ? { reference: r.harvest.reference, batchRef: r.harvest.batchRef, harvestDate: r.harvest.harvestDate, actualKg: r.harvest.actualKg } : null,
          inputsUsed: [
            ...inputs.map((i) => ({ name: i.item.name, type: i.item.type, quantity: -i.quantity, unit: i.item.unit, date: i.createdAt, source: 'Mayode farm stock' })),
            ...costs.map((c) => ({ name: c.itemName, type: c.category, quantity: c.quantity, unit: c.unit, date: c.dateIncurred, source: 'Crop cost record' })),
          ],
          activities: tasks,
        };
      }
    }
    if (b.processingRunId && depth < MAX_DEPTH) {
      const run = await this.prisma.processingRun.findUnique({ where: { id: b.processingRunId }, include: { inputs: true } });
      if (run) {
        node.processing = {
          runId: run.id, reference: run.reference, kind: run.kind, processedAt: run.processedAt, machine: run.machine, operator: run.operatorName, inputKg: run.inputKg, outputKg: run.outputKg, lossKg: run.lossKg,
          sources: await Promise.all(run.inputs.map(async (i) => ({ contributedKg: i.quantityKg, batch: await this.backward(i.batchId, actor, depth + 1) }))),
        };
      }
    }
    return node;
  }

  async forward(batchId: string, actor: Actor, depth = 0): Promise<unknown> {
    const b = await this.batchHead(batchId);
    assertVisible(actor, b, 'Batch');
    const node: Record<string, unknown> = { batchId: b.id, reference: b.reference, product: b.product.name, brand: b.product.brand, category: b.product.category, createdAt: b.createdAt };
    const [inputs, lines, allocs] = await Promise.all([
      this.prisma.processingInput.findMany({ where: { batchId }, include: { run: { include: { outputs: true, batches: { select: { id: true } } } } } }),
      this.prisma.opsDispatchLine.findMany({
        where: { batchId, dispatch: { status: 'RELEASED' } },
        include: { dispatch: { include: { order: { include: { customer: { select: { id: true, reference: true, name: true } } } } } } },
        orderBy: { dispatch: { releasedAt: 'asc' } },
      }),
      this.prisma.orderAllocation.findMany({ where: { batchId }, include: { order: { select: { reference: true, status: true, customer: { select: { name: true } } } } } }),
    ]);
    node.processedInto = depth >= MAX_DEPTH ? [] : await Promise.all(
      inputs.filter((i) => i.run.status === 'COMPLETED').map(async (i) => ({
        usedKg: i.quantityKg, run: { runId: i.run.id, reference: i.run.reference, kind: i.run.kind, processedAt: i.run.processedAt },
        products: await Promise.all(i.run.batches.map((ob) => this.forward(ob.id, actor, depth + 1))),
      })),
    );
    node.dispatched = lines.map((l) => ({
      quantityKg: l.quantityKg, dispatch: l.dispatch.reference, releaseNote: l.dispatch.releaseNoteNumber, releasedAt: l.dispatch.releasedAt, vehicle: l.dispatch.vehiclePlate,
      order: l.dispatch.order.reference, customer: l.dispatch.order.customer,
    }));
    node.reservedForOrders = allocs.filter((a) => a.quantityKg - a.dispatchedKg - a.releasedKg > 0).map((a) => ({ order: a.order.reference, customer: a.order.customer.name, reservedKg: a.quantityKg - a.dispatchedKg - a.releasedKg }));
    return node;
  }

  /** Find the starting batch(es) from any reference a person might have: a batch, receipt, run, dispatch, release note or order number. */
  async search(refRaw: string, actor: Actor) {
    const ref = refRaw.trim();
    if (!ref) throw new NotFoundException('Enter a reference to trace');
    const where = scope(actor);
    const direct = await this.prisma.stockBatch.findFirst({ where: { ...where, reference: { equals: ref, mode: 'insensitive' } }, select: { id: true } });
    if (direct) return [direct.id];
    const receipt = await this.prisma.goodsReceipt.findFirst({ where: { ...where, reference: { equals: ref, mode: 'insensitive' } }, select: { batch: { select: { id: true } } } });
    if (receipt?.batch) return [receipt.batch.id];
    const run = await this.prisma.processingRun.findFirst({ where: { ...where, reference: { equals: ref, mode: 'insensitive' } }, select: { batches: { select: { id: true } } } });
    if (run?.batches.length) return run.batches.map((b) => b.id);
    const dispatch = await this.prisma.opsDispatch.findFirst({
      where: { ...where, OR: [{ reference: { equals: ref, mode: 'insensitive' } }, { releaseNoteNumber: { equals: ref, mode: 'insensitive' } }] },
      select: { lines: { select: { batchId: true } } },
    });
    if (dispatch?.lines.length) return [...new Set(dispatch.lines.map((l) => l.batchId))];
    const order = await this.prisma.opsOrder.findFirst({ where: { ...where, reference: { equals: ref, mode: 'insensitive' } }, select: { dispatches: { select: { lines: { select: { batchId: true } } } } } });
    const fromOrder = order?.dispatches.flatMap((d) => d.lines.map((l) => l.batchId)) ?? [];
    if (fromOrder.length) return [...new Set(fromOrder)];
    throw new NotFoundException(`Nothing found for “${ref}”`);
  }
}
