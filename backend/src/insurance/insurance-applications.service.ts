import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InsuranceProductType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../messaging/sms.service';
import type { RequestUser } from '../common/ownership.service';
import { CreditProfileService } from '../credit/credit-profile.service';
import { InsuranceAccessService } from './insurance-access.service';
import {
  assessRisk, canMoveInsuranceApplication, nextInsuranceReference, PRODUCT_GUIDE, suggestSumInsured, yieldCv,
} from './insurance-rules';
import { ApproveInsuranceApplicationDto, RecordPremiumDto, RejectInsuranceApplicationDto, SubmitInsuranceApplicationDto } from './dto/insurance-application.dto';

const OPEN = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] as const;
const fmt = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
const MONTH = 30 * 86_400_000;

@Injectable()
export class InsuranceApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InsuranceAccessService,
    private readonly sms: SmsService,
    private readonly profile: CreditProfileService,
  ) {}

  /** The farmer a request is about: a farmer's own profile, or the farmer staff named (inside their cooperative). */
  async farmerIdFor(user: RequestUser, farmerId?: string): Promise<string> {
    const ctx = await this.access.context(user);
    if (ctx.kind === 'farmer') return ctx.farmerId;
    if (!farmerId) throw new BadRequestException('Choose the farmer');
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { id: true, mamcosId: true } });
    if (!farmer || (ctx.kind === 'staff' && !ctx.isSuper && farmer.mamcosId !== ctx.tenant)) throw new NotFoundException('Farmer not found');
    return farmer.id;
  }

  guide() {
    return PRODUCT_GUIDE;
  }

  insurers() {
    return this.prisma.insuranceProvider.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  // ---------- risk and suggestion ----------

  /** Weather, claims and yield picture for a farmer (and optionally one farm). */
  async risk(farmerId: string, farmId?: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: {
        region: true,
        district: true,
        cropCycles: { select: { areaPlantedHa: true, actualYieldKg: true } },
        insurancePolicies: { select: { claims: { select: { id: true } } } },
      },
    });
    if (!farmer) throw new NotFoundException('Farmer not found');
    const farm = farmId ? await this.prisma.farm.findUnique({ where: { id: farmId }, select: { hasIrrigation: true } }) : null;
    const since = new Date(Date.now() - 365 * 86_400_000);
    const place = [farmer.district ? { district: farmer.district } : undefined, farmer.region ? { region: farmer.region } : undefined].filter(Boolean) as object[];
    const alerts = place.length
      ? await this.prisma.weatherAlert.findMany({ where: { validFrom: { gte: since }, OR: place }, select: { alertType: true, severity: true } })
      : [];
    const count = (t: string) => alerts.filter((a) => a.alertType === t).length;
    const perHa = farmer.cropCycles.filter((c) => (c.areaPlantedHa ?? 0) > 0 && (c.actualYieldKg ?? 0) > 0).map((c) => c.actualYieldKg! / c.areaPlantedHa!);
    const inputs = {
      droughtAlerts: count('DROUGHT'),
      floodAlerts: count('FLOOD'),
      pestOrDiseaseAlerts: count('PEST') + count('DISEASE'),
      severeAlerts: alerts.filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL').length,
      priorClaims: farmer.insurancePolicies.reduce((t, p) => t + p.claims.length, 0),
      hasIrrigation: farm ? farm.hasIrrigation : null,
      harvests: perHa.length,
      yieldCv: yieldCv(perHa),
    };
    return { ...assessRisk(inputs), inputs, alertsInArea: alerts.length, area: [farmer.district, farmer.region].filter(Boolean).join(', ') || null };
  }

  async suggestion(farmerId: string, product: InsuranceProductType, areaHa: number) {
    const p = await this.profile.build(farmerId);
    const revenuePerHa = p.outlook.expectedRevenue && p.outlook.farmHa ? p.outlook.expectedRevenue / p.outlook.farmHa : null;
    const planted = p.production.reduce((t: number, r: { areaHa: number | null }) => t + (r.areaHa ?? 0), 0);
    const inputPerHa = planted > 0 && p.inputs.totalCost > 0 ? p.inputs.totalCost / planted : null;
    return {
      product,
      areaHa,
      suggestedSumInsured: suggestSumInsured(product, areaHa, revenuePerHa, inputPerHa, p.repayment.outstanding),
      basis: PRODUCT_GUIDE.find((g) => g.key === product)?.sumInsuredBasis ?? null,
    };
  }

  // ---------- reading ----------

  private include = {
    farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, district: true } },
    provider: { select: { id: true, name: true } },
  } satisfies Prisma.InsuranceApplicationInclude;

  private shape<T extends { farmer: { firstName: string; lastName: string } }>(a: T) {
    return { ...a, farmerName: `${a.farmer.firstName} ${a.farmer.lastName}` };
  }

  async list(user: RequestUser, filter: { status?: string } = {}) {
    const ctx = await this.access.context(user);
    const rows = await this.prisma.insuranceApplication.findMany({
      where: { ...this.access.applicationWhere(ctx), ...(filter.status ? { status: filter.status as never } : {}) },
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return rows.map((r) => this.shape(r));
  }

  private async load(id: string, user: RequestUser) {
    const ctx = await this.access.context(user);
    const a = await this.prisma.insuranceApplication.findFirst({ where: { id, ...this.access.applicationWhere(ctx) }, include: this.include });
    if (!a) throw new NotFoundException('Insurance application not found');
    return { a, ctx };
  }

  async detail(id: string, user: RequestUser) {
    const { a } = await this.load(id, user);
    const farm = a.farmId ? await this.prisma.farm.findUnique({ where: { id: a.farmId }, select: { farmCode: true, name: true, socialHectares: true } }) : null;
    return { ...this.shape(a), farm };
  }

  // ---------- applying ----------

  async submit(dto: SubmitInsuranceApplicationDto, user: RequestUser) {
    const ctx = await this.access.context(user);
    if (ctx.kind === 'insurer') throw new ForbiddenException('Insurers cannot apply for cover');
    const farmerId = ctx.kind === 'farmer' ? ctx.farmerId : dto.farmerId;
    if (!farmerId) throw new BadRequestException('Choose the farmer this application is for');
    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { id: true, mamcosId: true, isBlacklisted: true, firstName: true, lastName: true } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    if (ctx.kind === 'staff' && !ctx.isSuper && farmer.mamcosId !== ctx.tenant) throw new NotFoundException('Farmer not found');
    if (farmer.isBlacklisted) throw new ForbiddenException('This farmer cannot apply for insurance');
    const provider = await this.prisma.insuranceProvider.findUnique({ where: { id: dto.providerId } });
    if (!provider || !provider.isActive) throw new NotFoundException('Insurance company not found');
    if (dto.farmId) {
      const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId }, select: { mamcosId: true } });
      if (!farm || (farmer.mamcosId && farm.mamcosId !== farmer.mamcosId)) throw new BadRequestException('That farm is not one of this farmer’s cooperative’s farms');
    }
    if (dto.cropCycleId) {
      const cycle = await this.prisma.cropCycle.findUnique({ where: { id: dto.cropCycleId }, select: { farmerId: true } });
      if (!cycle || cycle.farmerId !== farmerId) throw new BadRequestException('That crop season does not belong to this farmer');
    }
    const open = await this.prisma.insuranceApplication.count({
      where: { farmerId, providerId: provider.id, productType: dto.productType, farmId: dto.farmId ?? null, status: { in: [...OPEN] } },
    });
    if (open) throw new ConflictException(`There is already an open application for this cover with ${provider.name}`);

    const risk = await this.risk(farmerId, dto.farmId);
    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const last = await this.prisma.insuranceApplication.findFirst({ where: { reference: { startsWith: `IA-${year}-` } }, orderBy: { reference: 'desc' }, select: { reference: true } });
      try {
        const created = await this.prisma.insuranceApplication.create({
          data: {
            reference: nextInsuranceReference(year, last?.reference),
            farmerId,
            mamcosId: farmer.mamcosId,
            providerId: provider.id,
            farmId: dto.farmId,
            cropCycleId: dto.cropCycleId,
            productType: dto.productType,
            riceVariety: dto.riceVariety,
            insuredAreaHectares: dto.insuredAreaHectares,
            requestedSumInsured: dto.requestedSumInsured,
            notes: dto.notes,
            riskSnapshot: risk as unknown as Prisma.InputJsonValue,
            riskLevel: risk.level,
            submittedByUserId: user.id,
            submittedOnBehalf: ctx.kind === 'staff',
          },
        });
        const name = `${farmer.firstName} ${farmer.lastName}`;
        if (provider.phone) {
          await this.sms.send(provider.phone, `MAYODE: new insurance application ${created.reference} from ${name}, ${dto.insuredAreaHectares} ha, ${dto.productType.replace(/_/g, ' ').toLowerCase()}. Open your dashboard to review.`, 'insurance_application');
        }
        if (ctx.kind === 'staff') await this.tell(farmerId, `MAYODE: ombi lako la bima ${created.reference} limetumwa kwa ${provider.name}.`, `MAYODE: your insurance application ${created.reference} was sent to ${provider.name}.`);
        return this.detail(created.id, user);
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw new ConflictException('Could not allocate an application number; try again');
  }

  private async tell(farmerId: string, sw: string, en: string) {
    const f = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { user: { select: { phone: true, language: true } } } });
    if (f) await this.sms.send(f.user.phone, f.user.language === 'en' ? en : sw, 'insurance_decision');
  }

  async withdraw(id: string, user: RequestUser) {
    const { a, ctx } = await this.load(id, user);
    if (ctx.kind === 'insurer') throw new ForbiddenException('Only the applicant or their cooperative can withdraw an application');
    if (!canMoveInsuranceApplication(a.status, 'WITHDRAWN')) throw new ConflictException(`A ${a.status.toLowerCase().replace('_', ' ')} application cannot be withdrawn`);
    await this.prisma.insuranceApplication.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    return this.detail(id, user);
  }

  // ---------- the insurer's decision ----------

  private async insurerApp(id: string, user: RequestUser) {
    const ctx = await this.access.context(user);
    if (ctx.kind !== 'insurer') throw new ForbiddenException('Only the insurance company this application was sent to can decide it');
    const a = await this.prisma.insuranceApplication.findUnique({ where: { id }, include: { provider: true } });
    if (!a || a.providerId !== ctx.providerId) throw new NotFoundException('Insurance application not found');
    return a;
  }

  private move(from: string, to: string) {
    if (!canMoveInsuranceApplication(from, to)) throw new ConflictException(`An application that is ${from.toLowerCase().replace('_', ' ')} cannot become ${to.toLowerCase().replace('_', ' ')}`);
  }

  async startReview(id: string, user: RequestUser) {
    const a = await this.insurerApp(id, user);
    this.move(a.status, 'UNDER_REVIEW');
    await this.prisma.insuranceApplication.update({ where: { id }, data: { status: 'UNDER_REVIEW', reviewStartedAt: new Date() } });
    return this.detail(id, user);
  }

  async approve(id: string, dto: ApproveInsuranceApplicationDto, user: RequestUser) {
    const a = await this.insurerApp(id, user);
    this.move(a.status, 'APPROVED');
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('The cover must end after it starts');
    await this.prisma.insuranceApplication.update({
      where: { id },
      data: { status: 'APPROVED', sumInsured: dto.sumInsured, premiumAmount: dto.premiumAmount, startDate: start, endDate: end, decisionNote: dto.note, decidedByUserId: user.id, decidedAt: new Date() },
    });
    await this.tell(
      a.farmerId,
      `MAYODE: ombi lako la bima ${a.reference} limekubaliwa na ${a.provider.name}. Kiasi cha bima ${fmt(dto.sumInsured)}, ada ${fmt(dto.premiumAmount)}. Lipa ada kwa ofisi ya ushirika ili bima ianze.`,
      `MAYODE: your insurance application ${a.reference} was accepted by ${a.provider.name}. Cover ${fmt(dto.sumInsured)}, premium ${fmt(dto.premiumAmount)}. Pay the premium at your cooperative office to start the cover.`,
    );
    return this.detail(id, user);
  }

  async reject(id: string, dto: RejectInsuranceApplicationDto, user: RequestUser) {
    const a = await this.insurerApp(id, user);
    this.move(a.status, 'REJECTED');
    await this.prisma.insuranceApplication.update({ where: { id }, data: { status: 'REJECTED', decisionNote: dto.note, decidedByUserId: user.id, decidedAt: new Date() } });
    await this.tell(
      a.farmerId,
      `MAYODE: samahani, ombi lako la bima ${a.reference} halikukubaliwa na ${a.provider.name}. Sababu: ${dto.note}`,
      `MAYODE: sorry, your insurance application ${a.reference} was not accepted by ${a.provider.name}. Reason: ${dto.note}`,
    );
    return this.detail(id, user);
  }

  // ---------- premium paid: the policy starts ----------

  async recordPremium(id: string, dto: RecordPremiumDto, user: RequestUser) {
    const { a, ctx } = await this.load(id, user);
    if (ctx.kind !== 'staff') throw new ForbiddenException('The cooperative records the premium once the farmer has paid');
    this.move(a.status, 'ACTIVATED');
    if (a.sumInsured == null || a.premiumAmount == null || !a.startDate || !a.endDate) throw new ConflictException('The insurer has not set the cover and premium yet');
    if (dto.amount < a.premiumAmount) throw new BadRequestException(`The full premium of ${fmt(a.premiumAmount)} must be collected before cover starts`);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const farmer = await this.prisma.farmer.findUnique({ where: { id: a.farmerId }, select: { mamcosId: true } });
    await this.prisma.$transaction(async (tx) => {
      const policy = await tx.insurancePolicy.create({
        data: {
          farmerId: a.farmerId,
          farmId: a.farmId,
          cropCycleId: a.cropCycleId,
          providerId: a.providerId,
          productType: a.productType,
          riceVariety: a.riceVariety,
          insuredAreaHectares: a.insuredAreaHectares,
          sumInsured: a.sumInsured!,
          premiumAmount: a.premiumAmount!,
          status: 'ACTIVE',
          startDate: a.startDate,
          endDate: a.endDate,
          mamcosId: farmer?.mamcosId ?? null,
          premiumPaidAmount: dto.amount,
          premiumPaidAt: paidAt,
          premiumReference: dto.reference,
        },
      });
      await tx.insuranceApplication.update({
        where: { id },
        data: { status: 'ACTIVATED', policyId: policy.id, premiumPaidAmount: dto.amount, premiumPaidAt: paidAt, premiumReference: dto.reference, recordedByUserId: user.id },
      });
    });
    await this.tell(
      a.farmerId,
      `MAYODE: ada yako ya bima imepokelewa. Bima ya ${a.provider.name} (${fmt(a.sumInsured)}) inaanza ${a.startDate.toLocaleDateString('en-GB')} hadi ${a.endDate.toLocaleDateString('en-GB')}.`,
      `MAYODE: your premium was received. Your ${a.provider.name} cover (${fmt(a.sumInsured)}) runs from ${a.startDate.toLocaleDateString('en-GB')} to ${a.endDate.toLocaleDateString('en-GB')}.`,
    );
    return this.detail(id, user);
  }

  /** Months of cover the insurer is offering, for the quote screen. */
  static months(start: Date, end: Date) {
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / MONTH));
  }
}
