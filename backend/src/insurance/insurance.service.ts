import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClaimStatus, PolicyStatus, UserRole } from '@prisma/client';
import { InsuranceAccessService } from './insurance-access.service';
import { claimPaymentStatus, claimsRatio } from './insurance-rules';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import {
  AmendPolicyDto,
  CreateInsuranceClaimDto,
  CreateInsurancePolicyDto,
  ClaimDecisionDto,
  ClaimPaymentDto,
  InspectClaimDto,
  RenewPolicyDto,
  UpdatePolicyStatusDto,
  UpsertInsuranceProviderDto,
} from './dto/insurance.dto';

@Injectable()
export class InsuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InsuranceAccessService,
  ) {}

  private async farmerIdForUser(user: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return farmer?.id ?? null;
  }

  private async assertFarmerOwnsPolicy(user: RequestUser, policyId: string) {
    if (user.role !== UserRole.FARMER) return;
    const farmerId = await this.farmerIdForUser(user);
    const policy = await this.findPolicyOrFail(policyId);
    if (!farmerId || policy.farmerId !== farmerId) {
      throw new ForbiddenException('You can only act on your own insurance policies');
    }
  }

  private async assertFarmerOwnsFarmerId(user: RequestUser, farmerId: string) {
    if (user.role !== UserRole.FARMER) return;
    const selfId = await this.farmerIdForUser(user);
    if (!selfId || selfId !== farmerId) {
      throw new ForbiddenException('You can only view your own insurance policies');
    }
  }

  // ── Providers ──
  createProvider(dto: UpsertInsuranceProviderDto) {
    return this.prisma.insuranceProvider.create({ data: dto });
  }

  findAllProviders() {
    return this.prisma.insuranceProvider.findMany({
      include: { _count: { select: { policies: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async updateProvider(id: string, dto: UpsertInsuranceProviderDto) {
    await this.findProviderOrFail(id);
    return this.prisma.insuranceProvider.update({ where: { id }, data: dto });
  }

  private async findProviderOrFail(id: string) {
    const provider = await this.prisma.insuranceProvider.findUnique({
      where: { id },
    });
    if (!provider)
      throw new NotFoundException(`Insurance provider with ID ${id} not found`);
    return provider;
  }

  // ── Policies ──
  async createPolicy(dto: CreateInsurancePolicyDto, user: RequestUser) {
    const ctx = await this.access.context(user);
    const [farmer, provider] = await Promise.all([
      this.prisma.farmer.findUnique({
        where: { id: dto.farmerId },
        select: { id: true, mamcosId: true },
      }),
      this.prisma.insuranceProvider.findUnique({
        where: { id: dto.providerId },
        select: { id: true },
      }),
    ]);
    if (!farmer || (ctx.kind === 'staff' && !ctx.isSuper && farmer.mamcosId !== ctx.tenant))
      throw new NotFoundException(`Farmer with ID ${dto.farmerId} not found`);
    if (!provider)
      throw new NotFoundException(
        `Insurance provider with ID ${dto.providerId} not found`,
      );

    return this.prisma.insurancePolicy.create({
      data: {
        farmerId: dto.farmerId,
        farmId: dto.farmId,
        cropCycleId: dto.cropCycleId,
        providerId: dto.providerId,
        productType: dto.productType,
        riceVariety: dto.riceVariety,
        insuredAreaHectares: dto.insuredAreaHectares,
        sumInsured: dto.sumInsured,
        premiumAmount: dto.premiumAmount,
        mamcosId: farmer.mamcosId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async findAllPolicies(user: RequestUser) {
    const ctx = await this.access.context(user);
    return this.prisma.insurancePolicy.findMany({
      where: this.access.policyWhere(ctx),
      orderBy: { createdAt: 'desc' },
      include: {
        farmer: {
          select: { firstName: true, lastName: true, controlNumber: true },
        },
        provider: { select: { name: true } },
        farm: { select: { farmCode: true } },
        _count: { select: { claims: true } },
      },
    });
  }

  /** Staff record that the farmer paid the premium of a policy that was created directly. */
  async recordPolicyPremium(id: string, dto: { amount: number; reference?: string; paidAt?: string }, user: RequestUser) {
    const ctx = await this.access.context(user);
    const policy = await this.findPolicyOrFail(id);
    if (ctx.kind !== 'staff' || !this.access.canSee(ctx, policy)) throw new NotFoundException(`Insurance policy with ID ${id} not found`);
    return this.prisma.insurancePolicy.update({
      where: { id },
      data: {
        premiumPaidAmount: { increment: dto.amount },
        premiumPaidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        premiumReference: dto.reference,
        ...(policy.status === PolicyStatus.PENDING && policy.premiumPaidAmount + dto.amount >= policy.premiumAmount ? { status: PolicyStatus.ACTIVE } : {}),
      },
    });
  }

  findPoliciesForFarmer(farmerId: string, user?: RequestUser) {
    if (user) {
      return this.assertFarmerOwnsFarmerId(user, farmerId).then(() =>
        this.prisma.insurancePolicy.findMany({
          where: { farmerId },
          orderBy: { createdAt: 'desc' },
          include: {
            provider: { select: { name: true } },
            claims: { orderBy: { createdAt: 'desc' } },
            farm: { select: { farmCode: true } },
          },
        }),
      );
    }
    return this.prisma.insurancePolicy.findMany({
      where: { farmerId },
      orderBy: { createdAt: 'desc' },
      include: {
        provider: { select: { name: true } },
        claims: { orderBy: { createdAt: 'desc' } },
        farm: { select: { farmCode: true } },
      },
    });
  }

  async policiesForSelf(user: RequestUser) {
    const farmerId = await this.farmerIdForUser(user);
    if (!farmerId) throw new NotFoundException('Farmer profile not found');
    return this.findPoliciesForFarmer(farmerId);
  }

  private async findPolicyOrFail(id: string) {
    const policy = await this.prisma.insurancePolicy.findUnique({
      where: { id },
    });
    if (!policy)
      throw new NotFoundException(`Insurance policy with ID ${id} not found`);
    return policy;
  }

  async updatePolicyStatus(id: string, dto: UpdatePolicyStatusDto) {
    await this.findPolicyOrFail(id);
    return this.prisma.insurancePolicy.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  /** Amend a policy's coverage/financial terms post-creation (not a status transition). */
  async amendPolicy(id: string, dto: AmendPolicyDto) {
    await this.findPolicyOrFail(id);
    return this.prisma.insurancePolicy.update({
      where: { id },
      data: {
        riceVariety: dto.riceVariety,
        insuredAreaHectares: dto.insuredAreaHectares,
        sumInsured: dto.sumInsured,
        premiumAmount: dto.premiumAmount,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  /** Renew an expiring/expired policy: clones its coverage into a new PENDING policy, chained via renewedFromPolicyId. */
  async renewPolicy(id: string, dto: RenewPolicyDto) {
    const policy = await this.findPolicyOrFail(id);
    return this.prisma.insurancePolicy.create({
      data: {
        farmerId: policy.farmerId,
        farmId: policy.farmId,
        cropCycleId: policy.cropCycleId,
        providerId: policy.providerId,
        productType: policy.productType,
        riceVariety: policy.riceVariety,
        insuredAreaHectares: policy.insuredAreaHectares,
        sumInsured: dto.sumInsured ?? policy.sumInsured,
        premiumAmount: dto.premiumAmount ?? policy.premiumAmount,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        renewedFromPolicyId: policy.id,
      },
    });
  }

  // ── Claims ──
  async createClaim(dto: CreateInsuranceClaimDto, user?: RequestUser) {
    if (user) await this.assertFarmerOwnsPolicy(user, dto.policyId);
    const policy = await this.findPolicyOrFail(dto.policyId);
    if (policy.status !== PolicyStatus.ACTIVE) {
      throw new ConflictException(
        'Claims can only be filed against an active policy',
      );
    }
    return this.prisma.insuranceClaim.create({
      data: {
        policyId: dto.policyId,
        incidentDate: new Date(dto.incidentDate),
        incidentType: dto.incidentType,
        description: dto.description,
        claimedAmount: dto.claimedAmount,
      },
      include: {
        policy: {
          select: {
            productType: true,
            provider: { select: { name: true } },
          },
        },
      },
    });
  }

  async findAllClaims(user: RequestUser) {
    const ctx = await this.access.context(user);
    const claims = await this.prisma.insuranceClaim.findMany({
      where: { policy: this.access.policyWhere(ctx) },
      orderBy: { createdAt: 'desc' },
      include: {
        policy: {
          select: {
            id: true,
            productType: true,
            sumInsured: true,
            farmer: {
              select: { firstName: true, lastName: true, controlNumber: true },
            },
            provider: { select: { name: true } },
          },
        },
      },
    });
    return claims.map((c) => ({ ...c, paymentStatus: claimPaymentStatus(c) }));
  }

  /** Ordered status steps for UI timelines. */
  claimTimeline(claim: {
    status: ClaimStatus;
    createdAt: Date;
    inspectionDate?: Date | null;
    inspectionNotes?: string | null;
    paidAt?: Date | null;
    paidAmount?: number | null;
  }) {
    const steps: Array<{
      key: ClaimStatus;
      label: string;
      reached: boolean;
      at?: Date | null;
      note?: string | null;
    }> = [
      {
        key: ClaimStatus.SUBMITTED,
        label: 'Submitted',
        reached: true,
        at: claim.createdAt,
      },
      {
        key: ClaimStatus.INSPECTING,
        label: 'Inspecting',
        reached: (
          [
            ClaimStatus.INSPECTING,
            ClaimStatus.APPROVED,
            ClaimStatus.REJECTED,
            ClaimStatus.PAID,
          ] as ClaimStatus[]
        ).includes(claim.status),
        at: claim.inspectionDate,
        note: claim.inspectionNotes,
      },
      {
        key: ClaimStatus.APPROVED,
        label: claim.status === ClaimStatus.REJECTED ? 'Rejected' : 'Approved',
        reached: (
          [
            ClaimStatus.APPROVED,
            ClaimStatus.REJECTED,
            ClaimStatus.PAID,
          ] as ClaimStatus[]
        ).includes(claim.status),
      },
      {
        key: ClaimStatus.PAID,
        label: 'Paid',
        reached: claim.status === ClaimStatus.PAID,
        at: claim.paidAt,
        note:
          claim.paidAmount != null
            ? `Paid TZS ${claim.paidAmount.toLocaleString()}`
            : null,
      },
    ];
    return steps;
  }

  private async findClaimOrFail(id: string) {
    const claim = await this.prisma.insuranceClaim.findUnique({
      where: { id },
    });
    if (!claim)
      throw new NotFoundException(`Insurance claim with ID ${id} not found`);
    return claim;
  }

  private async claimFor(id: string, user: RequestUser) {
    const ctx = await this.access.context(user);
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { id }, include: { policy: true } });
    if (!claim || !this.access.canSee(ctx, claim.policy))
      throw new NotFoundException(`Insurance claim with ID ${id} not found`);
    return { claim, ctx };
  }

  /** Field inspection: notes, photos, the loss measured and a recommendation to the insurer. */
  async inspectClaim(id: string, user: RequestUser, dto: InspectClaimDto) {
    const { claim } = await this.claimFor(id, user);
    if (claim.status === ClaimStatus.PAID || claim.status === ClaimStatus.REJECTED)
      throw new ConflictException('This claim is already closed');
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        inspectedById: user.id,
        inspectionNotes: dto.inspectionNotes,
        inspectionPhotoUrls: dto.photoUrls ?? undefined,
        assessedLossAmount: dto.assessedLossAmount,
        recommendation: dto.recommendation,
        inspectionDate: new Date(),
        // An approved claim stays approved; inspecting never undoes the insurer's decision.
        status: claim.status === ClaimStatus.APPROVED ? ClaimStatus.APPROVED : ClaimStatus.INSPECTING,
      },
    });
  }

  /** The insurer approves an amount or rejects the claim. */
  async decideClaim(id: string, dto: ClaimDecisionDto, user: RequestUser) {
    const { claim, ctx } = await this.claimFor(id, user);
    if (ctx.kind !== 'insurer') throw new ForbiddenException('Only the insurance company decides a claim');
    if (claim.status !== ClaimStatus.SUBMITTED && claim.status !== ClaimStatus.INSPECTING)
      throw new ConflictException('This claim has already been decided');
    if (dto.decision === 'REJECT') {
      if (!dto.note?.trim()) throw new BadRequestException('Give a reason for rejecting the claim');
      return this.prisma.insuranceClaim.update({ where: { id }, data: { status: ClaimStatus.REJECTED, decisionNote: dto.note, decidedAt: new Date() } });
    }
    const amount = dto.approvedAmount ?? 0;
    if (amount <= 0) throw new BadRequestException('Enter the amount approved');
    if (amount > claim.policy.sumInsured) throw new BadRequestException('The approved amount cannot be more than the sum insured');
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: { status: ClaimStatus.APPROVED, approvedAmount: amount, decisionNote: dto.note, decidedAt: new Date() },
    });
  }

  /** A payment towards an approved claim; the claim is paid once the approved amount is covered. */
  async payClaim(id: string, dto: ClaimPaymentDto, user: RequestUser) {
    const { claim, ctx } = await this.claimFor(id, user);
    const isAdmin = ctx.kind === 'staff' && (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN);
    if (ctx.kind !== 'insurer' && !isAdmin) throw new ForbiddenException('Only the insurance company records a claim payment');
    if (claim.approvedAmount == null || (claim.status !== ClaimStatus.APPROVED && claim.status !== ClaimStatus.PAID))
      throw new ConflictException('Only an approved claim can be paid');
    const total = (claim.paidAmount ?? 0) + dto.amount;
    if (total > claim.approvedAmount + 0.005) throw new BadRequestException('That would pay more than the amount approved');
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        paidAmount: total,
        paidAt: new Date(),
        paymentReference: dto.reference ?? claim.paymentReference,
        status: total >= claim.approvedAmount - 0.005 ? ClaimStatus.PAID : ClaimStatus.APPROVED,
      },
    });
  }

  /**
   * Cross-references a claim's incident with WeatherAlerts issued around the same time for the
   * farmer's region/district — the explicit policy↔weather link the docx asks for. This is a
   * read-side correlation (no FK), matching the WeatherAlert model's loose-reference convention;
   * it surfaces existing alerts as supporting evidence, it doesn't drive claim approval.
   */
  async getWeatherContextForClaim(claimId: string, user: RequestUser) {
    await this.claimFor(claimId, user);
    const claim = await this.prisma.insuranceClaim.findUnique({
      where: { id: claimId },
      include: {
        policy: {
          include: { farmer: { select: { region: true, district: true } } },
        },
      },
    });
    if (!claim)
      throw new NotFoundException(
        `Insurance claim with ID ${claimId} not found`,
      );

    const windowStart = new Date(claim.incidentDate);
    windowStart.setDate(windowStart.getDate() - 14);
    const windowEnd = new Date(claim.incidentDate);
    windowEnd.setDate(windowEnd.getDate() + 14);

    const { region, district } = claim.policy.farmer;
    const alerts = await this.prisma.weatherAlert.findMany({
      where: {
        validFrom: { gte: windowStart, lte: windowEnd },
        OR: [
          region ? { region } : undefined,
          district ? { district } : undefined,
        ].filter(Boolean) as object[],
      },
      orderBy: { validFrom: 'desc' },
    });

    return {
      claimId,
      incidentDate: claim.incidentDate,
      farmerLocation: { region, district },
      windowDays: 14,
      matchingAlerts: alerts,
    };
  }

  // ── Dashboard aggregate ──
  async coverageSummary(user: RequestUser) {
    const ctx = await this.access.context(user);
    const where = this.access.policyWhere(ctx);
    const claimWhere = { policy: where };
    const [policies, claims, applications] = await Promise.all([
      this.prisma.insurancePolicy.findMany({
        where,
        select: { status: true, productType: true, farmerId: true, sumInsured: true, premiumAmount: true, premiumPaidAmount: true, insuredAreaHectares: true, endDate: true },
      }),
      this.prisma.insuranceClaim.findMany({ where: claimWhere, select: { status: true, claimedAmount: true, paidAmount: true } }),
      this.prisma.insuranceApplication.groupBy({ by: ['status'], where: this.access.applicationWhere(ctx), _count: { _all: true } }),
    ]);
    const count = <K extends string>(rows: { [k: string]: unknown }[], key: K) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + 1);
      return [...m.entries()].map(([k, n]) => ({ [key]: k, _count: n }));
    };
    const active = policies.filter((p) => p.status === PolicyStatus.ACTIVE);
    const premiumCollected = policies.reduce((t, p) => t + p.premiumPaidAmount, 0);
    const claimsPaid = claims.reduce((t, c) => t + (c.paidAmount ?? 0), 0);
    const soon = Date.now() + 30 * 86_400_000;
    return {
      byStatus: count(policies, 'status'),
      byProduct: count(policies, 'productType'),
      claimsByStatus: count(claims, 'status'),
      applicationsByStatus: applications.map((a) => ({ status: a.status, _count: a._count._all })),
      totalSumInsured: policies.reduce((t, p) => t + p.sumInsured, 0),
      totalPremium: policies.reduce((t, p) => t + p.premiumAmount, 0),
      premiumCollected,
      premiumOutstanding: active.reduce((t, p) => t + Math.max(p.premiumAmount - p.premiumPaidAmount, 0), 0),
      claimsPaid,
      claimsRatio: claimsRatio(premiumCollected, claimsPaid),
      areaInsuredHa: Math.round(active.reduce((t, p) => t + p.insuredAreaHectares, 0) * 100) / 100,
      farmersCovered: new Set(active.map((p) => p.farmerId)).size,
      expiringSoon: active.filter((p) => p.endDate && p.endDate.getTime() < soon).length,
    };
  }
}
