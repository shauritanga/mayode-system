import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { IrrigationScopeService } from './irrigation-scope.service';
import { diffRecords, writeAudit } from './irrigation-audit';
import { num, toDate, userNames } from './irrigation-common';
import { CreateSchemeDto, UpdateSchemeDto } from './dto/irrigation.dto';

const view = (s: any) => ({
  ...s,
  hectaresPerBlock: num(s.hectaresPerBlock),
  coverageHectares: s.coverageHectares ?? null,
});

@Injectable()
export class SchemesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: IrrigationScopeService,
  ) {}

  async list(actor: RequestUser, q: { q?: string; status?: string }) {
    const scope = await this.scopeService.resolve(actor);
    const rows = await this.prisma.irrigationScheme.findMany({
      where: {
        ...this.scopeService.schemeWhere(scope),
        ...(q.status ? { status: q.status as any } : {}),
        ...(q.q
          ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] }
          : {}),
      },
      include: { mamcos: { select: { id: true, name: true } }, _count: { select: { canals: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(view);
  }

  async get(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const scheme = await this.prisma.irrigationScheme.findFirst({
      where: { id, ...this.scopeService.schemeWhere(scope) },
      include: { mamcos: { select: { id: true, name: true } }, _count: { select: { canals: true } } },
    });
    if (!scheme) throw new NotFoundException('Irrigation scheme not found');
    const names = await userNames(this.prisma, [scheme.createdById, scheme.updatedById]);
    return {
      ...view(scheme),
      createdByName: names.get(scheme.createdById ?? '') ?? null,
      updatedByName: names.get(scheme.updatedById ?? '') ?? null,
    };
  }

  async create(actor: RequestUser, dto: CreateSchemeDto) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Registering a scheme');
    const mamcosId = actor.role === UserRole.SUPER_ADMIN ? dto.mamcosId : (actor.mamcosId ?? undefined);
    if (!mamcosId) throw new BadRequestException('Choose the AMCOS this scheme belongs to');
    const mamcos = await this.prisma.mamcos.findUnique({ where: { id: mamcosId } });
    if (!mamcos) throw new BadRequestException('AMCOS not found');
    this.assertBlockLimits(dto.minBlocksPerCanal ?? 15, dto.maxBlocksPerCanal ?? 16);
    await this.assertCodeFree(dto.code);
    const status = dto.status ?? 'ACTIVE';
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.irrigationScheme.create({
        data: {
          mamcosId,
          code: dto.code.trim(),
          name: dto.name.trim(),
          region: dto.region.trim(),
          district: dto.district.trim(),
          ward: dto.ward?.trim() || null,
          village: dto.village?.trim() || null,
          waterSource: dto.waterSource.trim(),
          establishedOn: dto.establishedOn ? toDate(dto.establishedOn, 'establishment date') : null,
          description: dto.description?.trim() || null,
          status,
          isActive: status !== 'INACTIVE',
          plannedCanalCount: dto.plannedCanalCount ?? 6,
          minBlocksPerCanal: dto.minBlocksPerCanal ?? 15,
          maxBlocksPerCanal: dto.maxBlocksPerCanal ?? 16,
          hectaresPerBlock: dto.hectaresPerBlock ?? 30,
          maxHectaresPerFarmer: dto.maxHectaresPerFarmer ?? null,
          requireAllocationApproval: dto.requireAllocationApproval ?? false,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await writeAudit(tx, actor, 'irrigation_scheme', created.id, 'create', null, created as any);
      return view(created);
    });
  }

  async update(actor: RequestUser, id: string, dto: UpdateSchemeDto) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Editing a scheme');
    const existing = await this.scopeService.assertScheme(scope, id);
    if (dto.code && dto.code.trim().toLowerCase() !== (existing.code ?? '').toLowerCase()) await this.assertCodeFree(dto.code, id);
    this.assertBlockLimits(dto.minBlocksPerCanal ?? existing.minBlocksPerCanal, dto.maxBlocksPerCanal ?? existing.maxBlocksPerCanal);
    if (dto.maxHectaresPerFarmer != null) {
      // A new per-member limit must not be below what members already hold, or the policy would be false on day one.
      const [over] = await this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
        SELECT count(*) AS n FROM (
          SELECT a.farmer_id FROM irrigation_hectare_allocations a
          JOIN irrigation_hectares h ON h.id = a.hectare_id
          JOIN irrigation_blocks b ON b.id = h.block_id
          JOIN irrigation_canals c ON c.id = b.canal_id
          WHERE c.scheme_id = ${id} AND a.status = 'ACTIVE'
          GROUP BY a.farmer_id HAVING count(*) > ${dto.maxHectaresPerFarmer}) x`);
      if (Number(over.n) > 0)
        throw new ConflictException(`${over.n} member(s) already hold more than ${dto.maxHectaresPerFarmer} hectares; transfer or release those first`);
    }
    const data: Prisma.IrrigationSchemeUpdateInput = {
      ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.region !== undefined ? { region: dto.region.trim() } : {}),
      ...(dto.district !== undefined ? { district: dto.district.trim() } : {}),
      ...(dto.ward !== undefined ? { ward: dto.ward.trim() || null } : {}),
      ...(dto.village !== undefined ? { village: dto.village.trim() || null } : {}),
      ...(dto.waterSource !== undefined ? { waterSource: dto.waterSource.trim() } : {}),
      ...(dto.establishedOn !== undefined ? { establishedOn: dto.establishedOn ? toDate(dto.establishedOn, 'establishment date') : null } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status, isActive: dto.status !== 'INACTIVE' } : {}),
      ...(dto.plannedCanalCount !== undefined ? { plannedCanalCount: dto.plannedCanalCount } : {}),
      ...(dto.minBlocksPerCanal !== undefined ? { minBlocksPerCanal: dto.minBlocksPerCanal } : {}),
      ...(dto.maxBlocksPerCanal !== undefined ? { maxBlocksPerCanal: dto.maxBlocksPerCanal } : {}),
      ...(dto.hectaresPerBlock !== undefined ? { hectaresPerBlock: dto.hectaresPerBlock } : {}),
      ...(dto.maxHectaresPerFarmer !== undefined ? { maxHectaresPerFarmer: dto.maxHectaresPerFarmer } : {}),
      ...(dto.requireAllocationApproval !== undefined ? { requireAllocationApproval: dto.requireAllocationApproval } : {}),
      updatedById: actor.id,
    };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.irrigationScheme.update({ where: { id }, data });
      const changes = diffRecords(existing as any, updated as any);
      if (Object.keys(changes).length)
        await writeAudit(tx, actor, 'irrigation_scheme', id, 'update', existing as any, { changes } as any);
      return view(updated);
    });
  }

  /** Newest-first change history for the scheme edit page. */
  async history(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    await this.scopeService.assertScheme(scope, id);
    return this.entityHistory('irrigation_scheme', id);
  }

  async entityHistory(entityType: string, entityId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const names = await userNames(this.prisma, rows.map((r) => r.userId));
    return rows.map((r) => ({
      id: r.id,
      action: r.action.split('.').pop(),
      at: r.createdAt,
      by: names.get(r.userId ?? '') ?? null,
      changes: (r.newData as any)?.changes ?? null,
      snapshot: (r.newData as any)?.changes ? null : r.newData,
    }));
  }

  private assertBlockLimits(min: number, max: number) {
    if (min > max) throw new BadRequestException('Minimum blocks per canal cannot exceed the maximum');
  }

  private async assertCodeFree(code: string, exceptId?: string) {
    const clash = await this.prisma.irrigationScheme.findFirst({
      where: { code: { equals: code.trim(), mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`Scheme code "${code.trim()}" is already used by another scheme`);
  }
}
