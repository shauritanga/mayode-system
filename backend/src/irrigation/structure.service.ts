import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { IrrigationScope, IrrigationScopeService } from './irrigation-scope.service';
import { diffRecords, writeAudit } from './irrigation-audit';
import { fullName, num, paged, paging, rethrowIntegrity, today, userNames, type Db } from './irrigation-common';
import { SchemesService } from './schemes.service';
import { blockCodeFor, hectareCodeFor, pad2, type BlockSide } from './irrigation-codes';
import {
  CreateBlockDto, CreateCanalDto, CreateHectareDto, UpdateBlockDto, UpdateCanalDto,
} from './dto/irrigation.dto';

const pad = pad2;

export interface BlockStats {
  hectareUnits: number;
  totalArea: number;
  allocatedUnits: number;
  allocatedArea: number;
  pendingUnits: number;
  unallocatedUnits: number;
  unallocatedArea: number;
  farmerCount: number;
}
const emptyStats = (): BlockStats => ({
  hectareUnits: 0, totalArea: 0, allocatedUnits: 0, allocatedArea: 0, pendingUnits: 0,
  unallocatedUnits: 0, unallocatedArea: 0, farmerCount: 0,
});

export type LeaderState = 'ASSIGNED' | 'TERM_EXPIRED' | 'NONE';
export type AllocationState = 'NONE' | 'PARTIAL' | 'FULL';

export const allocationState = (s: BlockStats): AllocationState =>
  s.allocatedUnits === 0 ? 'NONE' : s.allocatedUnits >= s.hectareUnits && s.hectareUnits > 0 ? 'FULL' : 'PARTIAL';

