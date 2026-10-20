import { Injectable } from '@nestjs/common';
import { CropCycleStatus, OpsInvoiceStatus, Prisma } from '@prisma/client';
import { hasGrant } from '../auth/role-access';
import { OwnershipService } from '../common/ownership.service';
import type { RequestUser } from '../common/ownership.service';
import { PrismaService } from '../prisma/prisma.service';

const MONTHS = 12;

/** `YYYY-MM` keys for the last `count` months, oldest first. */
export function monthKeys(now: Date, count = MONTHS): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

const monthOf = (d: Date) => d.toISOString().slice(0, 7);
const round = (n: number, places = 1) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Read-only roll-up for the AI Insights page: harvest and yield, crop stages, advisories, and (only for
 * people who may see them) stock and sales. Every figure is confined to the caller's cooperative.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async overview(user: RequestUser) {
    const tenantId = this.ownership.resolveTenantMamcosId(user);
    const now = new Date();
    const months = monthKeys(now);
    const since = new Date(`${months[0]}-01T00:00:00.000Z`);

    const farmWhere: Prisma.FarmWhereInput = tenantId ? { mamcosId: tenantId } : {};
    const cycleWhere: Prisma.CropCycleWhereInput = tenantId ? { farm: { mamcosId: tenantId } } : {};
    const recordWhere: Prisma.AiIntegrationRecordWhereInput = {
      capturedAt: { gte: new Date(now.getTime() - 90 * 86_400_000) },
      ...(tenantId ? { farm: { mamcosId: tenantId } } : {}),
    };
    const scoped = tenantId ? { mamcosId: tenantId } : {};

    const [farmers, farms, hectares, cycleStages, harvested, harvestRows, overdueCycles, unverifiedFarms, records] =
      await Promise.all([
        this.prisma.farmer.count({ where: scoped }),
        this.prisma.farm.count({ where: farmWhere }),
        this.prisma.farm.aggregate({ where: farmWhere, _sum: { socialHectares: true } }),
        this.prisma.cropCycle.groupBy({ by: ['status'], where: cycleWhere, _count: { _all: true } }),
        this.prisma.cropCycle.findMany({
          where: { ...cycleWhere, actualYieldKg: { not: null }, harvestDate: { gte: since } },
          select: { actualYieldKg: true, areaPlantedHa: true },
        }),
        this.prisma.harvestRecord.findMany({
          where: { ...scoped, harvestDate: { gte: since } },
          select: { harvestDate: true, actualKg: true, estimatedKg: true },
        }),
        this.prisma.cropCycle.count({
          where: {
            ...cycleWhere,
            status: CropCycleStatus.ACTIVE,
            expectedHarvest: { lt: now },
          },
        }),
        this.prisma.farm.count({ where: { ...farmWhere, isVerified: false } }),
        this.prisma.aiIntegrationRecord.findMany({
          where: recordWhere,
          orderBy: { capturedAt: 'desc' },
          take: 200,
          select: { id: true, sourceType: true, capturedAt: true, recommendation: true, farm: { select: { farmCode: true } } },
        }),
      ]);

    // Harvest: estimated against actual by month.
    const harvestByMonth = new Map(months.map((m) => [m, { actualKg: 0, estimatedKg: 0 }]));
    for (const h of harvestRows) {
      const bucket = harvestByMonth.get(monthOf(h.harvestDate));
      if (!bucket) continue;
      bucket.actualKg += h.actualKg;
      bucket.estimatedKg += h.estimatedKg ?? 0;
    }
    const harvestSeries = months.map((month) => ({
      month,
      actualKg: round(harvestByMonth.get(month)!.actualKg),
      estimatedKg: round(harvestByMonth.get(month)!.estimatedKg),
    }));
    const harvestKg = harvestSeries.reduce((s, m) => s + m.actualKg, 0);

    // Yield per hectare across the harvested crop cycles that recorded an area.
    const withArea = harvested.filter((c) => (c.areaPlantedHa ?? 0) > 0);
    const areaHa = withArea.reduce((s, c) => s + (c.areaPlantedHa ?? 0), 0);
    const yieldKg = withArea.reduce((s, c) => s + (c.actualYieldKg ?? 0), 0);

    const severity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const r of records) {
      const s = (r.recommendation as { severity?: string } | null)?.severity;
      if (s === 'HIGH' || s === 'MEDIUM' || s === 'LOW') severity[s] += 1;
    }
    const latest = records
      .filter((r) => (r.recommendation as { summary?: string } | null)?.summary)
      .slice(0, 5)
      .map((r) => {
        const rec = r.recommendation as { summary: string; severity?: string };
        return {
          id: r.id,
          sourceType: r.sourceType,
          farmCode: r.farm?.farmCode ?? null,
          capturedAt: r.capturedAt,
          summary: rec.summary,
          severity: rec.severity ?? 'LOW',
        };
      });

    const result: Record<string, unknown> = {
      generatedAt: now.toISOString(),
      months,
      kpis: {
        farmers,
        farms,
        hectares: round(hectares._sum.socialHectares ?? 0),
        harvestKg: round(harvestKg),
        yieldKgPerHa: areaHa > 0 ? round(yieldKg / areaHa) : null,
      },
      harvestSeries,
      cropStages: cycleStages.map((s) => ({ status: s.status, count: s._count._all })),
      advisories: { severity, latest },
      attention: {
        overdueHarvests: overdueCycles,
        unverifiedFarms,
        highAdvisories: severity.HIGH,
      },
    };

    if (hasGrant(user, 'ops_stock', 'VIEW')) {
      result.stock = await this.stock(tenantId);
    }
    if (hasGrant(user, 'ops_payments', 'VIEW') || hasGrant(user, 'ops_orders', 'VIEW')) {
      const sales = await this.sales(tenantId, months, since, now);
      result.sales = sales;
      (result.attention as Record<string, unknown>).overdueInvoices = sales.overdue;
    }
    return result;
  }

  private async stock(tenantId: string | null) {
    const rows = await this.prisma.stockLedgerEntry.groupBy({
      by: ['warehouseId'],
      where: tenantId ? { batch: { mamcosId: tenantId } } : {},
      _sum: { quantityKg: true },
    });
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: rows.map((r) => r.warehouseId) } },
      select: { id: true, name: true },
    });
    const name = new Map(warehouses.map((w) => [w.id, w.name]));
    const byWarehouse = rows
      .map((r) => ({ warehouse: name.get(r.warehouseId) ?? 'Warehouse', kg: round(r._sum.quantityKg ?? 0) }))
      .filter((r) => r.kg > 0)
      .sort((a, b) => b.kg - a.kg);
    return { totalKg: round(byWarehouse.reduce((s, r) => s + r.kg, 0)), byWarehouse };
  }

  private async sales(tenantId: string | null, months: string[], since: Date, now: Date) {
    const where: Prisma.OpsInvoiceWhereInput = {
      ...(tenantId ? { mamcosId: tenantId } : {}),
      status: { not: OpsInvoiceStatus.VOID },
    };
    const invoices = await this.prisma.opsInvoice.findMany({
      where: { ...where, invoiceDate: { gte: since } },
      select: { invoiceDate: true, total: true, amountPaid: true },
    });
    const byMonth = new Map(months.map((m) => [m, { invoicedTzs: 0, collectedTzs: 0 }]));
    for (const i of invoices) {
      const bucket = byMonth.get(monthOf(i.invoiceDate));
      if (!bucket) continue;
      bucket.invoicedTzs += i.total;
      bucket.collectedTzs += i.amountPaid;
    }
    const series = months.map((month) => ({
      month,
      invoicedTzs: round(byMonth.get(month)!.invoicedTzs, 0),
      collectedTzs: round(byMonth.get(month)!.collectedTzs, 0),
    }));
    const open = await this.prisma.opsInvoice.findMany({
      where: { ...where, status: { in: [OpsInvoiceStatus.ISSUED, OpsInvoiceStatus.PARTIALLY_PAID] } },
      select: { total: true, amountPaid: true, dueDate: true },
    });
    const outstandingTzs = open.reduce((s, i) => s + (i.total - i.amountPaid), 0);
    const overdue = open.filter((i) => i.dueDate && i.dueDate < now).length;
    return {
      series,
      invoicedTzs: series.reduce((s, m) => s + m.invoicedTzs, 0),
      collectedTzs: series.reduce((s, m) => s + m.collectedTzs, 0),
      outstandingTzs: round(outstandingTzs, 0),
      overdue,
    };
  }
}
