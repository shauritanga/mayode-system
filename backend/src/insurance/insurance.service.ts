import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClaimStatus, PolicyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInsuranceClaimDto,
  CreateInsurancePolicyDto,
  InspectClaimDto,
  UpdateClaimPaymentDto,
  UpdatePolicyStatusDto,
  UpsertInsuranceProviderDto,
} from './dto/insurance.dto';

@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaService) {}

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
    const provider = await this.prisma.insuranceProvider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException(`Insurance provider with ID ${id} not found`);
    return provider;
  }

  // ── Policies ──
  async createPolicy(dto: CreateInsurancePolicyDto) {
    const [farmer, provider] = await Promise.all([
      this.prisma.farmer.findUnique({ where: { id: dto.farmerId }, select: { id: true } }),
      this.prisma.insuranceProvider.findUnique({ where: { id: dto.providerId }, select: { id: true } }),
    ]);
    if (!farmer) throw new NotFoundException(`Farmer with ID ${dto.farmerId} not found`);
    if (!provider) throw new NotFoundException(`Insurance provider with ID ${dto.providerId} not found`);

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
        farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
        provider: { select: { name: true } },
        _count: { select: { claims: true } },
      },
    });
  }

  findPoliciesForFarmer(farmerId: string) {
    return this.prisma.insurancePolicy.findMany({
      where: { farmerId },
      orderBy: { createdAt: 'desc' },
      include: { provider: { select: { name: true } }, claims: true },
    });
  }

  private async findPolicyOrFail(id: string) {
    const policy = await this.prisma.insurancePolicy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException(`Insurance policy with ID ${id} not found`);
    return policy;
  }

  async updatePolicyStatus(id: string, dto: UpdatePolicyStatusDto) {
    await this.findPolicyOrFail(id);
    return this.prisma.insurancePolicy.update({ where: { id }, data: { status: dto.status } });
  }

  // ── Claims ──
  async createClaim(dto: CreateInsuranceClaimDto) {
    const policy = await this.findPolicyOrFail(dto.policyId);
    if (policy.status !== PolicyStatus.ACTIVE) {
      throw new ConflictException('Claims can only be filed against an active policy');
    }
    return this.prisma.insuranceClaim.create({
      data: {
        policyId: dto.policyId,
        incidentDate: new Date(dto.incidentDate),
        incidentType: dto.incidentType,
        description: dto.description,
        claimedAmount: dto.claimedAmount,
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
            farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
            provider: { select: { name: true } },
          },
        },
      },
    });
  }

  private async findClaimOrFail(id: string) {
    const claim = await this.prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException(`Insurance claim with ID ${id} not found`);
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
        paidAmount: dto.status === ClaimStatus.PAID ? dto.paidAmount : undefined,
        paidAt: dto.status === ClaimStatus.PAID ? new Date() : undefined,
      },
    });
  }

  // ── Dashboard aggregate ──
  async coverageSummary() {
    const [byStatus, byProduct, claimsByStatus, sumInsuredAgg, premiumAgg] = await Promise.all([
      this.prisma.insurancePolicy.groupBy({ by: ['status'], _count: true }),
      this.prisma.insurancePolicy.groupBy({ by: ['productType'], _count: true }),
      this.prisma.insuranceClaim.groupBy({ by: ['status'], _count: true }),
      this.prisma.insurancePolicy.aggregate({ _sum: { sumInsured: true } }),
      this.prisma.insurancePolicy.aggregate({ _sum: { premiumAmount: true } }),
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
