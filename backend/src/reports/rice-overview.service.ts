import { Injectable } from '@nestjs/common';
import {
  CropCycleStatus,
  FarmingSeasonStatus,
  MamcosStaffRole,
  PolicyStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const YOUTH_MAX_AGE = 35; // matches ReportsService youth breakdown
const ACRES_PER_HECTARE = 2.47105;
const OFFICER_ACTIVE_WINDOW_DAYS = 30;
const UNSPECIFIED = 'Unspecified';

const AGE_BANDS = [
  { label: 'Under 25', max: 24 },
  { label: '25–35', max: 35 },
  { label: '36–45', max: 45 },
  { label: '46–55', max: 55 },
  { label: '56+', max: Infinity },
];

const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round((n || 0) * f) / f;
};

function ageOf(dob: Date, now: Date) {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function tally<T>(rows: T[], key: (row: T) => string | null | undefined) {
  const out = new Map<string, number>();
  for (const row of rows) {
    const k = key(row) || UNSPECIFIED;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

const sortedEntries = (m: Map<string, number>) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]);

/** Real-time rice-ecosystem overview behind the admin dashboard. */
@Injectable()
export class RiceOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(mamcosId?: string | null) {
    const now = new Date();
    const farmerWhere: Prisma.FarmerWhereInput = mamcosId ? { mamcosId } : {};
    const farmWhere: Prisma.FarmWhereInput = mamcosId ? { mamcosId } : {};
    const cycleWhere: Prisma.CropCycleWhereInput = mamcosId
      ? { farm: { mamcosId } }
      : {};
    const officerSince = new Date(
      now.getTime() - OFFICER_ACTIVE_WINDOW_DAYS * 86_400_000,
    );

    const [
      farmers,
      farms,
      plotCount,
      cycles,
      cooperativeCount,
      inventory,
      loans,
      policies,
      claims,
      seasons,
      officers,
      inputCosts,
      activeVisits,
    ] = await Promise.all([
      this.prisma.farmer.findMany({
        where: farmerWhere,
        select: {
          id: true,
          gender: true,
          dateOfBirth: true,
          district: true,
          verificationStatus: true,
        },
      }),
      this.prisma.farm.findMany({
        where: farmWhere,
        select: {
          id: true,
          region: true,
          socialHectares: true,
          isVerified: true,
        },
      }),
      this.prisma.plot.count({ where: { farm: farmWhere } }),
      this.prisma.cropCycle.findMany({
        where: cycleWhere,
        select: {
          farmId: true,
          season: true,
          riceVariety: true,
          status: true,
          estimatedYieldKg: true,
          actualYieldKg: true,
        },
      }),
      this.prisma.mamcos.count({
        where: { isActive: true, ...(mamcosId ? { id: mamcosId } : {}) },
      }),
      this.prisma.inventoryRecord.aggregate({
        where: { farm: farmWhere },
        _sum: { weightKg: true },
        _count: true,
      }),
      this.prisma.loanRecord.findMany({
        where: { farmer: farmerWhere },
        select: {
          farmerId: true,
          lenderName: true,
          originalAmount: true,
          amountOwed: true,
          isActive: true,
        },
      }),
      this.prisma.insurancePolicy.findMany({
        where: { farmer: farmerWhere },
        select: {
          farmerId: true,
          status: true,
          insuredAreaHectares: true,
          sumInsured: true,
          premiumAmount: true,
        },
      }),
      this.prisma.insuranceClaim.groupBy({
        by: ['status'],
        where: { policy: { farmer: farmerWhere } },
        _count: true,
        _sum: { claimedAmount: true, paidAmount: true },
      }),
      this.prisma.farmingSeason.findMany({
        where: mamcosId ? { OR: [{ mamcosId }, { mamcosId: null }] } : {},
        select: { name: true, status: true },
      }),
      this.prisma.mamcosStaff.findMany({
        where: {
          role: MamcosStaffRole.FIELD_OFFICER,
          user: { isActive: true },
          ...(mamcosId ? { mamcosId } : {}),
        },
        select: { id: true },
      }),
      this.prisma.inputCost.findMany({
        where: { cropCycle: cycleWhere },
        select: { category: true, paymentStatus: true, totalCost: true },
      }),
      this.prisma.fieldOfficerVisit.findMany({
        where: {
          visitedAt: { gte: officerSince },
          fieldOfficer: {
            role: MamcosStaffRole.FIELD_OFFICER,
            user: { isActive: true },
            ...(mamcosId ? { mamcosId } : {}),
          },
        },
        distinct: ['fieldOfficerId'],
        select: { fieldOfficerId: true },
      }),
    ]);

    // ── Farmers: gender, youth, age, district ──
    let male = 0;
    let female = 0;
    let otherGender = 0;
    let youth = 0;
    const bandCounts = AGE_BANDS.map(() => 0);
    let unknownAge = 0;
    for (const f of farmers) {
      if (f.gender === 'MALE') male += 1;
      else if (f.gender === 'FEMALE') female += 1;
      else otherGender += 1;
      if (!f.dateOfBirth) {
        unknownAge += 1;
        continue;
      }
      const age = ageOf(f.dateOfBirth, now);
      if (age <= YOUTH_MAX_AGE) youth += 1;
      const band = AGE_BANDS.findIndex((b) => age <= b.max);
      bandCounts[band] += 1;
    }
    const ageDistribution = AGE_BANDS.map((b, i) => ({
      label: b.label,
      count: bandCounts[i],
    }));
    if (unknownAge) ageDistribution.push({ label: 'Unknown', count: unknownAge });

    const farmersByDistrict = sortedEntries(tally(farmers, (f) => f.district)).map(
      ([district, count]) => ({ district, count }),
    );

    // ── Farms, plots, area ──
    const totalHectares = farms.reduce((s, f) => s + (f.socialHectares || 0), 0);
    const cultivatedFarmIds = new Set(
      cycles
        .filter((c) => c.status === CropCycleStatus.ACTIVE)
        .map((c) => c.farmId),
    );
    const cultivatedHectares = farms
      .filter((f) => cultivatedFarmIds.has(f.id))
      .reduce((s, f) => s + (f.socialHectares || 0), 0);
    const areaByRegion = new Map<string, { hectares: number; farms: number }>();
    for (const f of farms) {
      const key = f.region || UNSPECIFIED;
      const row = areaByRegion.get(key) ?? { hectares: 0, farms: 0 };
      row.hectares += f.socialHectares || 0;
      row.farms += 1;
      areaByRegion.set(key, row);
    }

    // ── Production ──
    const yieldOf = (c: (typeof cycles)[number]) =>
      c.actualYieldKg || c.estimatedYieldKg || 0;
    const pending = cycles.filter(
      (c) =>
        c.status === CropCycleStatus.ACTIVE ||
        c.status === CropCycleStatus.PLANNED,
    );
    const estimatedProductionKg = pending.reduce(
      (s, c) => s + (c.estimatedYieldKg || 0),
      0,
    );
    const harvestedKg = cycles.reduce((s, c) => s + (c.actualYieldKg || 0), 0);
    const bySeason = new Map<
      string,
      { estimatedKg: number; actualKg: number; cycles: number }
    >();
    const byVariety = new Map<string, number>();
    for (const c of cycles) {
      const s = bySeason.get(c.season) ?? { estimatedKg: 0, actualKg: 0, cycles: 0 };
      s.estimatedKg += c.estimatedYieldKg || 0;
      s.actualKg += c.actualYieldKg || 0;
      s.cycles += 1;
      bySeason.set(c.season, s);
      const v = c.riceVariety || UNSPECIFIED;
      byVariety.set(v, (byVariety.get(v) ?? 0) + yieldOf(c));
    }

    // ── Finance ──
    const borrowers = new Set(loans.map((l) => l.farmerId));
    const totalLent = loans.reduce((s, l) => s + l.originalAmount, 0);
    const totalOwed = loans.reduce((s, l) => s + l.amountOwed, 0);
    const totalRepaid = Math.max(totalLent - totalOwed, 0);
    const byLender = new Map<string, { lent: number; owed: number; loans: number }>();
    for (const l of loans) {
      const row = byLender.get(l.lenderName) ?? { lent: 0, owed: 0, loans: 0 };
      row.lent += l.originalAmount;
      row.owed += l.amountOwed;
      row.loans += 1;
      byLender.set(l.lenderName, row);
    }

    // ── Insurance ──
    const activePolicies = policies.filter((p) => p.status === PolicyStatus.ACTIVE);
    const insuredFarmers = new Set(activePolicies.map((p) => p.farmerId));
    const policyStatus = tally(policies, (p) => p.status);
    const insuredHectares = activePolicies.reduce(
      (s, p) => s + p.insuredAreaHectares,
      0,
    );

    // ── Input distribution ──
    const byCategory = new Map<string, { count: number; value: number }>();
    const inputPayment = new Map<string, { count: number; value: number }>();
    for (const i of inputCosts) {
      const c = byCategory.get(i.category) ?? { count: 0, value: 0 };
      c.count += 1;
      c.value += i.totalCost;
      byCategory.set(i.category, c);
      const p = inputPayment.get(i.paymentStatus) ?? { count: 0, value: 0 };
      p.count += 1;
      p.value += i.totalCost;
      inputPayment.set(i.paymentStatus, p);
    }

    const activeSeasons = seasons.filter(
      (s) =>
        s.status === FarmingSeasonStatus.ACTIVE ||
        s.status === FarmingSeasonStatus.HARVESTING,
    );

    return {
      generatedAt: now.toISOString(),
      kpis: {
        totalFarmers: farmers.length,
        verifiedFarmers: farmers.filter((f) => f.verificationStatus === 'VERIFIED')
          .length,
        maleFarmers: male,
        femaleFarmers: female,
        otherGenderFarmers: otherGender,
        youthFarmers: youth,
        youthMaxAge: YOUTH_MAX_AGE,
        totalFarms: farms.length,
        verifiedFarms: farms.filter((f) => f.isVerified).length,
        totalPlots: plotCount,
        totalHectares: round(totalHectares, 1),
        riceAreaUnderCultivationHa: round(cultivatedHectares, 1),
        activeCropSeasons: activeSeasons.length,
        activeCropCycles: cycles.filter((c) => c.status === CropCycleStatus.ACTIVE)
          .length,
        estimatedProductionKg: round(estimatedProductionKg),
        riceHarvestedKg: round(harvestedKg),
        riceAggregatedKg: round(inventory._sum.weightKg ?? 0),
        aggregationRecords: inventory._count,
        cooperatives: cooperativeCount,
        farmersAccessingFinance: borrowers.size,
        farmersInsured: insuredFarmers.size,
        activeFieldOfficers: officers.length,
        fieldOfficersWithRecentVisits: activeVisits.length,
        fieldOfficerWindowDays: OFFICER_ACTIVE_WINDOW_DAYS,
      },
      activeSeasonNames: activeSeasons.map((s) => s.name),
      charts: {
        farmersByDistrict,
        areaByRegion: [...areaByRegion.entries()]
          .map(([region, v]) => ({
            region,
            hectares: round(v.hectares, 1),
            farms: v.farms,
          }))
          .sort((a, b) => b.hectares - a.hectares),
        productionBySeason: [...bySeason.entries()]
          .map(([season, v]) => ({
            season,
            estimatedTons: round(v.estimatedKg / 1000, 1),
            actualTons: round(v.actualKg / 1000, 1),
            cycles: v.cycles,
          }))
          .sort((a, b) => a.season.localeCompare(b.season)),
        productionByVariety: sortedEntries(byVariety).map(([variety, kg]) => ({
          variety,
          tons: round(kg / 1000, 1),
        })),
        gender: [
          { label: 'Male', count: male },
          { label: 'Female', count: female },
          ...(otherGender ? [{ label: 'Not stated', count: otherGender }] : []),
        ],
        ageDistribution,
        inputDistribution: {
          byCategory: [...byCategory.entries()]
            .map(([category, v]) => ({ category, ...v, value: round(v.value) }))
            .sort((a, b) => b.value - a.value),
          byPaymentStatus: [...inputPayment.entries()].map(([status, v]) => ({
            status,
            ...v,
            value: round(v.value),
          })),
        },
        loanPerformance: {
          totalLent: round(totalLent),
          totalOwed: round(totalOwed),
          totalRepaid: round(totalRepaid),
          repaymentRatePct: totalLent ? round((totalRepaid / totalLent) * 100, 1) : 0,
          activeLoans: loans.filter((l) => l.isActive).length,
          totalLoans: loans.length,
          byLender: [...byLender.entries()]
            .map(([lender, v]) => ({
              lender,
              loans: v.loans,
              lent: round(v.lent),
              repaid: round(Math.max(v.lent - v.owed, 0)),
              owed: round(v.owed),
            }))
            .sort((a, b) => b.lent - a.lent),
        },
        insurance: {
          farmersCovered: insuredFarmers.size,
          coveragePct: farmers.length
            ? round((insuredFarmers.size / farmers.length) * 100, 1)
            : 0,
          insuredHectares: round(insuredHectares, 1),
          totalSumInsured: round(
            activePolicies.reduce((s, p) => s + p.sumInsured, 0),
          ),
          totalPremium: round(policies.reduce((s, p) => s + p.premiumAmount, 0)),
          policiesByStatus: [...policyStatus.entries()].map(([status, count]) => ({
            status,
            count,
          })),
          claimsByStatus: claims.map((c) => ({
            status: c.status,
            count: c._count,
            claimed: round(c._sum.claimedAmount ?? 0),
            paid: round(c._sum.paidAmount ?? 0),
          })),
        },
      },
    };
  }
}