@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: IrrigationScopeService,
    private readonly schemes: SchemesService,
  ) {}

  // ───────────────────────── shared aggregates ─────────────────────────

  /** Hectare / allocation / farmer counts per block, straight from the allocation tables. */
  async blockStats(blockIds: string[], db: Db = this.prisma): Promise<Map<string, BlockStats>> {
    const out = new Map<string, BlockStats>(blockIds.map((id) => [id, emptyStats()]));
    if (!blockIds.length) return out;
    const rows = await db.$queryRaw<any[]>(Prisma.sql`
      SELECT h.block_id AS "blockId",
             count(*) FILTER (WHERE h.is_active) AS units,
             coalesce(sum(h.area_hectares) FILTER (WHERE h.is_active), 0) AS area,
             count(a.id) FILTER (WHERE a.status = 'ACTIVE') AS allocated,
             coalesce(sum(h.area_hectares) FILTER (WHERE a.status = 'ACTIVE'), 0) AS "allocatedArea",
             count(a.id) FILTER (WHERE a.status = 'PENDING_APPROVAL') AS pending,
             count(DISTINCT a.farmer_id) FILTER (WHERE a.status = 'ACTIVE') AS farmers
      FROM irrigation_hectares h
      LEFT JOIN irrigation_hectare_allocations a
        ON a.hectare_id = h.id AND a.status IN ('ACTIVE', 'PENDING_APPROVAL')
      WHERE h.block_id IN (${Prisma.join(blockIds)})
      GROUP BY h.block_id`);
    for (const r of rows) {
      const totalArea = num(r.area);
      const allocatedArea = num(r.allocatedArea);
      out.set(r.blockId, {
        hectareUnits: Number(r.units), totalArea, allocatedUnits: Number(r.allocated), allocatedArea,
        pendingUnits: Number(r.pending), unallocatedUnits: Number(r.units) - Number(r.allocated),
        unallocatedArea: totalArea - allocatedArea, farmerCount: Number(r.farmers),
      });
    }
    return out;
  }

  /** Current leader per canal / block, with term state. Expired-but-open terms are reported, not hidden. */
  async leaders(where: Prisma.IrrigationLeadershipWhereInput) {
    const rows = await this.prisma.irrigationLeadership.findMany({
      where: { status: 'ACTIVE', ...where },
      include: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } },
    });
    const now = today();
    const canal = new Map<string, any>();
    const block = new Map<string, any>();
    for (const r of rows) {
      const entry = {
        id: r.id,
        farmerId: r.farmer.id,
        name: fullName(r.farmer),
        memberNumber: r.farmer.controlNumber,
        termStart: r.termStart,
        termEnd: r.termEnd,
        state: (r.termEnd && r.termEnd < now ? 'TERM_EXPIRED' : 'ASSIGNED') as LeaderState,
      };
      if (r.position === 'CANAL_LEADER') canal.set(r.canalId, entry);
      else if (r.blockId) block.set(r.blockId, entry);
    }
    return { canal, block };
  }

  // ───────────────────────── canals ─────────────────────────

  async listCanals(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const { page, pageSize, skip, take } = paging(q as any);
    const where: Prisma.IrrigationCanalWhereInput = {
      AND: [
        this.scopeService.canalWhere(scope),
        q.schemeId ? { schemeId: q.schemeId } : {},
        q.status ? { status: q.status as any } : {},
        q.archived === 'true' ? { archivedAt: { not: null } } : { archivedAt: null },
        q.hasLeader === 'true' ? { leaderships: { some: { status: 'ACTIVE', position: 'CANAL_LEADER' } } } : {},
        q.hasLeader === 'false' ? { leaderships: { none: { status: 'ACTIVE', position: 'CANAL_LEADER' } } } : {},
        q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {},
      ],
    };
    const [total, canals] = await Promise.all([
      this.prisma.irrigationCanal.count({ where }),
      this.prisma.irrigationCanal.findMany({
        where, skip, take, orderBy: [{ schemeId: 'asc' }, { canalNumber: 'asc' }],
        include: { scheme: { select: { id: true, name: true, code: true } } },
      }),
    ]);
    const rows = await this.decorateCanals(scope, canals);
    return paged(rows, total, page, pageSize);
  }

  private async decorateCanals(scope: IrrigationScope, canals: any[]) {
    const ids = canals.map((c) => c.id);
    const blocks = await this.prisma.irrigationBlock.findMany({
      where: { AND: [{ canalId: { in: ids }, archivedAt: null }, this.scopeService.blockWhere(scope)] },
      select: { id: true, canalId: true, areaHectares: true },
    });
    const { canal: leaders } = await this.leaders({ canalId: { in: ids } });
    return canals.map((c) => {
      const mine = blocks.filter((b) => b.canalId === c.id);
      return {
        ...c,
        lengthKm: c.lengthKm == null ? null : num(c.lengthKm),
        blockCount: mine.length,
        totalBlockArea: mine.reduce((sum, b) => sum + num(b.areaHectares), 0),
        leader: leaders.get(c.id) ?? null,
      };
    });
  }

  async getCanal(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const canal = await this.scopeService.assertCanal(scope, id);
    const [row] = await this.decorateCanals(scope, [canal]);
    const blocks = await this.blockRows(scope, { canalId: id, archivedAt: null });
    const total = blocks.reduce((t, b) => ({
      units: t.units + b.stats.hectareUnits, allocated: t.allocated + b.stats.allocatedUnits,
      farmers: t.farmers + b.stats.farmerCount, area: t.area + b.stats.totalArea,
    }), { units: 0, allocated: 0, farmers: 0, area: 0 });
    const names = await userNames(this.prisma, [canal.createdById, canal.updatedById]);
    return {
      ...row,
      createdByName: names.get(canal.createdById ?? '') ?? null,
      updatedByName: names.get(canal.updatedById ?? '') ?? null,
      blocks,
      summary: {
        hectareUnits: total.units, allocatedUnits: total.allocated, unallocatedUnits: total.units - total.allocated,
        farmerAllocations: total.allocated, area: total.area,
        blocksWithoutLeader: blocks.filter((b) => b.leader?.state !== 'ASSIGNED').length,
        plannedBlocks: { min: canal.scheme.minBlocksPerCanal, max: canal.scheme.maxBlocksPerCanal },
      },
    };
  }

  async createCanal(actor: RequestUser, dto: CreateCanalDto) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Adding a canal');
    const scheme = await this.scopeService.assertScheme(scope, dto.schemeId);
    const code = dto.code?.trim() || `C${pad(dto.canalNumber)}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.irrigationCanal.create({
          data: {
            schemeId: scheme.id, canalNumber: dto.canalNumber, code,
            name: dto.name?.trim() || `Canal ${pad(dto.canalNumber)}`,
            status: dto.status ?? 'ACTIVE', description: dto.description?.trim() || null,
            lengthKm: dto.lengthKm ?? null, headworks: dto.headworks?.trim() || null,
            infrastructureNotes: dto.infrastructureNotes?.trim() || null,
            createdById: actor.id, updatedById: actor.id,
          },
        });
        await writeAudit(tx, actor, 'irrigation_canal', created.id, 'create', null, created as any);
        return created;
      });
    } catch (error) {
      rethrowIntegrity(error, {
        irrigation_canals_scheme_id_canal_number_key: `Canal ${dto.canalNumber} already exists in this scheme`,
        irrigation_canals_scheme_id_code_key: `Canal code "${code}" is already used in this scheme`,
        'Unique constraint failed': `Canal ${dto.canalNumber} or code "${code}" already exists in this scheme`,
      });
    }
  }

  async updateCanal(actor: RequestUser, id: string, dto: UpdateCanalDto) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Editing a canal');
    const existing = await this.scopeService.assertCanal(scope, id);
    const { scheme: _s, ...before } = existing;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.irrigationCanal.update({
          where: { id },
          data: {
            ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
            ...(dto.lengthKm !== undefined ? { lengthKm: dto.lengthKm } : {}),
            ...(dto.headworks !== undefined ? { headworks: dto.headworks.trim() || null } : {}),
            ...(dto.infrastructureNotes !== undefined ? { infrastructureNotes: dto.infrastructureNotes.trim() || null } : {}),
            updatedById: actor.id,
          },
        });
        const changes = diffRecords(before as any, updated as any);
        if (Object.keys(changes).length) await writeAudit(tx, actor, 'irrigation_canal', id, 'update', before as any, { changes } as any);
        return updated;
      });
    } catch (error) {
      rethrowIntegrity(error, { 'Unique constraint failed': 'That canal code is already used in this scheme' });
    }
  }

  async setCanalArchived(actor: RequestUser, id: string, archived: boolean) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Archiving a canal');
    const canal = await this.scopeService.assertCanal(scope, id);
    if (archived) {
      const live = await this.prisma.irrigationBlock.count({ where: { canalId: id, archivedAt: null } });
      if (live) throw new ConflictException(`This canal still has ${live} block(s). Archive or move them first.`);
      const leader = await this.prisma.irrigationLeadership.count({ where: { canalId: id, status: 'ACTIVE' } });
      if (leader) throw new ConflictException('End the active leadership appointment before archiving this canal.');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.irrigationCanal.update({
        where: { id }, data: { archivedAt: archived ? new Date() : null, updatedById: actor.id },
      });
      await writeAudit(tx, actor, 'irrigation_canal', id, archived ? 'archive' : 'restore', { archivedAt: canal.archivedAt }, { archivedAt: updated.archivedAt });
      return updated;
    });
  }

  canalHistory(actor: RequestUser, id: string) {
    return this.scopeService.resolve(actor)
      .then((scope) => this.scopeService.assertCanal(scope, id))
      .then(() => this.schemes.entityHistory('irrigation_canal', id));
  }

  // ───────────────────────── blocks ─────────────────────────

  async blockRows(scope: IrrigationScope, where: Prisma.IrrigationBlockWhereInput) {
    const blocks = await this.prisma.irrigationBlock.findMany({
      where: { AND: [this.scopeService.blockWhere(scope), where] },
      include: { canal: { select: { id: true, canalNumber: true, code: true, name: true, schemeId: true } } },
      orderBy: [{ canal: { canalNumber: 'asc' } }, { blockNumber: 'asc' }],
    });
    const stats = await this.blockStats(blocks.map((b) => b.id));
    const { block: leaders } = await this.leaders({ blockId: { in: blocks.map((b) => b.id) } });
    return blocks.map((b) => {
      const s = stats.get(b.id)!;
      return {
        ...b, areaHectares: num(b.areaHectares), stats: s, allocationState: allocationState(s),
        leader: leaders.get(b.id) ?? null,
      };
    });
  }

  async listBlocks(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const { page, pageSize, skip } = paging(q as any);
    let rows = await this.blockRows(scope, {
      ...(q.schemeId ? { canal: { schemeId: q.schemeId } } : {}),
      ...(q.canalId ? { canalId: q.canalId } : {}),
      ...(q.blockNumber ? { blockNumber: Number(q.blockNumber) } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      archivedAt: q.archived === 'true' ? { not: null } : null,
      ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    });
    if (q.allocation) rows = rows.filter((r) => r.allocationState === q.allocation);
    if (q.leadership === 'ASSIGNED') rows = rows.filter((r) => r.leader?.state === 'ASSIGNED');
    if (q.leadership === 'UNASSIGNED') rows = rows.filter((r) => r.leader?.state !== 'ASSIGNED');
    return paged(rows.slice(skip, skip + pageSize), rows.length, page, pageSize);
  }

  async getBlock(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const block = await this.scopeService.assertBlock(scope, id);
    const [row] = await this.blockRows(scope, { id });
    const canalLeader = (await this.leaders({ canalId: block.canalId })).canal.get(block.canalId) ?? null;
    const names = await userNames(this.prisma, [block.createdById, block.updatedById]);
    return {
      ...row,
      scheme: { id: block.canal.scheme.id, name: block.canal.scheme.name, code: block.canal.scheme.code },
      canalLeader,
      createdByName: names.get(block.createdById ?? '') ?? null,
      updatedByName: names.get(block.updatedById ?? '') ?? null,
    };
  }

  /** Creates the block and its hectare units in one transaction, so a block never exists without them. */
  async createBlock(actor: RequestUser, dto: CreateBlockDto) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Adding a block');
    const canal = await this.scopeService.assertCanal(scope, dto.canalId);
    if (canal.archivedAt) throw new BadRequestException('This canal is archived');
    const scheme = canal.scheme;
    const code = dto.code?.trim() || blockCodeFor(canal.canalNumber, dto.blockNumber, dto.side);
    const hectareCount = Math.round(num(scheme.hectaresPerBlock));
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialise block creation per canal so the maximum-blocks rule cannot be raced past.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'irrigation-canal:' + canal.id}))`;
        const existing = await tx.irrigationBlock.count({ where: { canalId: canal.id, archivedAt: null } });
        if (existing >= scheme.maxBlocksPerCanal)
          throw new ConflictException(`${canal.name} already has ${existing} blocks, the maximum set for this scheme (${scheme.maxBlocksPerCanal})`);
        const block = await tx.irrigationBlock.create({
          data: {
            canalId: canal.id, blockNumber: dto.blockNumber, code, side: dto.side,
            name: dto.name?.trim() || `Block ${pad(dto.blockNumber)}`,
            areaHectares: hectareCount, hectareCount,
            status: dto.status ?? 'ACTIVE', description: dto.description?.trim() || null,
            createdById: actor.id, updatedById: actor.id,
          },
        });
        await this.generateHectares(tx, block.id, code, hectareCount, 1, new Set(), dto.side);
        await writeAudit(tx, actor, 'irrigation_block', block.id, 'create', null, { ...block, hectareUnitsGenerated: hectareCount } as any);
        return block;
      });
    } catch (error) {
      rethrowIntegrity(error, {
        irrigation_blocks_canal_id_block_number_key: `Block ${dto.blockNumber} already exists in ${canal.name}`,
        irrigation_blocks_canal_id_code_key: `Block code "${code}" is already used in ${canal.name}`,
        'Unique constraint failed': `Block ${dto.blockNumber} or code "${code}" already exists in ${canal.name}`,
      });
    }
  }

  private async generateHectares(tx: Db, blockId: string, blockCode: string, upTo: number, from: number, skip = new Set<number>(), side?: BlockSide | null) {
    const data: Prisma.IrrigationHectareCreateManyInput[] = [];
    for (let n = from; n <= upTo; n++) {
      if (skip.has(n)) continue;
      data.push({ blockId, hectareNumber: n, code: hectareCodeFor(blockCode, n, side), areaHectares: 1 });
    }
    if (data.length) await tx.irrigationHectare.createMany({ data });
    return data.length;
  }

  /** Fills any missing unit numbers 1..hectareCount (for legacy blocks); never exceeds the block's size. */
  async initializeHectares(actor: RequestUser, blockId: string) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Initialising hectares');
    const block = await this.scopeService.assertBlock(scope, blockId);
    return this.prisma.$transaction(async (tx) => {
      const have = new Set((await tx.irrigationHectare.findMany({ where: { blockId }, select: { hectareNumber: true } })).map((h) => h.hectareNumber));
      const created = await this.generateHectares(tx, blockId, block.code, block.hectareCount, 1, have, block.side);
      if (created) await writeAudit(tx, actor, 'irrigation_block', blockId, 'initialize-hectares', null, { created });
      return { created, total: have.size + created };
    });
  }

  async createHectare(actor: RequestUser, dto: CreateHectareDto) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Adding a hectare');
    const block = await this.scopeService.assertBlock(scope, dto.blockId);
    try {
      return await this.prisma.irrigationHectare.create({
        data: { blockId: block.id, hectareNumber: dto.hectareNumber, code: hectareCodeFor(block.code, dto.hectareNumber, block.side), areaHectares: 1 },
      });
    } catch (error) {
      rethrowIntegrity(error, {
        irrigation_hectares_block_id_hectare_number_key: `Hectare ${dto.hectareNumber} already exists in ${block.code}`,
        'Unique constraint failed': `Hectare ${dto.hectareNumber} already exists in ${block.code}`,
        'exceeds the': `Hectare ${dto.hectareNumber} is outside this block's ${block.hectareCount} hectares`,
        'already has its': `${block.code} already has all ${block.hectareCount} hectares`,
      });
    }
  }

  async updateBlock(actor: RequestUser, id: string, dto: UpdateBlockDto) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Editing a block');
    const { canal, ...before } = await this.scopeService.assertBlock(scope, id);
    const canalNumber = canal.canalNumber;
    return this.prisma.$transaction(async (tx) => {
      // Moving a block to the other side (or giving an old block its side) renames it and its hectares to match.
      const recode = dto.side !== undefined && dto.side !== before.side;
      const newCode = recode ? blockCodeFor(canalNumber, before.blockNumber, dto.side!) : undefined;
      const updated = await tx.irrigationBlock.update({
        where: { id },
        data: {
          ...(recode ? { side: dto.side, code: newCode } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.boundaryCoordinates !== undefined ? { boundaryCoordinates: dto.boundaryCoordinates as Prisma.InputJsonValue } : {}),
          ...(dto.centerLatitude !== undefined ? { centerLatitude: dto.centerLatitude } : {}),
          ...(dto.centerLongitude !== undefined ? { centerLongitude: dto.centerLongitude } : {}),
          ...(dto.boundaryNotes !== undefined ? { boundaryNotes: dto.boundaryNotes.trim() || null } : {}),
          updatedById: actor.id,
        },
      });
      if (recode) {
        const hectares = await tx.irrigationHectare.findMany({ where: { blockId: id }, select: { id: true, hectareNumber: true } });
        for (const h of hectares) await tx.irrigationHectare.update({ where: { id: h.id }, data: { code: hectareCodeFor(newCode!, h.hectareNumber, dto.side) } });
      }
      const changes = diffRecords(before as any, updated as any);
      if (Object.keys(changes).length) await writeAudit(tx, actor, 'irrigation_block', id, 'update', before as any, { changes } as any);
      return updated;
    });
  }

  async setBlockArchived(actor: RequestUser, id: string, archived: boolean) {
    const scope = await this.scopeService.resolve(actor);
    this.scopeService.assertUnrestricted(scope, 'Archiving a block');
    const block = await this.scopeService.assertBlock(scope, id);
    if (archived) {
      const open = await this.prisma.irrigationHectareAllocation.count({
        where: { hectare: { blockId: id }, status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
      });
      if (open) throw new ConflictException(`${open} hectare(s) are still allocated. Release or transfer them before archiving this block.`);
      const leader = await this.prisma.irrigationLeadership.count({ where: { blockId: id, status: 'ACTIVE' } });
      if (leader) throw new ConflictException('End the active block leader appointment before archiving this block.');
    } else if (block.canal && (await this.prisma.irrigationCanal.count({ where: { id: block.canalId, archivedAt: { not: null } } }))) {
      throw new ConflictException('Restore the canal first');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.irrigationBlock.update({ where: { id }, data: { archivedAt: archived ? new Date() : null, updatedById: actor.id } });
      await writeAudit(tx, actor, 'irrigation_block', id, archived ? 'archive' : 'restore', { archivedAt: block.archivedAt }, { archivedAt: updated.archivedAt });
      return updated;
    });
  }

  blockHistory(actor: RequestUser, id: string) {
    return this.scopeService.resolve(actor)
      .then((scope) => this.scopeService.assertBlock(scope, id))
      .then(() => this.schemes.entityHistory('irrigation_block', id));
  }

  // ───────────────────────── hectares ─────────────────────────

  /** Hectare units with their current holder, ordered canal → block → unit number. */
  async listHectares(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const { page, pageSize, skip, take } = paging(q as any, 30);
    const open = { status: { in: ['ACTIVE', 'PENDING_APPROVAL'] as ('ACTIVE' | 'PENDING_APPROVAL')[] } };
    const where: Prisma.IrrigationHectareWhereInput = {
      AND: [
        this.scopeService.hectareWhere(scope),
        q.blockId ? { blockId: q.blockId } : {},
        q.canalId ? { block: { canalId: q.canalId } } : {},
        q.schemeId ? { block: { canal: { schemeId: q.schemeId } } } : {},
        q.status === 'AVAILABLE' ? { isActive: true, allocations: { none: open } } : {},
        q.status === 'ALLOCATED' ? { allocations: { some: { status: 'ACTIVE' } } } : {},
        q.status === 'PENDING' ? { allocations: { some: { status: 'PENDING_APPROVAL' } } } : {},
        q.farmerId ? { allocations: { some: { farmerId: q.farmerId, ...open } } } : {},
        q.q
          ? {
              OR: [
                { code: { contains: q.q, mode: 'insensitive' } },
                { allocations: { some: { ...open, farmer: { OR: [
                  { firstName: { contains: q.q, mode: 'insensitive' } },
                  { lastName: { contains: q.q, mode: 'insensitive' } },
                  { controlNumber: { contains: q.q, mode: 'insensitive' } },
                ] } } } },
              ],
            }
          : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.irrigationHectare.count({ where }),
      this.prisma.irrigationHectare.findMany({
        where, skip, take,
        orderBy: [{ block: { canal: { canalNumber: 'asc' } } }, { block: { blockNumber: 'asc' } }, { hectareNumber: 'asc' }],
        include: {
          block: { select: { id: true, code: true, blockNumber: true, canal: { select: { id: true, code: true, canalNumber: true } } } },
          allocations: {
            where: open,
            include: {
              farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } },
              guardians: { where: { endedOn: null }, include: { guardian: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } } },
            },
          },
        },
      }),
    ]);
    return paged(rows.map((h) => this.hectareView(h)), total, page, pageSize);
  }

  hectareView(h: any) {
    const current = h.allocations?.find((a: any) => a.status === 'ACTIVE') ?? null;
    const pending = h.allocations?.find((a: any) => a.status === 'PENDING_APPROVAL') ?? null;
    const holder = current ?? pending;
    return {
      id: h.id, code: h.code, hectareNumber: h.hectareNumber, areaHectares: num(h.areaHectares), isActive: h.isActive,
      block: h.block,
      allocationStatus: !h.isActive ? 'INACTIVE' : current ? 'ALLOCATED' : pending ? 'PENDING' : 'AVAILABLE',
      allocationId: holder?.id ?? null,
      farmer: holder ? { id: holder.farmer.id, name: fullName(holder.farmer), memberNumber: holder.farmer.controlNumber } : null,
      allocatedOn: holder?.allocatedOn ?? null,
      guardian: holder?.guardians?.find((g: any) => !g.endedOn)
        ? { id: holder.guardians.find((g: any) => !g.endedOn).guardian.id, name: fullName(holder.guardians.find((g: any) => !g.endedOn).guardian), memberNumber: holder.guardians.find((g: any) => !g.endedOn).guardian.controlNumber }
        : null,
    };
  }

  async getHectare(actor: RequestUser, id: string) {
    const scope = await this.scopeService.resolve(actor);
    const hectare = await this.scopeService.assertHectare(scope, id);
    const [allocations, transfers] = await Promise.all([
      this.prisma.irrigationHectareAllocation.findMany({
        where: { hectareId: id }, orderBy: { createdAt: 'desc' },
        include: {
          farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } },
          guardians: { orderBy: { startedOn: 'asc' }, include: { guardian: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } } },
        },
      }),
      this.prisma.irrigationAllocationTransfer.findMany({ where: { hectareId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const names = await userNames(this.prisma, allocations.flatMap((a) => [a.requestedById, a.approvedById, a.endedById]));
    const farmerIds = [...new Set(transfers.flatMap((t) => [t.fromFarmerId, t.toFarmerId]))];
    const transferFarmers = new Map((await this.prisma.farmer.findMany({ where: { id: { in: farmerIds } }, select: { id: true, firstName: true, lastName: true } })).map((f) => [f.id, fullName(f)]));
    const view = this.hectareView({ ...hectare, allocations: allocations.filter((a) => ['ACTIVE', 'PENDING_APPROVAL'].includes(a.status)) });
    return {
      ...view,
      block: { id: hectare.block.id, code: hectare.block.code, name: hectare.block.name, blockNumber: hectare.block.blockNumber, side: hectare.block.side },
      canal: { id: hectare.block.canal.id, code: hectare.block.canal.code, name: hectare.block.canal.name, canalNumber: hectare.block.canal.canalNumber },
      scheme: { id: hectare.block.canal.scheme.id, name: hectare.block.canal.scheme.name },
      history: allocations.map((a) => ({
        id: a.id, status: a.status, farmer: { id: a.farmer.id, name: fullName(a.farmer), memberNumber: a.farmer.controlNumber },
        allocatedOn: a.allocatedOn, endedOn: a.endedOn, endReason: a.endReason, notes: a.notes, rejectedReason: a.rejectedReason,
        requestedBy: names.get(a.requestedById ?? '') ?? null, approvedBy: names.get(a.approvedById ?? '') ?? null,
        endedBy: names.get(a.endedById ?? '') ?? null,
        guardians: a.guardians.map((g) => ({ id: g.guardianId, name: fullName(g.guardian), startedOn: g.startedOn, endedOn: g.endedOn, endReason: g.endReason })),
      })),
      transferIds: transfers.map((t) => t.id),
      transfers: transfers.map((t) => ({
        id: t.id, status: t.status, from: transferFarmers.get(t.fromFarmerId) ?? null, to: transferFarmers.get(t.toFarmerId) ?? null,
        transferDate: t.transferDate, effectiveDate: t.effectiveDate, reason: t.reason, rejectedReason: t.rejectedReason,
      })),
    };
  }
}
