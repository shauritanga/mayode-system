import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantOwner, tenantWhere, type TenantActor } from '../common/tenant';
import { monthKey, priceTrends } from './market-math';
import { RecordPriceDto } from './dto/market-price.dto';

const round = (n: number) => Math.round(n * 100) / 100;
const top = (map: Map<string, number>, limit = 8) =>
  [...map.entries()].map(([name, value]) => ({ name, value: round(value) })).sort((a, b) => b.value - a.value).slice(0, limit);
const add = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by);

interface Range { from?: string; to?: string }

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  private saleWhere(actor: TenantActor, r: Range): Prisma.SaleWhereInput {
    const to = r.to ? new Date(r.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    return {
      ...tenantWhere(actor),
      ...(r.from || to ? { saleDate: { ...(r.from ? { gte: new Date(r.from) } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
  }

  /** Platform prices are visible to everyone; a cooperative also sees its own. Super Admin sees all. */
  private priceWhere(actor: TenantActor): Prisma.MarketPriceWhereInput {
    if (actor.role === UserRole.SUPER_ADMIN) return {};
    return { mamcosId: { in: actor.mamcosId ? [null as unknown as string, actor.mamcosId] : [null as unknown as string] } };
  }

  // ---------- overview ----------

  async overview(actor: TenantActor, r: Range) {
    const [sales, buyers, orders, agreements, prices] = await Promise.all([
      this.prisma.sale.findMany({
        where: this.saleWhere(actor, r),
        select: {
          saleDate: true, quantityKg: true, totalRevenue: true, paymentReceived: true,
          riceVariety: true, buyer: { select: { name: true } },
        },
      }),
      this.prisma.buyer.count({ where: tenantWhere(actor) }),
      this.prisma.buyerOrder.findMany({
        where: tenantWhere(actor),
        select: { status: true, quantityRequiredKg: true, sales: { select: { quantityKg: true } } },
      }),
      this.prisma.purchaseAgreement.findMany({
        where: tenantWhere(actor),
        select: { status: true, quantityKg: true, endDate: true, sales: { select: { quantityKg: true } } },
      }),
      this.prisma.marketPrice.findMany({
        where: { ...this.priceWhere(actor), recordedAt: { gte: new Date(Date.now() - 180 * 86_400_000) } },
        orderBy: { recordedAt: 'asc' },
        select: { commodity: true, price: true, recordedAt: true },
      }),
    ]);

    const soldKg = sales.reduce((t, s) => t + s.quantityKg, 0);
    const salesValue = sales.reduce((t, s) => t + s.totalRevenue, 0);
    const paidValue = sales.filter((s) => s.paymentReceived).reduce((t, s) => t + s.totalRevenue, 0);
    const byMonth = new Map<string, number>();
    const byBuyer = new Map<string, number>();
    const byVariety = new Map<string, number>();
    for (const s of sales) {
      add(byMonth, monthKey(s.saleDate), s.totalRevenue);
      add(byBuyer, s.buyer.name, s.totalRevenue);
      add(byVariety, s.riceVariety ?? 'Unspecified', s.quantityKg);
    }
    const openOrders = orders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED');
    const activeAgreements = agreements.filter((a) => a.status === 'ACTIVE');
    const outstandingKg = (list: { quantityRequiredKg?: number; quantityKg?: number; sales: { quantityKg: number }[] }[]) =>
      list.reduce((t, x) => t + Math.max((x.quantityRequiredKg ?? x.quantityKg ?? 0) - x.sales.reduce((s, y) => s + y.quantityKg, 0), 0), 0);
    const now = Date.now();
    const trends = priceTrends(prices);
    const rice = trends.find((t) => /rice|paddy/i.test(t.commodity)) ?? trends[0];

    return {
      tiles: {
        buyers,
        openOrders: openOrders.length,
        riceRequiredKg: round(outstandingKg(openOrders)),
        activeAgreements: activeAgreements.length,
        committedKg: round(outstandingKg(activeAgreements)),
        expiringAgreements: activeAgreements.filter((a) => a.endDate.getTime() < now + 30 * 86_400_000).length,
        soldKg: round(soldKg),
        salesValue: round(salesValue),
        paidValue: round(paidValue),
        receivable: round(salesValue - paidValue),
        latestPrice: rice ? { commodity: rice.commodity, price: rice.latest, changePct: rice.changePct } : null,
      },
      salesByMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([name, value]) => ({ name, value: round(value) })),
      salesByBuyer: top(byBuyer),
      salesByVariety: top(byVariety),
      ordersByStatus: ['OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'].map((status) => ({
        name: status, value: orders.filter((o) => o.status === status).length,
      })),
    };
  }

  // ---------- deliveries (sales of rice to buyers) ----------

  async deliveries(actor: TenantActor, r: Range & { buyerId?: string }) {
    const sales = await this.prisma.sale.findMany({
      where: { ...this.saleWhere(actor, r), ...(r.buyerId ? { buyerId: r.buyerId } : {}) },
      include: {
        buyer: { select: { name: true } },
        agreement: { select: { reference: true } },
        saleOrder: { select: { reference: true, status: true } },
        dispatch: { select: { releasedAt: true } },
      },
      orderBy: { saleDate: 'desc' },
      take: 5000,
    });
    const rows = sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      saleDate: s.saleDate,
      buyer: s.buyer.name,
      variety: s.riceVariety,
      quantityKg: s.quantityKg,
      pricePerKg: s.pricePerKg,
      premium: s.fairtradePremium ?? 0,
      totalRevenue: s.totalRevenue,
      paymentReceived: s.paymentReceived,
      paymentDate: s.paymentDate,
      agreement: s.agreement?.reference ?? null,
      reservation: s.saleOrder?.reference ?? null,
      deliveryStatus: s.dispatch ? 'RELEASED' : (s.saleOrder?.status ?? null),
      releasedAt: s.dispatch?.releasedAt ?? null,
    }));
    return {
      summary: {
        count: rows.length,
        quantityKg: round(rows.reduce((t, x) => t + x.quantityKg, 0)),
        value: round(rows.reduce((t, x) => t + x.totalRevenue, 0)),
        paid: round(rows.filter((x) => x.paymentReceived).reduce((t, x) => t + x.totalRevenue, 0)),
        outstanding: round(rows.filter((x) => !x.paymentReceived).reduce((t, x) => t + x.totalRevenue, 0)),
      },
      rows,
    };
  }

  // ---------- farmer sales (each farmer's share of a cooperative sale) ----------

  async farmerSales(actor: TenantActor, r: Range) {
    const apportionments = await this.prisma.saleApportionment.findMany({
      where: { sale: this.saleWhere(actor, r) },
      include: {
        sale: { select: { id: true, invoiceNumber: true, saleDate: true, riceVariety: true, buyer: { select: { name: true } } } },
        farmer: { select: { id: true, controlNumber: true, firstName: true, lastName: true, village: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const payments = apportionments.length
      ? await this.prisma.payment.findMany({
          where: { saleId: { in: [...new Set(apportionments.map((a) => a.saleId))] } },
          select: { saleId: true, farmerId: true, status: true, netAmount: true, amount: true, paidAt: true },
        })
      : [];
    const payment = new Map(payments.map((p) => [`${p.saleId}:${p.farmerId}`, p]));
    const rows = apportionments.map((a) => {
      const p = payment.get(`${a.saleId}:${a.farmerId}`);
      const paid = p?.status === 'RELEASED' || p?.status === 'CLEARED';
      return {
        id: a.id,
        saleDate: a.sale.saleDate,
        invoiceNumber: a.sale.invoiceNumber,
        buyer: a.sale.buyer.name,
        variety: a.sale.riceVariety,
        farmer: `${a.farmer.firstName} ${a.farmer.lastName}`,
        controlNumber: a.farmer.controlNumber,
        village: a.farmer.village,
        quantityKg: round(a.quantityKg),
        grossAmount: round(a.grossAmount),
        premium: round(a.fairtradePremium),
        netPayable: p?.netAmount != null ? round(p.netAmount) : null,
        paymentStatus: p ? (paid ? 'PAID' : p.status) : 'NOT_STARTED',
        paidAt: p?.paidAt ?? null,
      };
    });
    return {
      summary: {
        count: rows.length,
        farmers: new Set(rows.map((x) => x.controlNumber)).size,
        quantityKg: round(rows.reduce((t, x) => t + x.quantityKg, 0)),
        gross: round(rows.reduce((t, x) => t + x.grossAmount, 0)),
        paid: round(rows.filter((x) => x.paymentStatus === 'PAID').reduce((t, x) => t + (x.netPayable ?? x.grossAmount), 0)),
        pending: rows.filter((x) => x.paymentStatus !== 'PAID').length,
      },
      rows,
    };
  }

  // ---------- market prices ----------

  async prices(actor: TenantActor, q: { commodity?: string; market?: string }) {
    const rows = await this.prisma.marketPrice.findMany({
      where: {
        ...this.priceWhere(actor),
        ...(q.commodity ? { commodity: { contains: q.commodity, mode: 'insensitive' } } : {}),
        ...(q.market ? { market: { contains: q.market, mode: 'insensitive' } } : {}),
      },
      orderBy: { recordedAt: 'desc' },
      take: 1000,
    });
    return {
      trends: priceTrends(rows),
      rows: rows.map((p) => ({ ...p, scope: p.mamcosId ? 'COOPERATIVE' : 'PLATFORM' })),
    };
  }

  recordPrice(dto: RecordPriceDto, actor: TenantActor) {
    return this.prisma.marketPrice.create({
      data: {
        commodity: dto.commodity.trim(),
        price: dto.price,
        market: dto.market?.trim() || null,
        source: dto.source?.trim() || null,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
        mamcosId: tenantOwner(actor),
      },
    });
  }
}
