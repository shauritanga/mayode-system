import { Injectable, NotFoundException } from '@nestjs/common';
import { MamcosStaffRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { FieldOfficersService } from '../field-officers/field-officers.service';
import { ReportFilterDto } from './dto/reports.dto';
import {
  ACRE_TO_HA,
  ageingBucket,
  ageYears,
  isYouth,
  iso,
  pct,
  round,
} from './report-utils';

export type ReportColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date';
export interface ReportColumn {
  key: string;
  label: string;
  type?: ReportColumnType;
}
export interface ReportTile {
  label: string;
  value: number | string;
  type?: ReportColumnType;
}
export interface ReportChart {
  title: string;
  type?: ReportColumnType;
  items: { name: string; value: number }[];
}
export interface ReportResult {
  key: string;
  title: string;
  description: string;
  generatedAt: string;
  truncated: boolean;
  summary: ReportTile[];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  chart?: ReportChart;
}

export type ReportFilterKey =
  | 'dateRange'
  | 'region'
  | 'district'
  | 'ward'
  | 'village'
  | 'mamcos'
  | 'officer'
  | 'season'
  | 'variety'
  | 'gender'
  | 'youth';

const ALL_FARMER: ReportFilterKey[] = [
  'dateRange', 'region', 'district', 'ward', 'village', 'mamcos', 'officer', 'season', 'variety', 'gender', 'youth',
];

export const REPORT_CATALOG: {
  key: string;
  title: string;
  description: string;
  group: 'Farmers & land' | 'Production' | 'Trade & finance' | 'Inclusion';
  filters: ReportFilterKey[];
}[] = [
  { key: 'farmer-registration', group: 'Farmers & land', title: 'Farmer registration', description: 'Every registered farmer with demographics, location, officer and verification status.', filters: ALL_FARMER },
  { key: 'farm-area', group: 'Farmers & land', title: 'Farm area', description: 'Farms with social and GPS-mapped area, grade, irrigation and plots.', filters: ['region', 'district', 'ward', 'village', 'mamcos', 'officer'] },
  { key: 'rice-production', group: 'Production', title: 'Rice production', description: 'Crop seasons with area planted, expected and actual harvest.', filters: ALL_FARMER },
  { key: 'yield', group: 'Production', title: 'Yield', description: 'Kilograms per hectare by season, variety and district, against the estimate.', filters: ALL_FARMER },
  { key: 'input-distribution', group: 'Production', title: 'Input distribution', description: 'Seed, fertiliser, chemicals and other inputs supplied, with cost and payment status.', filters: ALL_FARMER },
  { key: 'field-officer-performance', group: 'Farmers & land', title: 'Field-officer performance', description: 'Assignments, registrations, visits, pending tasks, data completeness and last sync per officer.', filters: ['region', 'district', 'mamcos', 'officer'] },
  { key: 'rice-aggregation', group: 'Trade & finance', title: 'Rice aggregation', description: 'Deliveries to collection centres and warehouses with price, value and farmer payment.', filters: ALL_FARMER },
  { key: 'sales', group: 'Trade & finance', title: 'Sales', description: 'Sales to buyers with quantity, price, premium and payment received.', filters: ['dateRange', 'mamcos', 'variety'] },
  { key: 'loan-portfolio', group: 'Trade & finance', title: 'Loan portfolio', description: 'Loans by farmer and lender with outstanding balance, repaid share and age.', filters: ALL_FARMER },
  { key: 'loan-repayment', group: 'Trade & finance', title: 'Loan repayment', description: 'Repayments deducted from farmer payouts, with payout status to the lender.', filters: ALL_FARMER },
  { key: 'insurance-coverage', group: 'Trade & finance', title: 'Insurance coverage', description: 'Policies with sum insured, premium and claims, plus the share of farmers covered.', filters: ALL_FARMER },
  { key: 'gender-youth-inclusion', group: 'Inclusion', title: 'Gender and youth inclusion', description: 'Farmers, active growers, area and production by gender and age group.', filters: ['region', 'district', 'ward', 'village', 'mamcos', 'officer', 'season', 'variety'] },
];

const MAX_ROWS = 20000;

const cols = (...defs: [string, string, ReportColumnType?][]): ReportColumn[] =>
  defs.map(([key, label, type]) => ({ key, label, type: type ?? 'text' }));

const sum = <T>(items: T[], pick: (item: T) => number | null | undefined) =>
  items.reduce((total, item) => total + (pick(item) ?? 0), 0);

function topItems(map: Map<string, number>, limit = 8): { name: string; value: number }[] {
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
const addTo = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by);

@Injectable()
export class AnalyticsReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly officers: FieldOfficersService,
  ) {}

  catalog() {
    return REPORT_CATALOG;
  }

  // ------------------------------------------------------------------
  // Shared filter builders
  // ------------------------------------------------------------------

  private range(f: ReportFilterDto): { gte?: Date; lte?: Date } | undefined {
    if (!f.from && !f.to) return undefined;
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    return { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) };
  }

  /** Farmer-side filters: location, cooperative, officer, gender, youth, and the season/variety a farmer grew. */
  private farmerWhere(f: ReportFilterDto): Prisma.FarmerWhereInput {
    const where: Prisma.FarmerWhereInput = {};
    if (f.region) where.region = f.region;
    if (f.district) where.district = f.district;
    if (f.ward) where.ward = f.ward;
    if (f.village) where.village = f.village;
    if (f.mamcosId) where.mamcosId = f.mamcosId;
    if (f.fieldOfficerId) where.assignedOfficerId = f.fieldOfficerId;
    if (f.gender) where.gender = f.gender;
    if (f.youthOnly) {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 35);
      where.dateOfBirth = { gte: cutoff };
    }
    return where;
  }

  /** Same as above plus the season/variety condition, for reports not already based on crop cycles. */
  private farmerWhereWithCrop(f: ReportFilterDto): Prisma.FarmerWhereInput {
    const where = this.farmerWhere(f);
    if (f.season || f.riceVariety) {
      where.cropCycles = {
        some: {
          ...(f.season ? { season: f.season } : {}),
          ...(f.riceVariety ? { riceVariety: f.riceVariety } : {}),
        },
      };
    }
    return where;
  }

  private cycleWhere(f: ReportFilterDto): Prisma.CropCycleWhereInput {
    const created = this.range(f);
    return {
      ...(f.season ? { season: f.season } : {}),
      ...(f.riceVariety ? { riceVariety: f.riceVariety } : {}),
      farmer: this.farmerWhere(f),
      ...(created ? { createdAt: created } : {}),
    };
  }

  private async officerNames(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map<string, string>();
    const staff = await this.prisma.mamcosStaff.findMany({
      where: { id: { in: unique } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
  }

  private result(
    key: string,
    base: { summary: ReportTile[]; columns: ReportColumn[]; rows: Record<string, unknown>[]; chart?: ReportChart },
    truncated = false,
  ): ReportResult {
    const meta = REPORT_CATALOG.find((r) => r.key === key)!;
    return {
      key,
      title: meta.title,
      description: meta.description,
      generatedAt: new Date().toISOString(),
      truncated,
      ...base,
    };
  }

  // ------------------------------------------------------------------
  // Dispatcher and filter options
  // ------------------------------------------------------------------

  async run(key: string, filter: ReportFilterDto, user: RequestUser): Promise<ReportResult> {
    switch (key) {
      case 'farmer-registration': return this.farmerRegistration(filter);
      case 'farm-area': return this.farmArea(filter);
      case 'rice-production': return this.riceProduction(filter);
      case 'yield': return this.yieldReport(filter);
      case 'input-distribution': return this.inputDistribution(filter);
      case 'field-officer-performance': return this.officerPerformance(filter, user);
      case 'rice-aggregation': return this.riceAggregation(filter);
      case 'sales': return this.sales(filter);
      case 'loan-portfolio': return this.loanPortfolio(filter);
      case 'loan-repayment': return this.loanRepayment(filter);
      case 'insurance-coverage': return this.insuranceCoverage(filter);
      case 'gender-youth-inclusion': return this.genderYouth(filter);
      default: throw new NotFoundException(`Unknown report: ${key}`);
    }
  }

  /** Rows keyed by column label, for CSV / Excel / PDF. */
  exportRows(report: ReportResult): Record<string, unknown>[] {
    return report.rows.map((row) =>
      Object.fromEntries(report.columns.map((c) => [c.label, row[c.key] ?? ''])),
    );
  }

  /** Values for the filter dropdowns, limited to the caller's cooperative. */
  async filterOptions(mamcosId: string | null) {
    const scope = mamcosId ? { mamcosId } : {};
    const [places, cooperatives, officers, seasons, varieties, catalogue] = await Promise.all([
      this.prisma.farmer.findMany({
        where: scope,
        distinct: ['region', 'district', 'ward', 'village'],
        select: { region: true, district: true, ward: true, village: true },
      }),
      this.prisma.mamcos.findMany({
        where: mamcosId ? { id: mamcosId } : {},
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.mamcosStaff.findMany({
        where: { role: MamcosStaffRole.FIELD_OFFICER, ...scope },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.cropCycle.findMany({
        where: { farm: scope },
        distinct: ['season'],
        select: { season: true },
        orderBy: { season: 'desc' },
      }),
      this.prisma.cropCycle.findMany({
        where: { riceVariety: { not: null }, farm: scope },
        distinct: ['riceVariety'],
        select: { riceVariety: true },
      }),
      this.prisma.riceVariety.findMany({ where: { isActive: true }, select: { name: true } }),
    ]);
    const varietyNames = new Set<string>(catalogue.map((v) => v.name));
    for (const v of varieties) if (v.riceVariety) varietyNames.add(v.riceVariety);
    return {
      places: places
        .filter((p) => p.region || p.district || p.ward || p.village)
        .map((p) => ({ region: p.region, district: p.district, ward: p.ward, village: p.village })),
      cooperatives,
      officers: officers.map((o) => ({ id: o.id, name: `${o.firstName} ${o.lastName}` })),
      seasons: seasons.map((s) => s.season),
      varieties: [...varietyNames].sort(),
    };
  }

  // ------------------------------------------------------------------
  // 1. Farmer registration
  // ------------------------------------------------------------------

  private async farmerRegistration(f: ReportFilterDto) {
    const joined = this.range(f);
    const farmers = await this.prisma.farmer.findMany({
      where: { ...this.farmerWhereWithCrop(f), ...(joined ? { membershipDate: joined } : {}) },
      include: { user: { select: { phone: true } }, mamcos: { select: { name: true } } },
      orderBy: { membershipDate: 'desc' },
      take: MAX_ROWS,
    });
    const names = await this.officerNames(farmers.map((x) => x.assignedOfficerId));
    const rows = farmers.map((x) => ({
      controlNumber: x.controlNumber,
      name: `${x.firstName} ${x.lastName}`,
      gender: x.gender ?? '',
      age: ageYears(x.dateOfBirth) ?? '',
      ageGroup: x.dateOfBirth ? (isYouth(x.dateOfBirth) ? 'Youth (≤35)' : 'Adult (36+)') : '',
      phone: x.user.phone,
      region: x.region ?? '',
      district: x.district ?? '',
      ward: x.ward ?? '',
      village: x.village ?? '',
      cooperative: x.mamcos?.name ?? '',
      officer: x.assignedOfficerId ? (names.get(x.assignedOfficerId) ?? '') : '',
      status: x.verificationStatus,
      registered: iso(x.membershipDate),
    }));
    const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;
    const byDistrict = new Map<string, number>();
    for (const r of rows) addTo(byDistrict, r.district || 'Unknown', 1);
    return this.result('farmer-registration', {
      summary: [
        { label: 'Farmers', value: rows.length, type: 'number' },
        { label: 'Verified', value: count((r) => r.status === 'VERIFIED'), type: 'number' },
        { label: 'Pending verification', value: count((r) => r.status === 'PENDING'), type: 'number' },
        { label: 'Women', value: pct(count((r) => r.gender === 'FEMALE'), rows.length), type: 'percent' },
        { label: 'Youth (≤35)', value: pct(count((r) => r.ageGroup.startsWith('Youth')), rows.length), type: 'percent' },
      ],
      columns: cols(
        ['controlNumber', 'Control no.'], ['name', 'Farmer'], ['gender', 'Gender'], ['age', 'Age', 'number'],
        ['ageGroup', 'Age group'], ['phone', 'Phone'], ['region', 'Region'], ['district', 'District'],
        ['ward', 'Ward'], ['village', 'Village'], ['cooperative', 'Cooperative'], ['officer', 'Field officer'],
        ['status', 'Status'], ['registered', 'Registered', 'date'],
      ),
      rows,
      chart: { title: 'Farmers by district', items: topItems(byDistrict) },
    }, farmers.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 2. Farm area
  // ------------------------------------------------------------------

  private async farmArea(f: ReportFilterDto) {
    const created = this.range(f);
    const farms = await this.prisma.farm.findMany({
      where: {
        ...(f.region ? { region: f.region } : {}),
        ...(f.district ? { district: f.district } : {}),
        ...(f.ward ? { ward: f.ward } : {}),
        ...(f.village ? { village: f.village } : {}),
        ...(f.mamcosId ? { mamcosId: f.mamcosId } : {}),
        ...(f.fieldOfficerId ? { assignedOfficerId: f.fieldOfficerId } : {}),
        ...(created ? { createdAt: created } : {}),
      },
      include: { mamcos: { select: { name: true } }, _count: { select: { plots: true } } },
      orderBy: { farmCode: 'asc' },
      take: MAX_ROWS,
    });
    const rows = farms.map((x) => ({
      farmCode: x.farmCode,
      name: x.name,
      cooperative: x.mamcos?.name ?? '',
      region: x.region ?? '',
      district: x.district ?? '',
      ward: x.ward ?? '',
      village: x.village ?? '',
      socialHa: round(x.socialHectares, 2),
      mappedHa: x.actualAcres != null ? round(x.actualAcres * ACRE_TO_HA, 2) : '',
      grade: x.grade,
      plots: x._count.plots,
      irrigation: x.hasIrrigation ? 'Yes' : 'No',
      verified: x.isVerified ? 'Yes' : 'No',
    }));
    const byDistrict = new Map<string, number>();
    for (const x of farms) addTo(byDistrict, x.district ?? 'Unknown', x.socialHectares);
    return this.result('farm-area', {
      summary: [
        { label: 'Farms', value: farms.length, type: 'number' },
        { label: 'Social hectares', value: round(sum(farms, (x) => x.socialHectares), 1), type: 'number' },
        { label: 'GPS-mapped hectares', value: round(sum(farms, (x) => (x.actualAcres ?? 0) * ACRE_TO_HA), 1), type: 'number' },
        { label: 'Verified farms', value: pct(farms.filter((x) => x.isVerified).length, farms.length), type: 'percent' },
        { label: 'With irrigation', value: pct(farms.filter((x) => x.hasIrrigation).length, farms.length), type: 'percent' },
      ],
      columns: cols(
        ['farmCode', 'Farm code'], ['name', 'Farm'], ['cooperative', 'Cooperative'], ['region', 'Region'],
        ['district', 'District'], ['ward', 'Ward'], ['village', 'Village'], ['socialHa', 'Social ha', 'number'],
        ['mappedHa', 'Mapped ha', 'number'], ['grade', 'Grade'], ['plots', 'Plots', 'number'],
        ['irrigation', 'Irrigation'], ['verified', 'Verified'],
      ),
      rows,
      chart: { title: 'Social hectares by district', type: 'number', items: topItems(byDistrict) },
    }, farms.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 3. Rice production
  // ------------------------------------------------------------------

  private async riceProduction(f: ReportFilterDto) {
    const cycles = await this.prisma.cropCycle.findMany({
      where: this.cycleWhere(f),
      include: {
        farm: { select: { farmCode: true, district: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const rows = cycles.map((c) => ({
      season: c.season,
      variety: c.riceVariety ?? '',
      farmer: `${c.farmer.firstName} ${c.farmer.lastName}`,
      controlNumber: c.farmer.controlNumber,
      farmCode: c.farm.farmCode,
      district: c.farm.district ?? '',
      areaHa: c.areaPlantedHa ?? '',
      planting: iso(c.plantingDate),
      expectedHarvest: iso(c.expectedHarvest),
      harvest: iso(c.harvestDate),
      estimatedKg: c.estimatedYieldKg ?? '',
      actualKg: c.actualYieldKg ?? '',
      stage: c.growthStage ?? '',
      status: c.status,
    }));
    const byVariety = new Map<string, number>();
    for (const c of cycles) addTo(byVariety, c.riceVariety ?? 'Unspecified', c.actualYieldKg ?? 0);
    return this.result('rice-production', {
      summary: [
        { label: 'Crop seasons', value: cycles.length, type: 'number' },
        { label: 'Area planted (ha)', value: round(sum(cycles, (c) => c.areaPlantedHa), 1), type: 'number' },
        { label: 'Estimated yield (kg)', value: round(sum(cycles, (c) => c.estimatedYieldKg)), type: 'number' },
        { label: 'Actual yield (kg)', value: round(sum(cycles, (c) => c.actualYieldKg)), type: 'number' },
        { label: 'Harvested', value: cycles.filter((c) => c.status === 'COMPLETED' || c.harvestDate).length, type: 'number' },
      ],
      columns: cols(
        ['season', 'Season'], ['variety', 'Variety'], ['farmer', 'Farmer'], ['controlNumber', 'Control no.'],
        ['farmCode', 'Farm'], ['district', 'District'], ['areaHa', 'Area (ha)', 'number'], ['planting', 'Planted', 'date'],
        ['expectedHarvest', 'Expected harvest', 'date'], ['harvest', 'Harvested', 'date'],
        ['estimatedKg', 'Estimated kg', 'number'], ['actualKg', 'Actual kg', 'number'], ['stage', 'Stage'], ['status', 'Status'],
      ),
      rows,
      chart: { title: 'Actual yield by variety (kg)', type: 'number', items: topItems(byVariety) },
    }, cycles.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 4. Yield
  // ------------------------------------------------------------------

  private async yieldReport(f: ReportFilterDto) {
    const cycles = await this.prisma.cropCycle.findMany({
      where: this.cycleWhere(f),
      select: {
        season: true,
        riceVariety: true,
        areaPlantedHa: true,
        estimatedYieldKg: true,
        actualYieldKg: true,
        farm: { select: { district: true } },
      },
      take: MAX_ROWS,
    });
    type Group = { season: string; variety: string; district: string; cycles: number; area: number; actual: number; estimated: number };
    const groups = new Map<string, Group>();
    let withoutArea = 0;
    let measured = 0;
    for (const c of cycles) {
      if (c.actualYieldKg == null) continue;
      if (!c.areaPlantedHa) {
        withoutArea += 1;
        continue;
      }
      measured += 1;
      const variety = c.riceVariety ?? 'Unspecified';
      const district = c.farm.district ?? 'Unknown';
      const key = `${c.season}|${variety}|${district}`;
      const g = groups.get(key) ?? { season: c.season, variety, district, cycles: 0, area: 0, actual: 0, estimated: 0 };
      g.cycles += 1;
      g.area += c.areaPlantedHa;
      g.actual += c.actualYieldKg;
      g.estimated += c.estimatedYieldKg ?? 0;
      groups.set(key, g);
    }
    const rows = [...groups.values()]
      .map((g) => ({
        season: g.season,
        variety: g.variety,
        district: g.district,
        cycles: g.cycles,
        areaHa: round(g.area, 2),
        actualKg: round(g.actual),
        yieldPerHa: g.area ? round(g.actual / g.area) : 0,
        estimatedPerHa: g.estimated && g.area ? round(g.estimated / g.area) : '',
        variancePct: g.estimated ? round(((g.actual - g.estimated) / g.estimated) * 100, 1) : '',
      }))
      .sort((a, b) => b.season.localeCompare(a.season) || a.variety.localeCompare(b.variety));
    const totalArea = sum(rows, (r) => r.areaHa);
    const totalKg = sum(rows, (r) => r.actualKg);
    const byVariety = new Map<string, { kg: number; ha: number }>();
    for (const r of rows) {
      const v = byVariety.get(r.variety) ?? { kg: 0, ha: 0 };
      v.kg += r.actualKg;
      v.ha += r.areaHa;
      byVariety.set(r.variety, v);
    }
    const chartMap = new Map<string, number>();
    for (const [name, v] of byVariety) chartMap.set(name, v.ha ? v.kg / v.ha : 0);
    return this.result('yield', {
      summary: [
        { label: 'Average yield (kg/ha)', value: totalArea ? round(totalKg / totalArea) : 0, type: 'number' },
        { label: 'Harvested area (ha)', value: round(totalArea, 1), type: 'number' },
        { label: 'Harvested (kg)', value: round(totalKg), type: 'number' },
        { label: 'Seasons measured', value: measured, type: 'number' },
        { label: 'Harvests missing area', value: withoutArea, type: 'number' },
      ],
      columns: cols(
        ['season', 'Season'], ['variety', 'Variety'], ['district', 'District'], ['cycles', 'Crop seasons', 'number'],
        ['areaHa', 'Area (ha)', 'number'], ['actualKg', 'Harvested kg', 'number'], ['yieldPerHa', 'Yield kg/ha', 'number'],
        ['estimatedPerHa', 'Estimated kg/ha', 'number'], ['variancePct', 'Vs estimate', 'percent'],
      ),
      rows,
      chart: { title: 'Average yield by variety (kg/ha)', type: 'number', items: topItems(chartMap) },
    });
  }

  // ------------------------------------------------------------------
  // 5. Input distribution
  // ------------------------------------------------------------------

  private async inputDistribution(f: ReportFilterDto) {
    const incurred = this.range(f);
    const inputs = await this.prisma.inputCost.findMany({
      where: {
        ...(incurred ? { dateIncurred: incurred } : {}),
        cropCycle: {
          ...(f.season ? { season: f.season } : {}),
          ...(f.riceVariety ? { riceVariety: f.riceVariety } : {}),
          farmer: this.farmerWhere(f),
        },
      },
      include: {
        cropCycle: {
          select: {
            season: true,
            farm: { select: { farmCode: true } },
            farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
          },
        },
        supplierRecord: { select: { name: true } },
      },
      orderBy: { dateIncurred: 'desc' },
      take: MAX_ROWS,
    });
    const rows = inputs.map((i) => ({
      date: iso(i.dateIncurred),
      category: i.category,
      item: i.itemName,
      quantity: i.quantity ?? '',
      unit: i.unit ?? '',
      unitPrice: i.unitPrice ?? '',
      totalCost: i.totalCost,
      supplier: i.supplierRecord?.name ?? i.supplier ?? '',
      farmer: `${i.cropCycle.farmer.firstName} ${i.cropCycle.farmer.lastName}`,
      controlNumber: i.cropCycle.farmer.controlNumber,
      farm: i.cropCycle.farm.farmCode,
      season: i.cropCycle.season,
      payment: i.paymentStatus,
      onCredit: i.loanRecordId ? 'Yes' : 'No',
    }));
    const byCategory = new Map<string, number>();
    for (const i of inputs) addTo(byCategory, i.category, i.totalCost);
    const farmers = new Set(inputs.map((i) => i.cropCycle.farmer.controlNumber));
    return this.result('input-distribution', {
      summary: [
        { label: 'Input records', value: inputs.length, type: 'number' },
        { label: 'Farmers supplied', value: farmers.size, type: 'number' },
        { label: 'Total cost (TZS)', value: round(sum(inputs, (i) => i.totalCost)), type: 'currency' },
        { label: 'Paid (TZS)', value: round(sum(inputs.filter((i) => i.paymentStatus === 'PAID'), (i) => i.totalCost)), type: 'currency' },
        { label: 'On credit (TZS)', value: round(sum(inputs.filter((i) => i.loanRecordId), (i) => i.totalCost)), type: 'currency' },
      ],
      columns: cols(
        ['date', 'Date', 'date'], ['category', 'Category'], ['item', 'Item'], ['quantity', 'Quantity', 'number'],
        ['unit', 'Unit'], ['unitPrice', 'Unit price', 'currency'], ['totalCost', 'Total cost', 'currency'],
        ['supplier', 'Supplier'], ['farmer', 'Farmer'], ['controlNumber', 'Control no.'], ['farm', 'Farm'],
        ['season', 'Season'], ['payment', 'Payment'], ['onCredit', 'On credit'],
      ),
      rows,
      chart: { title: 'Input cost by category (TZS)', type: 'currency', items: topItems(byCategory) },
    }, inputs.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 6. Field-officer performance (same figures as the Field Officers screen)
  // ------------------------------------------------------------------

  private async officerPerformance(f: ReportFilterDto, user: RequestUser) {
    let list = await this.officers.list(user);
    if (f.mamcosId) {
      const coop = await this.prisma.mamcos.findUnique({ where: { id: f.mamcosId }, select: { name: true } });
      list = list.filter((o) => o.cooperative === coop?.name);
    }
    if (f.fieldOfficerId) list = list.filter((o) => o.id === f.fieldOfficerId);
    if (f.region) list = list.filter((o) => o.region === f.region);
    if (f.district) list = list.filter((o) => o.district === f.district);
    const rows = list
      .map((o) => ({
        code: o.employeeCode ?? '',
        officer: `${o.firstName} ${o.lastName}`,
        phone: o.phone,
        cooperative: o.cooperative ?? '',
        region: o.region ?? '',
        district: o.district ?? '',
        farmersAssigned: o.farmersAssigned,
        farmsAssigned: o.farmsAssigned,
        farmersRegistered: o.farmersRegistered,
        farmsMapped: o.farmsMapped,
        visits: o.visitsCompleted,
        lastVisit: iso(o.lastVisitAt),
        cropRecords: o.cropRecordsUpdated,
        completeness: o.dataCompleteness ?? '',
        pendingTasks: o.pendingTasks,
        lastSync: iso(o.lastSyncAt),
        active: o.isActive ? 'Yes' : 'No',
      }))
      .sort((a, b) => b.visits - a.visits);
    const withScore = rows.filter((r) => r.completeness !== '');
    return this.result('field-officer-performance', {
      summary: [
        { label: 'Field officers', value: rows.length, type: 'number' },
        { label: 'Farmers assigned', value: sum(rows, (r) => r.farmersAssigned), type: 'number' },
        { label: 'Visits completed', value: sum(rows, (r) => r.visits), type: 'number' },
        { label: 'Pending tasks', value: sum(rows, (r) => r.pendingTasks), type: 'number' },
        {
          label: 'Avg data completeness',
          value: withScore.length ? Math.round(sum(withScore, (r) => Number(r.completeness)) / withScore.length) : 0,
          type: 'percent',
        },
      ],
      columns: cols(
        ['code', 'Code'], ['officer', 'Officer'], ['phone', 'Phone'], ['cooperative', 'Cooperative'], ['region', 'Region'],
        ['district', 'District'], ['farmersAssigned', 'Farmers assigned', 'number'], ['farmsAssigned', 'Farms assigned', 'number'],
        ['farmersRegistered', 'Farmers registered', 'number'], ['farmsMapped', 'Farms mapped', 'number'],
        ['visits', 'Visits', 'number'], ['lastVisit', 'Last visit', 'date'], ['cropRecords', 'Crop records updated', 'number'],
        ['completeness', 'Data completeness', 'percent'], ['pendingTasks', 'Pending tasks', 'number'],
        ['lastSync', 'Last sync', 'date'], ['active', 'Active'],
      ),
      rows,
      chart: {
        title: 'Visits completed by officer',
        type: 'number',
        items: rows.slice(0, 8).map((r) => ({ name: r.officer, value: r.visits })),
      },
    });
  }

  // ------------------------------------------------------------------
  // 7. Rice aggregation
  // ------------------------------------------------------------------

  private async riceAggregation(f: ReportFilterDto) {
    const received = this.range(f);
    const records = await this.prisma.inventoryRecord.findMany({
      where: {
        ...(received ? { receivedDate: received } : {}),
        ...(f.mamcosId ? { mamcosId: f.mamcosId } : {}),
        ...(f.riceVariety ? { riceVariety: f.riceVariety } : {}),
        ...(f.season ? { cropCycle: { season: f.season } } : {}),
        farmer: this.farmerWhere({ ...f, mamcosId: undefined }),
      },
      include: {
        farm: { select: { farmCode: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true, village: true } },
        collectionCentre: { select: { name: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { receivedDate: 'desc' },
      take: MAX_ROWS,
    });
    const rows = records.map((r) => ({
      received: iso(r.receivedDate),
      tracking: r.trackingCode,
      farmer: `${r.farmer.firstName} ${r.farmer.lastName}`,
      controlNumber: r.farmer.controlNumber,
      farm: r.farm.farmCode,
      village: r.farmer.village ?? '',
      centre: r.collectionCentre?.name ?? '',
      warehouse: r.warehouse?.name ?? r.warehouseLocation ?? '',
      variety: r.riceVariety ?? '',
      grade: r.qualityGrade ?? '',
      bags: r.bags ?? '',
      weightKg: r.weightKg,
      pricePerKg: r.pricePerKg ?? '',
      value: r.totalValue ?? '',
      paid: r.amountPaid,
      owed: r.totalValue != null ? round(Math.max(r.totalValue - r.amountPaid, 0)) : '',
      payment: r.farmerPaymentStatus,
      batch: r.batchNumber ?? '',
      lot: r.lotNumber ?? '',
      status: r.status,
    }));
    const byCentre = new Map<string, number>();
    for (const r of records) addTo(byCentre, r.collectionCentre?.name ?? 'No centre', r.weightKg);
    return this.result('rice-aggregation', {
      summary: [
        { label: 'Deliveries', value: records.length, type: 'number' },
        { label: 'Rice received (kg)', value: round(sum(records, (r) => r.weightKg)), type: 'number' },
        { label: 'Bags', value: sum(records, (r) => r.bags), type: 'number' },
        { label: 'Purchase value (TZS)', value: round(sum(records, (r) => r.totalValue)), type: 'currency' },
        { label: 'Paid to farmers (TZS)', value: round(sum(records, (r) => r.amountPaid)), type: 'currency' },
        {
          label: 'Owed to farmers (TZS)',
          value: round(sum(records, (r) => (r.totalValue != null ? Math.max(r.totalValue - r.amountPaid, 0) : 0))),
          type: 'currency',
        },
      ],
      columns: cols(
        ['received', 'Received', 'date'], ['tracking', 'Tracking code'], ['farmer', 'Farmer'], ['controlNumber', 'Control no.'],
        ['farm', 'Farm'], ['village', 'Village'], ['centre', 'Collection centre'], ['warehouse', 'Warehouse'],
        ['variety', 'Variety'], ['grade', 'Grade'], ['bags', 'Bags', 'number'], ['weightKg', 'Weight kg', 'number'],
        ['pricePerKg', 'Price/kg', 'currency'], ['value', 'Value', 'currency'], ['paid', 'Paid', 'currency'],
        ['owed', 'Owed', 'currency'], ['payment', 'Payment'], ['batch', 'Batch'], ['lot', 'Lot'], ['status', 'Status'],
      ),
      rows,
      chart: { title: 'Rice received by collection centre (kg)', type: 'number', items: topItems(byCentre) },
    }, records.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 8. Sales
  // ------------------------------------------------------------------

  private async sales(f: ReportFilterDto) {
    const sold = this.range(f);
    const sales = await this.prisma.sale.findMany({
      where: {
        ...(sold ? { saleDate: sold } : {}),
        ...(f.mamcosId ? { mamcosId: f.mamcosId } : {}),
        ...(f.riceVariety ? { riceVariety: f.riceVariety } : {}),
      },
      include: { buyer: { select: { name: true } } },
      orderBy: { saleDate: 'desc' },
      take: MAX_ROWS,
    });
    const rows = sales.map((s) => ({
      invoice: s.invoiceNumber,
      date: iso(s.saleDate),
      buyer: s.buyer.name,
      variety: s.riceVariety ?? '',
      quantityKg: s.quantityKg,
      pricePerKg: s.pricePerKg,
      premium: s.fairtradePremium ?? 0,
      total: s.totalRevenue,
      received: s.paymentReceived ? 'Yes' : 'No',
      paymentDate: iso(s.paymentDate),
    }));
    const byBuyer = new Map<string, number>();
    for (const s of sales) addTo(byBuyer, s.buyer.name, s.totalRevenue);
    return this.result('sales', {
      summary: [
        { label: 'Sales', value: sales.length, type: 'number' },
        { label: 'Quantity sold (kg)', value: round(sum(sales, (s) => s.quantityKg)), type: 'number' },
        { label: 'Revenue (TZS)', value: round(sum(sales, (s) => s.totalRevenue)), type: 'currency' },
        { label: 'Fairtrade premium (TZS)', value: round(sum(sales, (s) => s.fairtradePremium)), type: 'currency' },
        { label: 'Awaiting payment (TZS)', value: round(sum(sales.filter((s) => !s.paymentReceived), (s) => s.totalRevenue)), type: 'currency' },
      ],
      columns: cols(
        ['invoice', 'Invoice'], ['date', 'Sale date', 'date'], ['buyer', 'Buyer'], ['variety', 'Variety'],
        ['quantityKg', 'Quantity kg', 'number'], ['pricePerKg', 'Price/kg', 'currency'], ['premium', 'Premium', 'currency'],
        ['total', 'Total revenue', 'currency'], ['received', 'Payment received'], ['paymentDate', 'Payment date', 'date'],
      ),
      rows,
      chart: { title: 'Revenue by buyer (TZS)', type: 'currency', items: topItems(byBuyer) },
    }, sales.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 9. Loan portfolio
  // ------------------------------------------------------------------

  private async loanPortfolio(f: ReportFilterDto) {
    const created = this.range(f);
    const loans = await this.prisma.loanRecord.findMany({
      where: { ...(created ? { createdAt: created } : {}), farmer: this.farmerWhereWithCrop(f) },
      include: {
        farmer: { select: { controlNumber: true, firstName: true, lastName: true, district: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const now = new Date();
    const rows = loans.map((l) => {
      const repaid = Math.max(l.originalAmount - l.amountOwed, 0);
      const outstanding = l.isActive ? l.amountOwed : 0;
      const ageDays = Math.floor((now.getTime() - l.createdAt.getTime()) / 86_400_000);
      return {
        farmer: `${l.farmer.firstName} ${l.farmer.lastName}`,
        controlNumber: l.farmer.controlNumber,
        district: l.farmer.district ?? '',
        lender: l.lenderName,
        originalAmount: l.originalAmount,
        repaid: round(repaid),
        outstanding: round(outstanding),
        repaidPct: pct(repaid, l.originalAmount),
        autoDeduct: l.autoDeductPercent ?? '',
        issued: iso(l.createdAt),
        ageDays,
        ageing: outstanding > 0 ? ageingBucket(ageDays) : '',
        status: l.isActive && l.amountOwed > 0 ? 'Active' : 'Settled',
      };
    });
    const lent = sum(loans, (l) => l.originalAmount);
    const repaid = sum(rows, (r) => r.repaid);
    const byLender = new Map<string, number>();
    for (const r of rows) if (r.outstanding > 0) addTo(byLender, r.lender, r.outstanding);
    return this.result('loan-portfolio', {
      summary: [
        { label: 'Loans', value: loans.length, type: 'number' },
        { label: 'Active loans', value: rows.filter((r) => r.status === 'Active').length, type: 'number' },
        { label: 'Lent (TZS)', value: round(lent), type: 'currency' },
        { label: 'Outstanding (TZS)', value: round(sum(rows, (r) => r.outstanding)), type: 'currency' },
        { label: 'Repaid share', value: pct(repaid, lent), type: 'percent' },
      ],
      columns: cols(
        ['farmer', 'Farmer'], ['controlNumber', 'Control no.'], ['district', 'District'], ['lender', 'Lender'],
        ['originalAmount', 'Original', 'currency'], ['repaid', 'Repaid', 'currency'], ['outstanding', 'Outstanding', 'currency'],
        ['repaidPct', 'Repaid %', 'percent'], ['autoDeduct', 'Auto-deduct %', 'percent'], ['issued', 'Issued', 'date'],
        ['ageDays', 'Age (days)', 'number'], ['ageing', 'Ageing'], ['status', 'Status'],
      ),
      rows,
      chart: { title: 'Outstanding by lender (TZS)', type: 'currency', items: topItems(byLender) },
    }, loans.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 10. Loan repayment
  // ------------------------------------------------------------------

  private async loanRepayment(f: ReportFilterDto) {
    const created = this.range(f);
    const deductions = await this.prisma.loanDeduction.findMany({
      where: {
        ...(created ? { createdAt: created } : {}),
        loanRecord: { farmer: this.farmerWhereWithCrop(f) },
      },
      include: {
        loanRecord: {
          select: {
            lenderName: true,
            originalAmount: true,
            amountOwed: true,
            farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const rows = deductions.map((d) => ({
      date: iso(d.createdAt),
      farmer: `${d.loanRecord.farmer.firstName} ${d.loanRecord.farmer.lastName}`,
      controlNumber: d.loanRecord.farmer.controlNumber,
      lender: d.loanRecord.lenderName,
      amount: d.amount,
      loanOriginal: d.loanRecord.originalAmount,
      loanBalance: d.loanRecord.amountOwed,
      payout: d.payoutStatus,
      payoutApproved: iso(d.payoutApprovedAt),
      reference: d.orderReference ?? '',
    }));
    const byMonth = new Map<string, number>();
    for (const d of deductions) addTo(byMonth, d.createdAt.toISOString().slice(0, 7), d.amount);
    const monthItems = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([name, value]) => ({ name, value: round(value) }));
    return this.result('loan-repayment', {
      summary: [
        { label: 'Repayments', value: deductions.length, type: 'number' },
        { label: 'Repaid (TZS)', value: round(sum(deductions, (d) => d.amount)), type: 'currency' },
        { label: 'Paid out to lenders (TZS)', value: round(sum(deductions.filter((d) => d.payoutStatus === 'SUCCESS'), (d) => d.amount)), type: 'currency' },
        { label: 'Awaiting payout (TZS)', value: round(sum(deductions.filter((d) => d.payoutStatus === 'PENDING' || d.payoutStatus === 'PROCESSING'), (d) => d.amount)), type: 'currency' },
        { label: 'Failed payouts', value: deductions.filter((d) => d.payoutStatus === 'FAILED').length, type: 'number' },
      ],
      columns: cols(
        ['date', 'Date', 'date'], ['farmer', 'Farmer'], ['controlNumber', 'Control no.'], ['lender', 'Lender'],
        ['amount', 'Repaid', 'currency'], ['loanOriginal', 'Loan amount', 'currency'], ['loanBalance', 'Balance now', 'currency'],
        ['payout', 'Lender payout'], ['payoutApproved', 'Approved', 'date'], ['reference', 'Reference'],
      ),
      rows,
      chart: { title: 'Repaid per month (TZS)', type: 'currency', items: monthItems },
    }, deductions.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 11. Insurance coverage
  // ------------------------------------------------------------------

  private async insuranceCoverage(f: ReportFilterDto) {
    const created = this.range(f);
    const farmerWhere = this.farmerWhere(f);
    const [policies, farmerBase] = await Promise.all([
      this.prisma.insurancePolicy.findMany({
        where: {
          ...(created ? { createdAt: created } : {}),
          ...(f.riceVariety ? { riceVariety: f.riceVariety } : {}),
          ...(f.season ? { cropCycle: { season: f.season } } : {}),
          farmer: farmerWhere,
        },
        include: {
          farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
          farm: { select: { farmCode: true } },
          provider: { select: { name: true } },
          claims: { select: { claimedAmount: true, paidAmount: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      }),
      this.prisma.farmer.count({ where: farmerWhere }),
    ]);
    const rows = policies.map((p) => ({
      farmer: `${p.farmer.firstName} ${p.farmer.lastName}`,
      controlNumber: p.farmer.controlNumber,
      farm: p.farm?.farmCode ?? '',
      provider: p.provider.name,
      product: p.productType,
      variety: p.riceVariety ?? '',
      insuredHa: p.insuredAreaHectares,
      sumInsured: p.sumInsured,
      premium: p.premiumAmount,
      status: p.status,
      start: iso(p.startDate),
      end: iso(p.endDate),
      claims: p.claims.length,
      claimed: round(sum(p.claims, (c) => c.claimedAmount)),
      paidOut: round(sum(p.claims, (c) => c.paidAmount)),
    }));
    const coveredFarmers = new Set(
      policies.filter((p) => p.status === 'ACTIVE').map((p) => p.farmer.controlNumber),
    ).size;
    const byProduct = new Map<string, number>();
    for (const p of policies) addTo(byProduct, p.productType, p.sumInsured);
    return this.result('insurance-coverage', {
      summary: [
        { label: 'Farmers covered', value: pct(coveredFarmers, farmerBase), type: 'percent' },
        { label: 'Active policies', value: policies.filter((p) => p.status === 'ACTIVE').length, type: 'number' },
        { label: 'Insured area (ha)', value: round(sum(policies.filter((p) => p.status === 'ACTIVE'), (p) => p.insuredAreaHectares), 1), type: 'number' },
        { label: 'Sum insured (TZS)', value: round(sum(policies.filter((p) => p.status === 'ACTIVE'), (p) => p.sumInsured)), type: 'currency' },
        { label: 'Premium (TZS)', value: round(sum(policies, (p) => p.premiumAmount)), type: 'currency' },
        { label: 'Claims paid (TZS)', value: round(sum(rows, (r) => r.paidOut)), type: 'currency' },
      ],
      columns: cols(
        ['farmer', 'Farmer'], ['controlNumber', 'Control no.'], ['farm', 'Farm'], ['provider', 'Provider'],
        ['product', 'Product'], ['variety', 'Variety'], ['insuredHa', 'Insured ha', 'number'],
        ['sumInsured', 'Sum insured', 'currency'], ['premium', 'Premium', 'currency'], ['status', 'Status'],
        ['start', 'Start', 'date'], ['end', 'End', 'date'], ['claims', 'Claims', 'number'],
        ['claimed', 'Claimed', 'currency'], ['paidOut', 'Paid out', 'currency'],
      ),
      rows,
      chart: { title: 'Sum insured by product (TZS)', type: 'currency', items: topItems(byProduct) },
    }, policies.length >= MAX_ROWS);
  }

  // ------------------------------------------------------------------
  // 12. Gender and youth inclusion
  // ------------------------------------------------------------------

  private async genderYouth(f: ReportFilterDto) {
    const farmers = await this.prisma.farmer.findMany({
      where: this.farmerWhereWithCrop({ ...f, gender: undefined, youthOnly: undefined }),
      select: {
        gender: true,
        dateOfBirth: true,
        verificationStatus: true,
        cropCycles: {
          where: {
            ...(f.season ? { season: f.season } : {}),
            ...(f.riceVariety ? { riceVariety: f.riceVariety } : {}),
          },
          select: { areaPlantedHa: true, actualYieldKg: true },
        },
        loanRecords: { where: { isActive: true }, select: { id: true } },
      },
    });
    type Group = { gender: string; ageGroup: string; farmers: number; verified: number; growers: number; area: number; kg: number; borrowers: number };
    const groups = new Map<string, Group>();
    for (const x of farmers) {
      const gender = x.gender ?? 'UNKNOWN';
      const ageGroup = x.dateOfBirth ? (isYouth(x.dateOfBirth) ? 'Youth (≤35)' : 'Adult (36+)') : 'Age unknown';
      const key = `${gender}|${ageGroup}`;
      const g = groups.get(key) ?? { gender, ageGroup, farmers: 0, verified: 0, growers: 0, area: 0, kg: 0, borrowers: 0 };
      g.farmers += 1;
      if (x.verificationStatus === 'VERIFIED') g.verified += 1;
      if (x.cropCycles.length) g.growers += 1;
      g.area += sum(x.cropCycles, (c) => c.areaPlantedHa);
      g.kg += sum(x.cropCycles, (c) => c.actualYieldKg);
      if (x.loanRecords.length) g.borrowers += 1;
      groups.set(key, g);
    }
    const total = farmers.length;
    const rows = [...groups.values()]
      .sort((a, b) => a.gender.localeCompare(b.gender) || a.ageGroup.localeCompare(b.ageGroup))
      .map((g) => ({
        gender: g.gender,
        ageGroup: g.ageGroup,
        farmers: g.farmers,
        share: pct(g.farmers, total),
        verified: g.verified,
        growers: g.growers,
        areaHa: round(g.area, 1),
        productionKg: round(g.kg),
        borrowers: g.borrowers,
      }));
    const female = sum(rows.filter((r) => r.gender === 'FEMALE'), (r) => r.farmers);
    const youth = sum(rows.filter((r) => r.ageGroup.startsWith('Youth')), (r) => r.farmers);
    const femaleYouth = sum(rows.filter((r) => r.gender === 'FEMALE' && r.ageGroup.startsWith('Youth')), (r) => r.farmers);
    return this.result('gender-youth-inclusion', {
      summary: [
        { label: 'Farmers', value: total, type: 'number' },
        { label: 'Women', value: pct(female, total), type: 'percent' },
        { label: 'Youth (≤35)', value: pct(youth, total), type: 'percent' },
        { label: 'Young women', value: pct(femaleYouth, total), type: 'percent' },
        { label: 'Gender not recorded', value: sum(rows.filter((r) => r.gender === 'UNKNOWN'), (r) => r.farmers), type: 'number' },
      ],
      columns: cols(
        ['gender', 'Gender'], ['ageGroup', 'Age group'], ['farmers', 'Farmers', 'number'], ['share', 'Share', 'percent'],
        ['verified', 'Verified', 'number'], ['growers', 'Active growers', 'number'], ['areaHa', 'Area planted ha', 'number'],
        ['productionKg', 'Production kg', 'number'], ['borrowers', 'With active loan', 'number'],
      ),
      rows,
      chart: {
        title: 'Farmers by gender and age group',
        type: 'number',
        items: rows.map((r) => ({ name: `${r.gender} · ${r.ageGroup}`, value: r.farmers })),
      },
    });
  }
}
