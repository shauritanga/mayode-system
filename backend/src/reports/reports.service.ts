import { Injectable } from '@nestjs/common';
import { Prisma, PremiumFundEntryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePremiumFundEntryDto, DateRangeDto, ReportFilterDto } from './dto/reports.dto';

const YOUTH_MAX_AGE = 35; // Tanzania's national youth-age cap, matches the dashboard's youth breakdown

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(
    range: DateRangeDto,
    field: string,
  ): Prisma.Enumerable<Prisma.PaymentWhereInput> | undefined {
    const start = range.from ? new Date(range.from) : undefined;
    const end = range.to ? new Date(range.to) : undefined;
    if (!start && !end) return undefined;
    return [
      {
        [field]: {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {}),
        },
      } as Prisma.PaymentWhereInput,
    ];
  }

  /** Builds a Farmer where-clause from the shared docx filter set (region/district/ward/village/cooperative/officer/gender/youth). */
  private farmerFilterWhere(filter: ReportFilterDto): Prisma.FarmerWhereInput {
    const where: Prisma.FarmerWhereInput = {};
    if (filter.region) where.region = filter.region;
    if (filter.district) where.district = filter.district;
    if (filter.ward) where.ward = filter.ward;
    if (filter.village) where.village = filter.village;
    if (filter.mamcosId) where.mamcosId = filter.mamcosId;
    if (filter.fieldOfficerId) where.assignedOfficerId = filter.fieldOfficerId;
    if (filter.gender) where.gender = filter.gender;
    if (filter.youthOnly) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - YOUTH_MAX_AGE);
      where.dateOfBirth = { gte: cutoff };
    }
    return where;
  }

  private hasFarmerFilters(filter: ReportFilterDto): boolean {
    return !!(
      filter.region ||
      filter.district ||
      filter.ward ||
      filter.village ||
      filter.mamcosId ||
      filter.fieldOfficerId ||
      filter.gender ||
      filter.youthOnly
    );
  }

  async farmerPayments(range: ReportFilterDto) {
    const farmerFilter = this.hasFarmerFilters(range) ? this.farmerFilterWhere(range) : undefined;
    const [payments, revenues] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          ...(this.dateRange(range, 'createdAt') ? { AND: this.dateRange(range, 'createdAt') } : {}),
          ...(farmerFilter ? { farmer: farmerFilter } : {}),
        },
        include: {
          farmer: {
            select: {
              id: true,
              controlNumber: true,
              firstName: true,
              lastName: true,
            },
          },
          sale: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.revenue.findMany({
        where: {
          ...(range.from || range.to
            ? {
                saleDate: {
                  ...(range.from ? { gte: new Date(range.from) } : {}),
                  ...(range.to ? { lte: new Date(range.to) } : {}),
                },
              }
            : {}),
          ...(range.season || range.riceVariety || farmerFilter
            ? {
                cropCycle: {
                  ...(range.season ? { season: range.season } : {}),
                  ...(range.riceVariety ? { riceVariety: range.riceVariety } : {}),
                  ...(farmerFilter ? { farmer: farmerFilter } : {}),
                },
              }
            : {}),
        },
        include: {
          cropCycle: {
            select: {
              farmer: {
                select: {
                  id: true,
                  controlNumber: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
    ]);
    const rows = new Map<
      string,
      {
        farmerId: string;
        controlNumber: string;
        farmer: string;
        revenueAmount: number;
        revenuePremium: number;
        paymentGross: number;
        loanDeduction: number;
        netAmount: number;
        paymentCount: number;
        paidPaymentCount: number;
      }
    >();
    const row = (farmer: {
      id: string;
      controlNumber: string;
      firstName: string;
      lastName: string;
    }) =>
      rows.get(farmer.id) ??
      (rows.set(farmer.id, {
        farmerId: farmer.id,
        controlNumber: farmer.controlNumber,
        farmer: `${farmer.firstName} ${farmer.lastName}`,
        revenueAmount: 0,
        revenuePremium: 0,
        paymentGross: 0,
        loanDeduction: 0,
        netAmount: 0,
        paymentCount: 0,
        paidPaymentCount: 0,
      }),
      rows.get(farmer.id)!);
    for (const payment of payments) {
      const item = row(payment.farmer);
      item.paymentGross += payment.amount;
      item.loanDeduction += payment.loanDeduction ?? 0;
      item.netAmount += payment.netAmount ?? payment.amount;
      item.paymentCount += 1;
      if (payment.paidAt) item.paidPaymentCount += 1;
    }
    for (const revenue of revenues) {
      const item = row(revenue.cropCycle.farmer);
      item.revenueAmount += revenue.totalRevenue;
      item.revenuePremium += revenue.fairtradePremium ?? 0;
    }
    return [...rows.values()].sort((a, b) => a.farmer.localeCompare(b.farmer));
  }

  async premiumFund(range: DateRangeDto) {
    const entries = await this.prisma.premiumFundEntry.findMany({
      where:
        range.from || range.to
          ? {
              entryDate: {
                ...(range.from ? { gte: new Date(range.from) } : {}),
                ...(range.to ? { lte: new Date(range.to) } : {}),
              },
            }
          : undefined,
      include: { sale: { select: { invoiceNumber: true } } },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    });
    let balance = 0;
    return entries.map((entry) => {
      balance +=
        entry.entryType === PremiumFundEntryType.INCOME
          ? entry.amount
          : -entry.amount;
      return {
        id: entry.id,
        entryDate: entry.entryDate.toISOString(),
        type: entry.entryType,
        amount: entry.amount,
        description: entry.description,
        invoiceNumber: entry.sale?.invoiceNumber ?? '',
        runningBalance: balance,
      };
    });
  }

  createPremiumExpense(dto: CreatePremiumFundEntryDto) {
    return this.prisma.premiumFundEntry.create({
      data: {
        entryType: dto.entryType,
        amount: dto.amount,
        description: dto.description,
        entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
      },
    });
  }

  async kpis() {
    const [farm, yields, revenue, farmerCount, premium] = await Promise.all([
      this.prisma.farm.aggregate({ _sum: { socialHectares: true } }),
      this.prisma.cropCycle.aggregate({ _sum: { actualYieldKg: true } }),
      this.prisma.revenue.aggregate({
        _sum: { totalRevenue: true, fairtradePremium: true },
      }),
      this.prisma.farmer.count(),
      this.premiumFund({}),
    ]);
    const hectares = farm._sum.socialHectares ?? 0;
    const totalYieldKg = yields._sum.actualYieldKg ?? 0;
    const premiumFundBalance = premium.length
      ? premium[premium.length - 1].runningBalance
      : 0;
    return {
      totalFarmers: farmerCount,
      totalHectares: hectares,
      totalYieldKg,
      averageYieldPerHectare: hectares ? totalYieldKg / hectares : 0,
      totalRevenue: revenue._sum.totalRevenue ?? 0,
      fairtradePremiumEarned: revenue._sum.fairtradePremium ?? 0,
      premiumFundBalance,
    };
  }

  async impactReport() {
    const [kpis, memberships, projects, revenues] = await Promise.all([
      this.kpis(),
      this.prisma.membership.findMany({ select: { createdAt: true } }),
      this.prisma.communityProject.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.revenue.findMany({
        select: {
          saleDate: true,
          totalRevenue: true,
          fairtradePremium: true,
          cropCycle: { select: { farmerId: true } },
        },
      }),
    ]);
    const month = (date: Date) =>
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const income = new Map<
      string,
      { totalIncome: number; farmers: Set<string> }
    >();
    for (const revenue of revenues) {
      const period = month(revenue.saleDate);
      const row = income.get(period) ?? {
        totalIncome: 0,
        farmers: new Set<string>(),
      };
      row.totalIncome += revenue.totalRevenue + (revenue.fairtradePremium ?? 0);
      row.farmers.add(revenue.cropCycle.farmerId);
      income.set(period, row);
    }
    const membershipsByMonth = new Map<string, number>();
    for (const membership of memberships) {
      const period = month(membership.createdAt);
      membershipsByMonth.set(period, (membershipsByMonth.get(period) ?? 0) + 1);
    }
    let cumulative = 0;
    const membershipGrowth = [...membershipsByMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, newMembers]) => ({
        period,
        newMembers,
        cumulativeMembers: (cumulative += newMembers),
      }));
    const farmerIncomeOverTime = [...income.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, row]) => ({
        period,
        totalIncome: row.totalIncome,
        farmerCount: row.farmers.size,
        averageFarmerIncome: row.farmers.size
          ? row.totalIncome / row.farmers.size
          : 0,
      }));
    return {
      ...kpis,
      membershipCount: memberships.length,
      averageFarmerIncome: kpis.totalFarmers
        ? kpis.totalRevenue / kpis.totalFarmers
        : 0,
      farmerIncomeOverTime,
      membershipGrowth,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        fundingSource: project.fundingSource,
        budget: project.budget,
        spentAmount: project.spentAmount,
        status: project.status,
        milestones: project.milestones,
      })),
    };
  }

  async flocertAuditPack(range: DateRangeDto) {
    const saleDate =
      range.from || range.to
        ? {
            ...(range.from ? { gte: new Date(range.from) } : {}),
            ...(range.to ? { lte: new Date(range.to) } : {}),
          }
        : undefined;
    const capturedAt =
      range.from || range.to
        ? {
            ...(range.from ? { gte: new Date(range.from) } : {}),
            ...(range.to ? { lte: new Date(range.to) } : {}),
          }
        : undefined;

    const [
      kpis,
      farmerPayments,
      premiumFund,
      sales,
      auditLogs,
      consentCount,
      questionnaireCount,
      pendingCalendarTasks,
      incompleteHarvestQuality,
      governance,
      partnerApiRequests,
    ] = await Promise.all([
      this.kpis(),
      this.farmerPayments(range),
      this.premiumFund(range),
      this.prisma.sale.findMany({
        where: saleDate ? { saleDate } : undefined,
        include: {
          buyer: {
            select: {
              name: true,
              fairtradeCertNumber: true,
              isCertified: true,
            },
          },
          lot: {
            include: {
              inventoryRecords: {
                include: {
                  farmer: {
                    select: {
                      controlNumber: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                  farm: { select: { farmCode: true, isVerified: true } },
                  cropCycle: {
                    select: {
                      season: true,
                      riceVariety: true,
                      harvestDate: true,
                    },
                  },
                },
              },
            },
          },
          apportionments: {
            include: {
              farmer: {
                select: {
                  controlNumber: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { saleDate: 'desc' },
        take: 50,
      }),
      this.prisma.auditLog.findMany({
        where: capturedAt ? { createdAt: capturedAt } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.consentRecord.count({
        where: capturedAt ? { capturedAt } : undefined,
      }),
      this.prisma.farmerQuestionnaire.count({
        where: capturedAt ? { capturedAt } : undefined,
      }),
      this.prisma.riceCalendarTask.count({
        where: {
          status: { not: 'COMPLETED' },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.harvestQualityCheck.count({
        where: {
          OR: [
            { harvestMaturityPct: null },
            { panicleMoisturePct: null },
            { dryingMoisturePct: null },
            { dryingMoisturePct: { gt: 14 } },
            { bagCount: null },
            { bagWeightKg: null },
            { warehouseReceivedAt: null },
          ],
        },
      }),
      Promise.all([
        this.prisma.meetingRecord.count(),
        this.prisma.vote.count(),
        this.prisma.voteResponse.count(),
        this.prisma.communityProject.count(),
      ]),
      this.prisma.partnerApiRequest.count({
        where: capturedAt ? { createdAt: capturedAt } : undefined,
      }),
    ]);

    const traceability = sales.map((sale) => ({
      invoiceNumber: sale.invoiceNumber,
      saleDate: sale.saleDate,
      buyer: sale.buyer,
      lotNumber: sale.lot.lotNumber,
      quantityKg: sale.quantityKg,
      totalRevenue: sale.totalRevenue,
      fairtradePremium: sale.fairtradePremium ?? 0,
      sourceInventoryCount: sale.lot.inventoryRecords.length,
      sourceFarmers: sale.apportionments.map((apportionment) => ({
        controlNumber: apportionment.farmer.controlNumber,
        farmer: `${apportionment.farmer.firstName} ${apportionment.farmer.lastName}`,
        quantityKg: apportionment.quantityKg,
        grossAmount: apportionment.grossAmount,
        fairtradePremium: apportionment.fairtradePremium,
      })),
      sourceLots: sale.lot.inventoryRecords.map((record) => ({
        trackingCode: record.trackingCode,
        farmCode: record.farm.farmCode,
        farmVerified: record.farm.isVerified,
        farmerControlNumber: record.farmer.controlNumber,
        farmer: `${record.farmer.firstName} ${record.farmer.lastName}`,
        cropSeason: record.cropCycle?.season ?? null,
        riceVariety: record.cropCycle?.riceVariety ?? null,
        harvestDate: record.cropCycle?.harvestDate ?? null,
        weightKg: record.weightKg,
        receivedDate: record.receivedDate,
      })),
    }));

    return {
      generatedAt: new Date().toISOString(),
      period: { from: range.from ?? null, to: range.to ?? null },
      kpis,
      payments: {
        rows: farmerPayments,
        totalGross: farmerPayments.reduce((sum, row) => sum + row.paymentGross, 0),
        totalLoanDeductions: farmerPayments.reduce(
          (sum, row) => sum + row.loanDeduction,
          0,
        ),
        totalNetPaid: farmerPayments.reduce((sum, row) => sum + row.netAmount, 0),
      },
      premiumFund: {
        entries: premiumFund,
        balance: premiumFund.length
          ? premiumFund[premiumFund.length - 1].runningBalance
          : 0,
      },
      traceability,
      governance: {
        meetingCount: governance[0],
        voteCount: governance[1],
        voteResponseCount: governance[2],
        communityProjectCount: governance[3],
      },
      trustEvidence: {
        consentRecordCount: consentCount,
        questionnaireCount,
        auditLogSampleCount: auditLogs.length,
        partnerApiRequestCount: partnerApiRequests,
        recentAuditLogs: auditLogs.map((log) => ({
          id: log.id,
          action: log.action,
          entityType: log.entityType,
          entityId: log.entityId,
          userId: log.userId,
          createdAt: log.createdAt,
          ipAddress: log.ipAddress,
        })),
      },
      complianceGaps: {
        overdueRiceCalendarTasks: pendingCalendarTasks,
        incompleteHarvestQualityChecks: incompleteHarvestQuality,
        uncertifiedBuyerSales: traceability.filter(
          (sale) => !sale.buyer.isCertified,
        ).length,
        unverifiedSourceFarms: traceability.reduce(
          (sum, sale) =>
            sum + sale.sourceLots.filter((lot) => !lot.farmVerified).length,
          0,
        ),
      },
    };
  }

  async membershipGrowth() {
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - 30);
    const previousStart = new Date(currentStart);
    previousStart.setDate(currentStart.getDate() - 30);
    const [current, previous] = await Promise.all([
      this.prisma.membership.count({
        where: { createdAt: { gte: currentStart, lte: now } },
      }),
      this.prisma.membership.count({
        where: { createdAt: { gte: previousStart, lt: currentStart } },
      }),
    ]);
    return {
      newMembers: current,
      previousPeriodMembers: previous,
      membershipGrowthPercent: previous
        ? ((current - previous) / previous) * 100
        : current
          ? 100
          : 0,
    };
  }

  async farmersExport(filter: ReportFilterDto = {}) {
    const where: Prisma.FarmerWhereInput = {
      ...this.farmerFilterWhere(filter),
      ...(filter.from || filter.to
        ? {
            membershipDate: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
    };
    const farmers = await this.prisma.farmer.findMany({
      where,
      include: {
        user: { select: { phone: true } },
        mamcos: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return farmers.map((f) => ({
      controlNumber: f.controlNumber,
      firstName: f.firstName,
      lastName: f.lastName,
      phone: f.user.phone,
      village: f.village ?? '',
      district: f.district ?? '',
      region: f.region ?? '',
      cooperative: f.mamcos?.name ?? '',
      verificationStatus: f.verificationStatus,
      membershipDate: f.membershipDate.toISOString(),
    }));
  }
  async cropCyclesExport(filter: ReportFilterDto = {}) {
    const farmerFilter = this.hasFarmerFilters(filter) ? this.farmerFilterWhere(filter) : undefined;
    const where: Prisma.CropCycleWhereInput = {
      ...(filter.season ? { season: filter.season } : {}),
      ...(filter.riceVariety ? { riceVariety: filter.riceVariety } : {}),
      ...(farmerFilter ? { farmer: farmerFilter } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
    };
    const cycles = await this.prisma.cropCycle.findMany({
      where,
      include: {
        farm: { select: { farmCode: true } },
        farmer: {
          select: { controlNumber: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return cycles.map((c) => ({
      farmCode: c.farm.farmCode,
      farmerControlNumber: c.farmer.controlNumber,
      farmer: `${c.farmer.firstName} ${c.farmer.lastName}`,
      season: c.season,
      riceVariety: c.riceVariety ?? '',
      plantingDate: c.plantingDate?.toISOString() ?? '',
      harvestDate: c.harvestDate?.toISOString() ?? '',
      actualYieldKg: c.actualYieldKg ?? 0,
      status: c.status,
    }));
  }

  /** Named report: field-officer performance (visits, farms mapped, farmers verified, activities logged). */
  async fieldOfficerPerformance() {
    const [officers, visits, verifications, activityLogs, farmers] = await Promise.all([
      this.prisma.mamcosStaff.findMany({
        where: { role: 'FIELD_OFFICER' },
        select: { id: true, firstName: true, lastName: true, employeeCode: true, mamcos: { select: { name: true } } },
      }),
      this.prisma.fieldOfficerVisit.findMany({ select: { fieldOfficerId: true } }),
      this.prisma.farmVerification.findMany({ select: { fieldOfficerId: true, gpsVerified: true } }),
      this.prisma.activityLog.findMany({ select: { fieldOfficerId: true } }),
      this.prisma.farmer.findMany({ select: { verifiedById: true, assignedOfficerId: true, verificationStatus: true } }),
    ]);
    const count = (rows: { key: string | null | undefined }[]) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        if (!row.key) continue;
        map.set(row.key, (map.get(row.key) ?? 0) + 1);
      }
      return map;
    };
    const visitCounts = count(visits.map((v) => ({ key: v.fieldOfficerId })));
    const farmsMapped = count(verifications.map((v) => ({ key: v.fieldOfficerId })));
    const gpsVerifiedCounts = count(
      verifications.filter((v) => v.gpsVerified).map((v) => ({ key: v.fieldOfficerId })),
    );
    const activityCounts = count(activityLogs.map((a) => ({ key: a.fieldOfficerId })));
    const farmersVerifiedCounts = count(farmers.map((f) => ({ key: f.verifiedById })));
    const pendingTaskCounts = count(
      farmers
        .filter((f) => f.assignedOfficerId && f.verificationStatus === 'PENDING')
        .map((f) => ({ key: f.assignedOfficerId })),
    );
    return officers.map((officer) => {
      const mapped = farmsMapped.get(officer.id) ?? 0;
      const gpsVerified = gpsVerifiedCounts.get(officer.id) ?? 0;
      return {
        officerId: officer.id,
        employeeCode: officer.employeeCode ?? '',
        officer: `${officer.firstName} ${officer.lastName}`,
        cooperative: officer.mamcos?.name ?? '',
        visitsCompleted: visitCounts.get(officer.id) ?? 0,
        farmsMapped: mapped,
        gpsVerifiedPct: mapped ? Math.round((gpsVerified / mapped) * 100) : 0,
        farmersVerified: farmersVerifiedCounts.get(officer.id) ?? 0,
        activitiesLogged: activityCounts.get(officer.id) ?? 0,
        pendingTasks: pendingTaskCounts.get(officer.id) ?? 0,
      };
    });
  }

  /** Named report: insurance coverage, wraps InsuranceService.coverageSummary() to make it exportable. */
  async insuranceCoverage() {
    const [policies, claims] = await Promise.all([
      this.prisma.insurancePolicy.groupBy({
        by: ['status', 'productType'],
        _count: { _all: true },
        _sum: { sumInsured: true, premiumAmount: true },
      }),
      this.prisma.insuranceClaim.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { claimedAmount: true, paidAmount: true },
      }),
    ]);
    return [
      ...policies.map((row) => ({
        recordType: 'POLICY',
        status: row.status,
        productType: row.productType,
        count: row._count._all,
        totalSumInsured: row._sum.sumInsured ?? 0,
        totalPremium: row._sum.premiumAmount ?? 0,
      })),
      ...claims.map((row) => ({
        recordType: 'CLAIM',
        status: row.status,
        productType: '',
        count: row._count._all,
        totalClaimed: row._sum.claimedAmount ?? 0,
        totalPaid: row._sum.paidAmount ?? 0,
      })),
    ];
  }

  /** Named report: gender / youth inclusion breakdown. */
  async genderYouthInclusion(filter: ReportFilterDto = {}) {
    const where = this.farmerFilterWhere({ ...filter, gender: undefined, youthOnly: undefined });
    const farmers = await this.prisma.farmer.findMany({
      where,
      select: { gender: true, dateOfBirth: true, region: true, district: true },
    });
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - YOUTH_MAX_AGE);
    const rows = new Map<string, { gender: string; ageGroup: string; count: number }>();
    for (const farmer of farmers) {
      const gender = farmer.gender ?? 'UNKNOWN';
      const ageGroup = farmer.dateOfBirth && farmer.dateOfBirth >= cutoff ? 'YOUTH (<=35)' : 'ADULT (36+)';
      const key = `${gender}::${ageGroup}`;
      const row = rows.get(key) ?? { gender, ageGroup, count: 0 };
      row.count += 1;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => a.gender.localeCompare(b.gender) || a.ageGroup.localeCompare(b.ageGroup));
  }
}
