import { Injectable, NotFoundException } from '@nestjs/common';
import { MamcosStaffRole, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { MembershipsService } from '../memberships/memberships.service';
import { DocumentsService } from '../uploads/documents.service';
import { ActivitiesService } from '../activities/activities.service';
import { CreateFarmDto, UpdateFarmDto, UpdateBoundaryDto } from './dto/farms.dto';
import { QueryFarmsDto } from './dto/query-farms.dto';
import { LinkDocumentDto } from '../farmers/dto/farmer-actions.dto';

@Injectable()
export class FarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly documents: DocumentsService,
    private readonly memberships: MembershipsService,
    private readonly activities: ActivitiesService,
  ) {}

  /** Generate a unique Farm Code from the farmer's control number (e.g. MYD-00002-01). */
  private async generateFarmCode(farmerId: string): Promise<string> {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { controlNumber: true },
    });
    const controlNumber = farmer?.controlNumber || 'MYD-00000';
    const count = await this.prisma.farm.count({ where: { farmerId } });
    return `${controlNumber}-${(count + 1).toString().padStart(2, '0')}`;
  }

  async create(dto: CreateFarmDto, user: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: dto.farmerId },
    });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${dto.farmerId} not found`);
    }
    // A farmer may only register farms under their own profile.
    await this.ownership.assertFarmerAccess(user, dto.farmerId);

    const farmCode = await this.generateFarmCode(dto.farmerId);

    const farm = await this.prisma.farm.create({
      data: {
        farmerId: dto.farmerId,
        mamcosId: dto.mamcosId || farmer.mamcosId,
        farmCode,
        name: dto.name,
        plotNumber: dto.plotNumber,
        blockNumber: dto.blockNumber,
        section: dto.section,
        village: dto.village,
        ward: dto.ward,
        district: dto.district,
        region: dto.region,
        socialHectares: dto.socialHectares,
        actualAcres: dto.actualAcres,
        grade: dto.grade || 'C',
        vichuguuCount: dto.vichuguuCount || 0,
        hasIrrigation: dto.irrigationStatus || false,
        nearRoad: dto.nearRoadStatus || false,
        soilCondition: dto.soilCondition,
        photoUrls: dto.photoUrls || [],
        ownershipType: dto.ownershipType,
        ownerName: dto.ownerName,
        ownerPhone: dto.ownerPhone,
        landTenure: dto.landTenure,
        soilType: dto.soilType,
        soilFertility: dto.soilFertility,
        waterSource: dto.waterSource,
        irrigationMethod: dto.irrigationMethod,
        accessibility: dto.accessibility,
        previousCrops: dto.previousCrops || [],
      },
      include: {
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
        mamcos: { select: { name: true } },
      },
    });
    await this.activities.log(
      dto.farmerId,
      'farm.created',
      `Registered farm ${farm.farmCode}`,
      farm.name || farm.village || 'New farm',
      '🌾',
    );
    return farm;
  }

  async findAll(query: QueryFarmsDto = {}, user?: RequestUser) {
    const { search, mamcosId, farmerId, village, grade, isVerified } = query;
    let scopedMamcosId = mamcosId;
    if (user?.role === UserRole.MAMCOS_SECRETARY) {
      const secretary = await this.prisma.mamcosStaff.findFirst({ where: { userId: user.id, role: MamcosStaffRole.SECRETARY }, select: { mamcosId: true } });
      if (!secretary) throw new NotFoundException('AMCOS officer profile is missing');
      scopedMamcosId = secretary.mamcosId ?? undefined;
    }
    const where: Prisma.FarmWhereInput = {
      ...(scopedMamcosId ? { mamcosId: scopedMamcosId } : {}),
      ...(farmerId ? { farmerId } : {}),
      ...(village ? { village } : {}),
      ...(grade ? { grade } : {}),
      ...(isVerified !== undefined ? { isVerified: isVerified === 'true' } : {}),
      ...(search
        ? {
            OR: [
              { farmCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.farm.findMany({
      where,
      include: {
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
        mamcos: { select: { name: true } },
        _count: { select: { plots: true, cropCycles: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const farm = await this.prisma.farm.findUnique({
      where: { id },
      include: {
        farmer: true,
        mamcos: true,
        plots: {
          include: { _count: { select: { cropCycles: true } } },
          orderBy: { plotCode: 'asc' },
        },
        documents: { orderBy: { createdAt: 'desc' } },
        verifications: {
          include: {
            fieldOfficer: { select: { employeeCode: true, firstName: true, lastName: true } },
          },
        },
        cropCycles: true,
      },
    });
    if (!farm) throw new NotFoundException(`Farm with ID ${id} not found`);
    return farm;
  }

  findByFarmerId(farmerId: string) {
    return this.prisma.farm.findMany({
      where: { farmerId },
      include: {
        mamcos: { select: { name: true } },
        _count: { select: { plots: true, cropCycles: true } },
      },
    });
  }

  async update(id: string, dto: UpdateFarmDto, user: RequestUser) {
    await this.ownership.assertFarmAccess(user, id);
    await this.findOne(id);
    return this.prisma.farm.update({
      where: { id },
      data: {
        name: dto.name,
        plotNumber: dto.plotNumber,
        blockNumber: dto.blockNumber,
        section: dto.section,
        village: dto.village,
        ward: dto.ward,
        district: dto.district,
        region: dto.region,
        socialHectares: dto.socialHectares,
        actualAcres: dto.actualAcres,
        grade: dto.grade,
        vichuguuCount: dto.vichuguuCount,
        hasIrrigation: dto.irrigationStatus,
        nearRoad: dto.nearRoadStatus,
        soilCondition: dto.soilCondition,
        photoUrls: dto.photoUrls,
        ownershipType: dto.ownershipType,
        ownerName: dto.ownerName,
        ownerPhone: dto.ownerPhone,
        landTenure: dto.landTenure,
        soilType: dto.soilType,
        soilFertility: dto.soilFertility,
        waterSource: dto.waterSource,
        irrigationMethod: dto.irrigationMethod,
        accessibility: dto.accessibility,
        previousCrops: dto.previousCrops,
      },
    });
  }

  async updateBoundary(id: string, dto: UpdateBoundaryDto, user: RequestUser) {
    await this.ownership.assertFarmAccess(user, id);
    const existing = await this.findOne(id);
    const farm = await this.prisma.farm.update({
      where: { id },
      data: {
        boundaryCoordinates: dto.boundaryCoordinates,
        centerLatitude: dto.centerLat,
        centerLongitude: dto.centerLng,
      },
    });
    await this.activities.log(
      existing.farmerId,
      'farm.mapped',
      `Mapped ${farm.farmCode} boundary`,
      'GPS boundary saved',
      '📍',
    );
    return farm;
  }

  /** AMCOS accepts a field-mapped boundary as the official farm geometry. */
  async reviewBoundary(id: string, user: RequestUser) {
    const farm = await this.findOne(id);
    if (!farm.boundaryCoordinates || farm.centerLatitude == null || farm.centerLongitude == null) {
      throw new NotFoundException('A GPS boundary must be mapped before AMCOS can approve this farm');
    }
    if (user.role === 'MAMCOS_SECRETARY') {
      const secretary = await this.prisma.mamcosStaff.findFirst({ where: { userId: user.id, role: MamcosStaffRole.SECRETARY }, select: { mamcosId: true } });
      if (!secretary || secretary.mamcosId !== farm.mamcosId) {
        throw new NotFoundException('This farm is outside your assigned AMCOS');
      }
    }
    return this.prisma.farm.update({ where: { id }, data: { isVerified: true } });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.farm.delete({ where: { id } });
  }

  // --------------------------------------------------------------------------
  // Documents
  // --------------------------------------------------------------------------

  async addDocument(farmId: string, dto: LinkDocumentDto, user: RequestUser) {
    await this.ownership.assertFarmAccess(user, farmId);
    const farm = await this.findOne(farmId);
    const document = await this.documents.createForFarm(farmId, { ...dto, uploadedById: user.id });
    await this.activities.log(
      farm.farmerId,
      'document.added',
      `Uploaded ${(dto.type || 'document').toString().replace('_', ' ')}`,
      dto.fileName || 'File attached',
      '📄',
    );
    return document;
  }

  async listDocuments(farmId: string) {
    await this.findOne(farmId);
    return this.documents.listForFarm(farmId);
  }

  // --------------------------------------------------------------------------
  // Productivity report — yield & cost per acre, from real crop cycles
  // --------------------------------------------------------------------------

  async getProductivity(id: string, user: RequestUser) {
    const farm = await this.prisma.farm.findUnique({
      where: { id },
      include: {
        cropCycles: { include: { costs: true, revenues: true } },
        plots: true,
      },
    });
    if (!farm) throw new NotFoundException(`Farm with ID ${id} not found`);

    const acres =
      farm.actualAcres ?? (farm.socialHectares ? farm.socialHectares * 2.47105 : 0);

    // Premium gate: free users get a safe preview — never the analytics values.
    if (!(await this.memberships.hasPremiumAccess(user))) {
      return {
        locked: true,
        code: 'MEMBERSHIP_REQUIRED',
        farmId: farm.id,
        farmCode: farm.farmCode,
        acres: Number(acres.toFixed(2)),
        plots: farm.plots.length,
        cropCycles: farm.cropCycles.length,
        message:
          'Activate your MAYOData membership to view the full productivity analysis and recommendations.',
      };
    }

    let totalYieldKg = 0;
    let totalCosts = 0;
    let totalRevenues = 0;
    for (const c of farm.cropCycles) {
      totalYieldKg += c.actualYieldKg ?? 0;
      totalCosts += c.costs.reduce((s, x) => s + x.totalCost, 0);
      totalRevenues += c.revenues.reduce((s, x) => s + x.totalRevenue, 0);
    }

    return {
      farmId: farm.id,
      farmCode: farm.farmCode,
      acres: Number(acres.toFixed(2)),
      plots: farm.plots.length,
      cropCycles: farm.cropCycles.length,
      totalYieldKg,
      totalCosts,
      totalRevenues,
      netProfit: totalRevenues - totalCosts,
      yieldPerAcre: acres > 0 ? Number((totalYieldKg / acres).toFixed(1)) : null,
      costPerAcre: acres > 0 ? Number((totalCosts / acres).toFixed(0)) : null,
      costPerKg: totalYieldKg > 0 ? Number((totalCosts / totalYieldKg).toFixed(1)) : null,
    };
  }

  // --------------------------------------------------------------------------
  // Dashboard aggregates
  // --------------------------------------------------------------------------

  async getOverview() {
    const [totalFarms, totalPlots, verified, mapped, byGrade] = await Promise.all([
      this.prisma.farm.count(),
      this.prisma.plot.count(),
      this.prisma.farm.count({ where: { isVerified: true } }),
      this.prisma.farm.count({ where: { centerLatitude: { not: null } } }),
      this.prisma.farm.groupBy({ by: ['grade'], _count: true }),
    ]);

    return {
      totalFarms,
      totalPlots,
      verifiedFarms: verified,
      mappedFarms: mapped,
      unmappedFarms: totalFarms - mapped,
      byGrade: byGrade.map((g) => ({ grade: g.grade, count: g._count })),
    };
  }
}
