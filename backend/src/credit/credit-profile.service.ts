import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FarmersService } from '../farmers/farmers.service';
import type { RequestUser } from '../common/ownership.service';
import { ACRE_TO_HA } from '../reports/report-utils';
import { allocateRepayments, expectedOutcome, indicativeLimit } from './credit-math';

const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const SYSTEM: RequestUser = { id: 'credit-profile', role: UserRole.SUPER_ADMIN };

/** The Rice Farmer Credit Profile: everything a lender or officer needs to judge an application. */
@Injectable()
export class CreditProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly farmers: FarmersService,
  ) {}

  async build(farmerId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        user: { select: { phone: true } },
        mamcos: { select: { name: true } },
        farms: { select: { id: true, farmCode: true, name: true, village: true, socialHectares: true, actualAcres: true, _count: { select: { plots: true } } } },
        cropCycles: {
          orderBy: { createdAt: 'desc' },
          include: { farm: { select: { farmCode: true } }, costs: true, revenues: true },
        },
        loanRecords: { include: { instalments: true } },
        insurancePolicies: { include: { claims: { select: { claimedAmount: true, paidAmount: true } } } },
        memberships: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: { select: { name: true } } } },
      },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');

    const score = await this.farmers.getCreditReadiness(farmerId, SYSTEM);

    // ---- farm size ----
    const totalSocialHa = round(farmer.farms.reduce((t, f) => t + f.socialHectares, 0), 2);
    const totalMappedHa = round(farmer.farms.reduce((t, f) => t + (f.actualAcres ?? 0) * ACRE_TO_HA, 0), 2);

    // ---- production history & crop performance ----
    const production = farmer.cropCycles.map((c) => ({
      season: c.season,
      variety: c.riceVariety,
      farm: c.farm.farmCode,
      areaHa: c.areaPlantedHa,
      estimatedKg: c.estimatedYieldKg,
      actualKg: c.actualYieldKg,
      yieldPerHa: c.areaPlantedHa && c.actualYieldKg ? round(c.actualYieldKg / c.areaPlantedHa) : null,
      status: c.status,
    }));
    const harvested = farmer.cropCycles.filter((c) => (c.actualYieldKg ?? 0) > 0);
    const withEstimate = harvested.filter((c) => (c.estimatedYieldKg ?? 0) > 0);
    const estTotal = withEstimate.reduce((t, c) => t + (c.estimatedYieldKg ?? 0), 0);
    const actTotal = withEstimate.reduce((t, c) => t + (c.actualYieldKg ?? 0), 0);
    const history = farmer.cropCycles.map((c) => ({ areaHa: c.areaPlantedHa, yieldKg: c.actualYieldKg }));

    // ---- sales history ----
    const revenues = farmer.cropCycles.flatMap((c) => c.revenues.map((r) => ({ ...r, season: c.season })));
    const salesKg = revenues.reduce((t, r) => t + r.quantityKg, 0);
    const salesValue = revenues.reduce((t, r) => t + r.totalRevenue, 0);
    const bySeason = new Map<string, { kg: number; revenue: number }>();
    for (const r of revenues) {
      const s = bySeason.get(r.season) ?? { kg: 0, revenue: 0 };
      s.kg += r.quantityKg;
      s.revenue += r.totalRevenue;
      bySeason.set(r.season, s);
    }
    const realisedPrice = salesKg > 0 ? salesValue / salesKg : null;
    const marketPrice = realisedPrice
      ? null
      : (await this.prisma.marketPrice.findFirst({ where: { commodity: { contains: 'paddy', mode: 'insensitive' }, mamcosId: null }, orderBy: { recordedAt: 'desc' } }))?.price ?? null;

    // ---- input usage ----
    const costs = farmer.cropCycles.flatMap((c) => c.costs);
    const byCategory = new Map<string, number>();
    for (const c of costs) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.totalCost);

    // ---- repayment history ----
    const now = new Date();
    const loans = farmer.loanRecords.map((l) => {
      const repaid = Math.max(l.originalAmount - l.amountOwed, 0);
      const sched = allocateRepayments(l.instalments, repaid, now);
      return {
        id: l.id,
        lender: l.lenderName,
        original: round(l.originalAmount),
        outstanding: round(l.isActive ? l.amountOwed : 0),
        repaidPct: l.originalAmount > 0 ? Math.round((repaid / l.originalAmount) * 100) : 100,
        overdueInstalments: sched.overdueCount,
        overdueAmount: sched.overdueAmount,
        issued: l.createdAt,
        active: l.isActive && l.amountOwed > 0,
      };
    });
    const outstanding = loans.reduce((t, l) => t + l.outstanding, 0);

    // ---- insurance ----
    const active = farmer.insurancePolicies.filter((p) => p.status === 'ACTIVE');
    const claims = farmer.insurancePolicies.flatMap((p) => p.claims);

    // ---- outlook ----
    const outlook = expectedOutcome(totalSocialHa, history, realisedPrice ?? marketPrice);
    const membership = farmer.memberships[0];
    const memberYears = farmer.membershipDate ? round((now.getTime() - farmer.membershipDate.getTime()) / (365.25 * 86_400_000), 1) : null;

    return {
      generatedAt: now.toISOString(),
      farmer: {
        id: farmer.id,
        controlNumber: farmer.controlNumber,
        name: `${farmer.firstName} ${farmer.lastName}`,
        gender: farmer.gender,
        phone: farmer.user.phone,
        village: farmer.village,
        ward: farmer.ward,
        district: farmer.district,
        region: farmer.region,
        cooperative: farmer.mamcos?.name ?? null,
        verificationStatus: farmer.verificationStatus,
        experienceYears: farmer.farmingExperienceYears,
        isBlacklisted: farmer.isBlacklisted,
      },
      score: { value: score.creditScore, ready: score.creditReady, factors: score.factors },
      farmSize: {
        farms: farmer.farms.map((f) => ({ code: f.farmCode, name: f.name, village: f.village, socialHa: f.socialHectares, mappedHa: f.actualAcres != null ? round(f.actualAcres * ACRE_TO_HA, 2) : null, plots: f._count.plots })),
        totalSocialHa,
        totalMappedHa,
      },
      production,
      cropPerformance: {
        seasons: farmer.cropCycles.length,
        harvests: harvested.length,
        avgYieldPerHa: outlook.yieldPerHa,
        vsEstimatePct: estTotal > 0 ? round(((actTotal - estTotal) / estTotal) * 100, 1) : null,
      },
      sales: {
        totalKg: round(salesKg),
        totalValue: round(salesValue),
        avgPricePerKg: realisedPrice ? round(realisedPrice) : null,
        bySeason: [...bySeason.entries()].map(([season, v]) => ({ season, kg: round(v.kg), revenue: round(v.revenue) })),
      },
      membership: {
        isMember: !!farmer.mamcosId,
        cooperative: farmer.mamcos?.name ?? null,
        since: farmer.membershipDate,
        years: memberYears,
        plan: membership?.plan.name ?? null,
        status: membership?.status ?? null,
      },
      inputs: {
        totalCost: round(costs.reduce((t, c) => t + c.totalCost, 0)),
        onCredit: round(costs.filter((c) => c.loanRecordId).reduce((t, c) => t + c.totalCost, 0)),
        byCategory: [...byCategory.entries()].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total),
      },
      repayment: {
        loans,
        totalBorrowed: round(loans.reduce((t, l) => t + l.original, 0)),
        outstanding: round(outstanding),
        overdueAmount: round(loans.reduce((t, l) => t + l.overdueAmount, 0)),
        overdueInstalments: loans.reduce((t, l) => t + l.overdueInstalments, 0),
      },
      insurance: {
        activePolicies: active.length,
        sumInsured: round(active.reduce((t, p) => t + p.sumInsured, 0)),
        insuredHa: round(active.reduce((t, p) => t + p.insuredAreaHectares, 0), 2),
        claims: claims.length,
        claimsPaid: round(claims.reduce((t, c) => t + (c.paidAmount ?? 0), 0)),
      },
      outlook: {
        ...outlook,
        farmHa: totalSocialHa,
        indicativeLimit: indicativeLimit(outlook.expectedRevenue, outstanding),
        basis: realisedPrice ? 'Average price this farmer actually received' : marketPrice ? 'Latest recorded market price' : null,
      },
    };
  }
}
