import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, nextRef, owner, scope, Tx } from './ops-common';
import { CreateMayodeFarmDto, NewCropCycleDto, UpsertFarmDto } from './dto/farm.dto';

type User = Actor & { id: string };

/**
 * A farm boundary drawn on the map: a GeoJSON Polygon with at least three corners, every point a valid
 * [longitude, latitude]. The ring is closed if the caller left it open. Returns undefined when none was given.
 */
export function cleanBoundary(raw: unknown): { type: 'Polygon'; coordinates: number[][][] } | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const ring = (raw as { type?: string; coordinates?: unknown })?.type === 'Polygon' ? (raw as { coordinates: unknown[][] }).coordinates?.[0] : undefined;
  const bad = 'Draw at least three corners for the farm boundary';
  if (!Array.isArray(ring)) throw new BadRequestException(bad);
  const points = ring.map((pt) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : [NaN, NaN]));
  if (points.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90)) throw new BadRequestException(bad);
  const [first, last] = [points[0], points[points.length - 1]];
  const closed = first && last && first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
  if (closed.length < 4) throw new BadRequestException(bad);
  return { type: 'Polygon', coordinates: [closed] };
}

/** Mayode's own farms: registered apart from external farmers' land, with plots, a manager and crop-cycle history. */
@Injectable()
export class FarmOpsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crop cycles need a grower. Mayode's own farms use one inactive record that stands for the company, so it never logs in. */
  private async companyFarmer(tx: Tx, mamcosId: string | null) {
    const phone = mamcosId ? `MAYODE-FARMS-${mamcosId}` : 'MAYODE-FARMS';
    const user = await tx.user.upsert({
      where: { phone },
      update: {},
      create: { phone, passwordHash: '!', role: UserRole.FARMER, firstName: 'Mayode', lastName: 'Farms', isActive: false, mamcosId },
    });
    const existing = await tx.farmer.findUnique({ where: { userId: user.id } });
    if (existing) return existing;
    return tx.farmer.create({ data: { userId: user.id, controlNumber: mamcosId ? `MFARMS-${mamcosId.slice(0, 6)}` : 'MFARMS', firstName: 'Mayode', lastName: 'Farms', mamcosId, verificationStatus: 'VERIFIED' } });
  }

  async farms(actor: Actor, f: { q?: string; active?: string } = {}) {
    const farms = await this.prisma.farm.findMany({
      where: {
        ...scope(actor), isMayodeFarm: true,
        ...(f.active === 'false' ? { isActive: false } : f.active === 'true' ? { isActive: true } : {}),
        ...(f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { farmCode: { contains: f.q, mode: 'insensitive' } }] } : {}),
      },
      include: {
        plots: { select: { id: true, plotCode: true, name: true, sizeAcres: true, currentStage: true, centerLatitude: true, centerLongitude: true, boundaryCoordinates: true } },
        cropCycles: { select: { id: true, plotId: true, season: true, riceVariety: true, status: true, growthStage: true, actualYieldKg: true, estimatedYieldKg: true }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { name: 'asc' },
    });
    const managers = new Map((await this.prisma.user.findMany({ where: { id: { in: farms.map((x) => x.managerUserId).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true } })).map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]));
    return farms.map((x) => ({ ...x, managerName: x.managerUserId ? managers.get(x.managerUserId) ?? null : null, activeCycles: x.cropCycles.filter((c) => ['ACTIVE', 'PLANNED'].includes(c.status)).length }));
  }

  private async managerCheck(managerUserId: string | undefined, actor: Actor) {
    if (!managerUserId) return;
    const u = await this.prisma.user.findUnique({ where: { id: managerUserId }, select: { isActive: true, mamcosId: true } });
    if (!u || !u.isActive || (u.mamcosId ?? null) !== owner(actor)) throw new BadRequestException('Choose an active user from your organisation as the farm manager');
  }

  async createFarm(dto: CreateMayodeFarmDto, actor: User) {
    await this.managerCheck(dto.managerUserId, actor);
    const farm = await this.prisma.$transaction(async (tx) => {
      const farmCode = dto.farmCode?.trim() || (await nextRef(tx, 'MF', 3));
      const created = await tx.farm.create({
        data: {
          farmCode, name: dto.name.trim(), mamcosId: owner(actor), socialHectares: dto.socialHectares, region: dto.region, district: dto.district, ward: dto.ward, village: dto.village,
          centerLatitude: dto.centerLatitude, centerLongitude: dto.centerLongitude, boundaryCoordinates: cleanBoundary(dto.boundaryCoordinates) ?? undefined, soilType: dto.soilType, soilFertility: dto.soilFertility, waterSource: dto.waterSource,
          irrigationMethod: dto.irrigationMethod, hasIrrigation: dto.hasIrrigation ?? false, ownershipType: 'OWNED', ownerName: 'Mayode', isMayodeFarm: true, managerUserId: dto.managerUserId ?? null,
        },
      });
      let n = 0;
      for (const p of dto.plots ?? []) {
        n += 1;
        await tx.plot.create({ data: { farmId: created.id, plotCode: `${farmCode}-P${n}`, name: p.name ?? `Plot ${n}`, sizeAcres: p.sizeAcres, centerLatitude: p.centerLatitude ?? dto.centerLatitude, centerLongitude: p.centerLongitude ?? dto.centerLongitude, soilCondition: p.soilCondition, irrigationStatus: p.irrigationStatus } });
      }
      await this.companyFarmer(tx, owner(actor));
      return created;
    }).catch((e) => {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A farm with this code already exists');
      throw e;
    });
    return this.farm(farm.id, actor);
  }

  async farm(id: string, actor: Actor) {
    const f = await this.prisma.farm.findUnique({ where: { id }, include: { plots: true, cropCycles: { orderBy: { createdAt: 'desc' } } } });
    assertVisible(actor, f, 'Farm');
    return f;
  }

  async updateFarm(id: string, dto: UpsertFarmDto, actor: User) {
    const f = await this.prisma.farm.findUnique({ where: { id } });
    assertVisible(actor, f, 'Farm');
    await this.managerCheck(dto.managerUserId, actor);
    const boundary = cleanBoundary(dto.boundaryCoordinates);
    await this.prisma.farm.update({
      where: { id },
      data: {
        managerUserId: dto.managerUserId, isMayodeFarm: dto.isMayodeFarm, isActive: dto.isActive, centerLatitude: dto.centerLatitude, centerLongitude: dto.centerLongitude,
        ...(boundary === undefined ? {} : { boundaryCoordinates: boundary === null ? Prisma.DbNull : boundary }),
      },
    });
    return this.farm(id, actor);
  }

  async addPlot(farmId: string, dto: { name?: string; sizeAcres?: number; centerLatitude?: number; centerLongitude?: number; soilCondition?: string; irrigationStatus?: string }, actor: User) {
    const f = await this.prisma.farm.findUnique({ where: { id: farmId }, include: { _count: { select: { plots: true } } } });
    assertVisible(actor, f, 'Farm');
    const n = f._count.plots + 1;
    return this.prisma.plot.create({ data: { farmId, plotCode: `${f.farmCode}-P${n}`, name: dto.name ?? `Plot ${n}`, sizeAcres: dto.sizeAcres, centerLatitude: dto.centerLatitude ?? f.centerLatitude, centerLongitude: dto.centerLongitude ?? f.centerLongitude, soilCondition: dto.soilCondition, irrigationStatus: dto.irrigationStatus } });
  }

  /** A new season on a plot. Earlier cycles stay exactly as they were. */
  async newCropCycle(dto: NewCropCycleDto, actor: User) {
    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    assertVisible(actor, farm, 'Farm');
    const plot = await this.prisma.plot.findUnique({ where: { id: dto.plotId } });
    if (!plot || plot.farmId !== farm.id) throw new BadRequestException('That plot is not on this farm');
    const open = await this.prisma.cropCycle.count({ where: { plotId: plot.id, status: { in: ['ACTIVE', 'PLANNED'] } } });
    if (open) throw new ConflictException('This plot already has a crop cycle in progress. Finish or harvest it before starting a new one.');
    return this.prisma.$transaction(async (tx) => {
      const grower = await this.companyFarmer(tx, farm.mamcosId);
      const cycle = await tx.cropCycle.create({
        data: { farmId: farm.id, plotId: plot.id, farmerId: grower.id, season: dto.season.trim(), riceVariety: dto.riceVariety, plantingDate: dto.plantingDate ? new Date(dto.plantingDate) : null, expectedHarvest: dto.expectedHarvest ? new Date(dto.expectedHarvest) : null, areaPlantedHa: dto.areaPlantedHa, estimatedYieldKg: dto.estimatedYieldKg, status: 'PLANNED' },
      });
      await tx.plot.update({ where: { id: plot.id }, data: { currentStage: 'LAND_PREPARATION' } });
      return cycle;
    });
  }

  /** Mayode staff who can be given farm work: active users in this organisation holding the field-work permission. */
  async assignees(actor: Actor) {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true, mamcosId: owner(actor),
        OR: [{ role: UserRole.SUPER_ADMIN }, { customRole: { isActive: true, permissions: { some: { action: 'VIEW', resource: { key: 'ops_field_work' } } } } }],
      },
      select: { id: true, firstName: true, lastName: true, phone: true, customRole: { select: { name: true } } },
      orderBy: { firstName: 'asc' },
    });
    return users.map((u) => ({ id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone, role: u.customRole?.name ?? 'Super Admin' }));
  }

  async lookups(actor: Actor) {
    const [warehouses, farmers, mayodeFarms] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { ...scope(actor), isActive: true }, select: { id: true, name: true, location: true }, orderBy: { name: 'asc' } }),
      this.prisma.farmer.count({ where: scope(actor) }),
      this.prisma.farm.findMany({ where: { ...scope(actor), isMayodeFarm: true, isActive: true }, select: { id: true, name: true, farmCode: true }, orderBy: { name: 'asc' } }),
    ]);
    return { warehouses, farmers, mayodeFarms };
  }

  /** Farmers for the receiving screen's dropdown: everyone in scope by name, or those matching a search. */
  async searchFarmers(actor: Actor, q: string) {
    const term = q.trim();
    return this.prisma.farmer.findMany({
      where: {
        ...scope(actor),
        ...(term ? { OR: [{ firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { controlNumber: { contains: term, mode: 'insensitive' } }, { nationalId: { contains: term } }] } : {}),
      },
      select: { id: true, controlNumber: true, firstName: true, lastName: true, village: true, district: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 1000,
    });
  }

  /** Farms, plots and crop seasons a farmer can be linked to when their rice arrives. */
  async farmerRecords(farmerId: string, actor: Actor) {
    const f = await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { id: true, mamcosId: true } });
    assertVisible(actor, f, 'Farmer');
    const cycles = await this.prisma.cropCycle.findMany({
      where: { farmerId },
      select: { id: true, season: true, riceVariety: true, plantingDate: true, harvestDate: true, status: true, farm: { select: { id: true, farmCode: true, name: true } }, plot: { select: { id: true, plotCode: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { cycles };
  }

  async harvestOptions(actor: Actor, f: { farmId?: string } = {}) {
    return this.prisma.harvestRecord.findMany({
      where: { ...scope(actor), ...(f.farmId ? { farmId: f.farmId } : {}), status: { not: 'CLOSED' } },
      select: { id: true, reference: true, batchRef: true, farmId: true, plotId: true, cropCycleId: true, riceVariety: true, actualKg: true, transportedKg: true, harvestDate: true },
      orderBy: { harvestDate: 'desc' },
      take: 50,
    });
  }

  async notFound(): Promise<never> {
    throw new NotFoundException('Not found');
  }
}
