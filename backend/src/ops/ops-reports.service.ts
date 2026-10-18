import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, scope } from './ops-common';
import { r2, r3 } from './ops-rules';
import { StockService } from './stock.service';
import { ReceivingService } from './receiving.service';
import { ProcessingService } from './processing.service';
import { SalesOpsService } from './sales-ops.service';
import { BillingService } from './billing.service';
import { DispatchService } from './dispatch.service';
import { FarmTasksService } from './farm-tasks.service';
import { FarmInputsService } from './farm-inputs.service';
import { HarvestService } from './harvest.service';

export interface Range { from?: string; to?: string }
const FINAL = ['COMPLETED', 'REJECTED', 'CANCELLED'];
const dayStr = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

const rangeWhere = (field: string, r: Range) => {
  if (!r.from && !r.to) return {};
  const to = r.to ? new Date(r.to) : undefined;
  if (to) to.setHours(23, 59, 59, 999);
  return { [field]: { ...(r.from ? { gte: new Date(r.from) } : {}), ...(to ? { lte: to } : {}) } };
};

export const REPORTS = [
  { key: 'stock-position', title: 'Stock position', group: 'Warehouse', description: 'Opening, received, processed, produced, dispatched, adjustments and closing stock, with reserved and available.' },
  { key: 'goods-received', title: 'Goods received', group: 'Warehouse', description: 'Paddy receipts with farmer, farm, quality and batch.' },
  { key: 'processing-yield', title: 'Processing yield and loss', group: 'Warehouse', description: 'Each run: paddy in, products out, loss and milling yield.' },
  { key: 'discrepancies', title: 'Stock discrepancies', group: 'Warehouse', description: 'Runs with high loss, rejected deliveries, manual adjustments, short transfers and rice lost in transit.' },
  { key: 'sales-orders', title: 'Sales orders', group: 'Commercial', description: 'Orders with customer, status, payment and fulfilment.' },
  { key: 'invoices', title: 'Invoices', group: 'Commercial', description: 'Invoices issued, paid and outstanding.' },
  { key: 'payments', title: 'Payments', group: 'Commercial', description: 'Confirmed, pending and rejected payments.' },
  { key: 'dispatches', title: 'Dispatches', group: 'Commercial', description: 'Goods released with vehicle, driver and release note.' },
  { key: 'farm-tasks', title: 'Farm tasks', group: 'Mayode Farms', description: 'Tasks and inspections with assignee, status and review.' },
  { key: 'attendance', title: 'Field attendance', group: 'Mayode Farms', description: 'GPS check-ins with distance from the assigned plot.' },
  { key: 'input-usage', title: 'Input usage', group: 'Mayode Farms', description: 'Seeds, fertiliser and chemicals used, by plot and task.' },
  { key: 'harvest-reconciliation', title: 'Harvest reconciliation', group: 'Mayode Farms', description: 'Harvested, transported, received, accepted and lost.' },
] as const;

