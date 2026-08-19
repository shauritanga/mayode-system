import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClaimStatus, PolicyStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import {
  AmendPolicyDto,
  CreateInsuranceClaimDto,
  CreateInsurancePolicyDto,
  InspectClaimDto,
  RenewPolicyDto,
  UpdateClaimPaymentDto,
  UpdatePolicyStatusDto,
  UpsertInsuranceProviderDto,
} from './dto/insurance.dto';

@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaService) {}

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
  async createPolicy(dto: CreateInsurancePolicyDto) {
    const [farmer, provider] = await Promise.all([
      this.prisma.farmer.findUnique({
        where: { id: dto.farmerId },
        select: { id: true },
      }),
      this.prisma.insuranceProvider.findUnique({
        where: { id: dto.providerId },
        select: { id: true },
      }),
    ]);
    if (!farmer)
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
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  findAllPolicies() {
    return this.prisma.insurancePolicy.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        farmer: {
          select: { firstName: true, lastName: true, controlNumber: true },
        },
        provider: { select: { name: true } },
        _count: { select: { claims: true } },
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

  findAllClaims() {
    return this.prisma.insuranceClaim.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        policy: {
          select: {
            id: true,
            productType: true,
            farmer: {
              select: { firstName: true, lastName: true, controlNumber: true },
            },
            provider: { select: { name: true } },
          },
        },
      },
    });
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

  async inspectClaim(id: string, inspectorId: string, dto: InspectClaimDto) {
    await this.findClaimOrFail(id);
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        inspectedById: inspectorId,
        inspectionNotes: dto.inspectionNotes,
        inspectionDate: new Date(),
        status: dto.status ?? ClaimStatus.INSPECTING,
      },
    });
  }

  async updateClaimPayment(id: string, dto: UpdateClaimPaymentDto) {
    await this.findClaimOrFail(id);
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: dto.status,
        paidAmount:
          dto.status === ClaimStatus.PAID ? dto.paidAmount : undefined,
        paidAt: dto.status === ClaimStatus.PAID ? new Date() : undefined,
      },
    });
  }

  /**
   * Cross-references a claim's incident with WeatherAlerts issued around the same time for the
   * farmer's region/district — the explicit policy↔weather link the docx asks for. This is a
   * read-side correlation (no FK), matching the WeatherAlert model's loose-reference convention;
   * it surfaces existing alerts as supporting evidence, it doesn't drive claim approval.
   */
  async getWeatherContextForClaim(claimId: string) {
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
  async coverageSummary() {
    const [byStatus, byProduct, claimsByStatus, sumInsuredAgg, premiumAgg] =
      await Promise.all([
        this.prisma.insurancePolicy.groupBy({ by: ['status'], _count: true }),
        this.prisma.insurancePolicy.groupBy({
          by: ['productType'],
          _count: true,
        }),
        this.prisma.insuranceClaim.groupBy({ by: ['status'], _count: true }),
        this.prisma.insurancePolicy.aggregate({ _sum: { sumInsured: true } }),
        this.prisma.insurancePolicy.aggregate({
          _sum: { premiumAmount: true },
        }),
      ]);
    const insuredFarmerCount = await this.prisma.insurancePolicy.findMany({
      where: { status: PolicyStatus.ACTIVE },
      distinct: ['farmerId'],
      select: { farmerId: true },
    });
    return {
      byStatus,
      byProduct,
      claimsByStatus,
      totalSumInsured: sumInsuredAgg._sum.sumInsured ?? 0,
      totalPremium: premiumAgg._sum.premiumAmount ?? 0,
      farmersCovered: insuredFarmerCount.length,
    };
  }
}