@Injectable()
export class OpsReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly receiving: ReceivingService,
    private readonly processing: ProcessingService,
    private readonly sales: SalesOpsService,
    private readonly billing: BillingService,
    private readonly dispatch: DispatchService,
    private readonly tasks: FarmTasksService,
    private readonly inputs: FarmInputsService,
    private readonly harvests: HarvestService,
  ) {}

  catalog() {
    return REPORTS;
  }

  // ---------- dashboards ----------

  async commercial(actor: Actor, r: Range) {
    const s = scope(actor);
    const [received, runs, awaitingReview, invoices, outstanding, payments, awaitingFulfil, dispatched, position, stockSummary] = await Promise.all([
      this.prisma.goodsReceipt.aggregate({ where: { ...s, status: 'CONFIRMED', ...rangeWhere('receivedAt', r) }, _sum: { grossKg: true, rejectedKg: true }, _count: true }),
      this.processing.yieldReport(actor, r),
      this.prisma.opsOrder.count({ where: { ...s, status: 'PENDING_ACCOUNTS_REVIEW' } }),
      this.prisma.opsInvoice.aggregate({ where: { ...s, status: { not: 'VOID' }, ...rangeWhere('invoiceDate', r) }, _sum: { total: true }, _count: true }),
      this.prisma.opsInvoice.aggregate({ where: { ...s, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, _sum: { total: true, amountPaid: true }, _count: true }),
      this.prisma.opsPayment.aggregate({ where: { ...s, status: 'CONFIRMED', ...rangeWhere('paidAt', r) }, _sum: { amount: true }, _count: true }),
      this.prisma.opsOrder.count({ where: { ...s, status: 'INVOICED', fulfilState: { in: ['AUTHORIZED', 'ALLOCATED', 'SHORTAGE', 'PARTIALLY_DISPATCHED'] } } }),
      this.prisma.opsDispatchLine.aggregate({ where: { dispatch: { ...s, status: 'RELEASED', ...rangeWhere('releasedAt', r) } }, _sum: { quantityKg: true } }),
      this.stock.position(actor, {}),
      this.stock.summary(actor),
    ]);
    const byBrand = new Map<string, { available: number; physical: number }>();
    for (const p of position.filter((x) => x.category === 'PROCESSED')) {
      const k = p.brand ?? 'No brand';
      const v = byBrand.get(k) ?? { available: 0, physical: 0 };
      v.available += p.availableKg; v.physical += p.closingKg;
      byBrand.set(k, v);
    }
    return {
      paddyReceivedKg: r3((received._sum.grossKg ?? 0) - (received._sum.rejectedKg ?? 0)), receipts: received._count,
      riceProcessed: { runs: runs.runs, paddyMilledKg: runs.paddyMilledKg, milledRiceKg: runs.milledRiceKg, averageYieldPct: runs.averageYieldPct, averageLossPct: runs.averageLossPct, flagged: runs.flagged },
      processedByBrand: [...byBrand.entries()].map(([brand, v]) => ({ brand, availableKg: r3(v.available), physicalKg: r3(v.physical) })).sort((a, b) => b.availableKg - a.availableKg),
      ordersAwaitingReview: awaitingReview,
      invoicesIssued: { count: invoices._count, value: r2(invoices._sum.total ?? 0) },
      invoicesOutstanding: { count: outstanding._count, value: r2((outstanding._sum.total ?? 0) - (outstanding._sum.amountPaid ?? 0)) },
      confirmedPayments: { count: payments._count, value: r2(payments._sum.amount ?? 0) },
      ordersAwaitingFulfilment: awaitingFulfil,
      goodsDispatchedKg: r3(dispatched._sum.quantityKg ?? 0),
      stock: stockSummary,
    };
  }

  async farm(actor: Actor, r: Range) {
    const s = scope(actor);
    const mayode = { ...s, isMayodeFarm: true };
    const [farms, plots, cycles, tasks, inspections, checkIns, usage, harvests, costs] = await Promise.all([
      this.prisma.farm.count({ where: { ...mayode, isActive: true } }),
      this.prisma.plot.count({ where: { farm: mayode } }),
      this.prisma.cropCycle.findMany({ where: { farm: mayode, status: { in: ['ACTIVE', 'PLANNED'] } }, select: { growthStage: true, estimatedYieldKg: true, areaPlantedHa: true } }),
      this.prisma.farmTask.findMany({ where: { ...s, type: 'TASK', ...rangeWhere('createdAt', r) }, select: { status: true, deadline: true } }),
      this.prisma.farmTask.findMany({ where: { ...s, type: 'INSPECTION', status: { notIn: FINAL as never[] }, plannedStart: { gte: new Date(Date.now() - 86_400_000), lte: new Date(Date.now() + 14 * 86_400_000) } }, select: { id: true, reference: true, title: true, plannedStart: true, assigneeUserId: true, farm: { select: { name: true } } }, orderBy: { plannedStart: 'asc' } }),
      this.prisma.taskCheckIn.findMany({ where: { task: s, kind: 'CHECK_IN', serverTime: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { withinGeofence: true } }),
      this.prisma.farmInputMovement.groupBy({ by: ['itemId'], where: { item: s, type: 'OUT', ...rangeWhere('createdAt', r) }, _sum: { quantity: true } }),
      this.prisma.harvestRecord.findMany({ where: { ...s, ...rangeWhere('harvestDate', r) }, select: { farmId: true, estimatedKg: true, actualKg: true, farm: { select: { name: true } } } }),
      this.prisma.inputCost.aggregate({ where: { cropCycle: { farm: mayode }, ...rangeWhere('dateIncurred', r) }, _sum: { totalCost: true } }),
    ]);
    const items = new Map((await this.prisma.farmInputItem.findMany({ where: { id: { in: usage.map((u) => u.itemId) } } })).map((i) => [i.id, i]));
    const now = Date.now();
    const count = (st: string) => tasks.filter((t) => t.status === st).length;
    const stages = new Map<string, number>();
    for (const c of cycles) stages.set(c.growthStage ?? 'NOT_RECORDED', (stages.get(c.growthStage ?? 'NOT_RECORDED') ?? 0) + 1);
    const perFarm = new Map<string, { name: string; est: number; actual: number }>();
    for (const h of harvests) {
      const v = perFarm.get(h.farmId) ?? { name: h.farm.name, est: 0, actual: 0 };
      v.est += h.estimatedKg ?? 0; v.actual += h.actualKg;
      perFarm.set(h.farmId, v);
    }
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: inspections.map((i) => i.assigneeUserId) } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));
    return {
      farms, plots, activeCycles: cycles.length,
      expectedHarvestKg: r3(cycles.reduce((t, c) => t + (c.estimatedYieldKg ?? 0), 0)),
      tasks: { assigned: count('ASSIGNED') + count('ACKNOWLEDGED'), inProgress: count('IN_PROGRESS'), completed: count('COMPLETED'), awaitingReview: count('PENDING_REVIEW'), returned: count('RETURNED'), rejected: count('REJECTED'), overdue: tasks.filter((t) => t.deadline && t.deadline.getTime() < now && !FINAL.includes(t.status)).length },
      upcomingInspections: inspections.map((i) => ({ ...i, assignee: names.get(i.assigneeUserId) ?? null })),
      attendance: { checkIns7d: checkIns.length, outsideGeofence7d: checkIns.filter((c) => c.withinGeofence === false).length },
      inputUsage: usage.map((u) => ({ item: items.get(u.itemId)?.name ?? '—', type: items.get(u.itemId)?.type ?? '', unit: items.get(u.itemId)?.unit ?? '', used: r3(-(u._sum.quantity ?? 0)) })).sort((a, b) => b.used - a.used),
      cropProgress: [...stages.entries()].map(([stage, n]) => ({ stage, count: n })),
      harvestByFarm: [...perFarm.values()].map((v) => ({ farm: v.name, estimatedKg: r3(v.est), actualKg: r3(v.actual) })),
      productionCost: r2(costs._sum.totalCost ?? 0),
    };
  }

  // ---------- reports (rows for the table and the exports) ----------

  async run(key: string, actor: Actor, f: Record<string, string | undefined>): Promise<{ title: string; rows: Record<string, unknown>[] }> {
    const meta = REPORTS.find((r) => r.key === key);
    if (!meta) throw new BadRequestException('Unknown report');
    const rows = await this.rows(key, actor, f);
    return { title: meta.title, rows };
  }

  private async rows(key: string, actor: Actor, f: Record<string, string | undefined>): Promise<Record<string, unknown>[]> {
    switch (key) {
      case 'stock-position':
        return (await this.stock.position(actor, { from: f.from, to: f.to, productId: f.productId, brand: f.brand, category: f.category, warehouseId: f.warehouseId, batchId: f.batchId })).map((p) => ({
          Product: p.product, Brand: p.brand ?? '', Category: p.category, Variety: p.variety ?? '', Grade: p.grade ?? '', 'Pack (kg)': p.packSizeKg ?? '', Warehouse: p.warehouse ?? '',
          'Opening kg': p.openingKg, 'Received kg': p.receivedKg, 'Processed out kg': p.processedOutKg, 'Produced kg': p.producedKg, 'Dispatched kg': p.dispatchedKg, 'Adjustments kg': p.adjustmentsKg, 'Transfers kg': p.transfersKg,
          'Closing kg': p.closingKg, 'Reserved kg': p.reservedKg, 'Available kg': p.availableKg, 'In transit kg': p.inTransitKg, 'Indicative value (TZS)': p.indicativeValue ?? '', 'Low stock': p.lowStock ? 'Yes' : '',
        }));
      case 'goods-received':
        return (await this.receiving.list(actor, { from: f.from, to: f.to, status: f.status, farmerId: f.farmerId, sourceType: f.sourceType })).map((r) => ({
          Reference: r.reference, Date: dayStr(r.receivedAt), Status: r.status, Source: r.sourceType, Farmer: r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName}` : r.sellerName ?? '', 'Control no.': r.farmer?.controlNumber ?? '',
          Farm: r.farm?.name ?? '', Plot: r.plot?.plotCode ?? '', Variety: r.riceVariety ?? '', 'Gross kg': r.grossKg, 'Rejected kg': r.rejectedKg, Bags: r.bags ?? '', 'Moisture %': r.moisturePct ?? '', Grade: r.qualityGrade ?? '',
          Inspection: r.inspection, Batch: r.batch?.reference ?? '', Warehouse: r.warehouse.name,
        }));
      case 'processing-yield':
        return (await this.processing.list(actor, { from: f.from, to: f.to, kind: f.kind })).map((r) => ({
          Reference: r.reference, Date: dayStr(r.processedAt), Kind: r.kind, Warehouse: r.warehouse.name, Machine: r.machine ?? '', Operator: r.operatorName ?? '', 'Input kg': r.inputKg, 'Output kg': r.outputKg,
          'Loss kg': r.lossKg, 'Loss %': r.lossPct, 'Milled rice yield %': r.milledYieldPct, Flagged: r.flagged ? 'Yes' : '', Status: r.status,
        }));
      case 'discrepancies':
        return this.discrepancies(actor, f);
      case 'sales-orders':
        return (await this.sales.list(actor, { from: f.from, to: f.to, status: f.status, paymentStatus: f.paymentStatus, fulfilState: f.fulfilState, customerId: f.customerId })).map((o) => ({
          Order: o.reference, Date: dayStr(o.createdAt), Customer: o.customer.name, Status: o.status, Payment: o.paymentStatus, Fulfilment: o.fulfilState, Invoice: o.invoices[0]?.invoiceNumber ?? '', Total: o.total, Paid: o.amountPaid, Balance: r2(o.total - o.amountPaid),
        }));
      case 'invoices':
        return (await this.billing.invoices(actor, { status: f.status, outstanding: f.outstanding })).map((i) => ({
          Invoice: i.invoiceNumber, Date: dayStr(i.invoiceDate), Due: dayStr(i.dueDate), Customer: i.customerName, Order: i.order.reference, Total: i.total, Paid: i.amountPaid, Balance: i.balance, Status: i.status, Overdue: i.overdue ? 'Yes' : '', 'Control no.': i.controlNumber ?? '',
        }));
      case 'payments':
        return (await this.billing.payments(actor, { status: f.status })).map((p) => ({
          Date: dayStr(p.paidAt ?? p.createdAt), Invoice: p.invoice.invoiceNumber, Customer: p.invoice.customerName, Order: p.order.reference, Amount: p.amount, Method: p.method, Provider: p.provider, Reference: p.providerReference, Status: p.status, Source: p.source,
        }));
      case 'dispatches':
        return (await this.dispatch.dispatches(actor, { from: f.from, to: f.to, status: f.status })).map((d) => ({
          Dispatch: d.reference, 'Release note': d.releaseNoteNumber ?? '', Order: d.order.reference, Customer: d.order.customer.name, Vehicle: d.vehiclePlate, Driver: d.driverName, Date: dayStr(d.releasedAt ?? d.dispatchAt),
          'Quantity kg': r3(d.lines.reduce((t, l) => t + l.quantityKg, 0)), Status: d.status, Delivery: d.deliveryState,
        }));
      case 'farm-tasks':
        return (await this.tasks.list(actor, { from: f.from, to: f.to, status: f.status, assigneeId: f.assigneeId, farmId: f.farmId, type: f.type })).map((t) => ({
          Task: t.reference, Type: t.type, Title: t.title, Activity: t.activityType, Farm: t.farm.name, Plot: t.plot?.plotCode ?? '', Assignee: t.assigneeName ?? '', Priority: t.priority, Deadline: dayStr(t.deadline), Status: t.status, Overdue: t.overdue ? 'Yes' : '', Completed: dayStr(t.completedAt),
        }));
      case 'attendance':
        return (await this.tasks.attendance(actor, { from: f.from, to: f.to, userId: f.userId, flagged: f.flagged })).map((c) => ({
          Employee: c.employee ?? '', Task: c.task.reference, Farm: c.task.farm.name, Plot: c.task.plot?.plotCode ?? '', Kind: c.kind, 'Server time': c.serverTime.toISOString(), 'Device time': c.deviceTime.toISOString(),
          'Distance (m)': c.distanceM ?? '', 'Allowed (m)': c.task.geofenceM, 'Within allowed distance': c.withinGeofence == null ? 'No reference' : c.withinGeofence ? 'Yes' : 'NO', 'GPS accuracy (m)': c.accuracyM ?? '',
        }));
      case 'input-usage':
        return (await this.inputs.movements(actor, {})).filter((m) => m.type === 'OUT').map((m) => ({
          Date: dayStr(m.createdAt), Input: m.item.name, Type: m.item.type, 'Quantity used': -m.quantity, Unit: m.item.unit, Task: m.task?.reference ?? '', 'Task title': m.task?.title ?? '',
        }));
      case 'harvest-reconciliation':
        return (await this.harvests.list(actor, { from: f.from, to: f.to, farmId: f.farmId })).map((h) => ({
          Harvest: h.reference, Batch: h.batchRef, Date: dayStr(h.harvestDate), Farm: h.farm.name, Plot: h.plot?.plotCode ?? '', Season: h.cropCycle.season, 'Estimated kg': h.estimatedKg ?? '', 'Harvested kg': h.actualKg,
          'Transported kg': h.position.transportedKg, 'Received kg': h.position.receivedKg, 'Accepted kg': h.position.acceptedKg, 'Rejected kg': h.position.rejectedKg, 'Lost in transit kg': h.position.lostInTransitKg,
        }));
      default:
        return [];
    }
  }

  private async discrepancies(actor: Actor, f: Record<string, string | undefined>) {
    const s = scope(actor);
    const out: Record<string, unknown>[] = [];
    for (const r of await this.processing.list(actor, { from: f.from, to: f.to, flagged: 'true' })) out.push({ Date: dayStr(r.processedAt), Kind: 'Processing loss or low yield', Reference: r.reference, 'Quantity kg': r.lossKg, Detail: `${r.lossPct}% unaccounted; ${r.milledYieldPct}% milled rice yield` });
    for (const g of await this.prisma.goodsReceipt.findMany({ where: { ...s, status: 'CONFIRMED', rejectedKg: { gt: 0 }, ...rangeWhere('receivedAt', f) }, select: { reference: true, receivedAt: true, rejectedKg: true, inspectionNotes: true } })) out.push({ Date: dayStr(g.receivedAt), Kind: 'Rejected at receiving', Reference: g.reference, 'Quantity kg': g.rejectedKg, Detail: g.inspectionNotes ?? '' });
    for (const a of await this.prisma.stockLedgerEntry.findMany({ where: { batch: s, type: { in: ['ADJUSTMENT', 'WRITE_OFF'] }, reversalOfId: null, ...rangeWhere('createdAt', f) }, include: { batch: { select: { reference: true } } } })) out.push({ Date: dayStr(a.createdAt), Kind: a.type === 'WRITE_OFF' ? 'Written off' : 'Manual adjustment', Reference: a.batch.reference, 'Quantity kg': a.quantityKg, Detail: a.reason ?? '' });
    for (const t of await this.prisma.stockTransfer.findMany({ where: { ...s, status: 'RECEIVED', ...rangeWhere('sentAt', f) } })) if ((t.receivedKg ?? t.quantityKg) < t.quantityKg) out.push({ Date: dayStr(t.receivedAt), Kind: 'Transfer arrived short', Reference: t.reference, 'Quantity kg': r3(t.quantityKg - (t.receivedKg ?? 0)), Detail: t.note ?? '' });
    for (const h of await this.harvests.list(actor, f)) if (h.position.lostInTransitKg > 0 && h.position.transportedKg > 0) out.push({ Date: dayStr(h.harvestDate), Kind: 'Harvest lost in transit', Reference: h.reference, 'Quantity kg': h.position.lostInTransitKg, Detail: `${h.position.transportedKg} kg sent, ${h.position.receivedKg} kg received` });
    for (const o of await this.prisma.opsOrder.findMany({ where: { ...s, fulfilState: 'SHORTAGE' }, select: { reference: true, shortageNote: true, updatedAt: true } })) out.push({ Date: dayStr(o.updatedAt), Kind: 'Order short of stock', Reference: o.reference, 'Quantity kg': '', Detail: o.shortageNote ?? '' });
    return out.sort((a, b) => String(b.Date).localeCompare(String(a.Date)));
  }
}
