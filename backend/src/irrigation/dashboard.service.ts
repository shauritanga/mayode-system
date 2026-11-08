import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { IrrigationScopeService } from './irrigation-scope.service';
import { allocationState, StructureService } from './structure.service';
import { fullName, num, today, userNames } from './irrigation-common';

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const EXPIRY_WINDOW_DAYS = 60;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: IrrigationScopeService,
    private readonly structure: StructureService,
  ) {}

  /** Picks the requested scheme, or the first one the caller may see. */
  private async pickScheme(actor: RequestUser, schemeId?: string) {
    const scope = await this.scopeService.resolve(actor);
    const scheme = await this.prisma.irrigationScheme.findFirst({
      where: { ...(schemeId ? { id: schemeId } : {}), ...this.scopeService.schemeWhere(scope) },
      orderBy: { name: 'asc' },
      include: { mamcos: { select: { id: true, name: true } } },
    });
    if (!scheme) {
      if (schemeId) throw new NotFoundException('Irrigation scheme not found');
      return { scope, scheme: null };
    }
    return { scope, scheme };
  }

  private async canalRows(scope: any, schemeId: string) {
    const canals = await this.prisma.irrigationCanal.findMany({
      where: { schemeId, archivedAt: null, ...this.scopeService.canalWhere(scope) },
      orderBy: { canalNumber: 'asc' },
    });
    const blocks = await this.structure.blockRows(scope, { canal: { schemeId }, archivedAt: null });
    const leaders = await this.structure.leaders({ canalId: { in: canals.map((c) => c.id) } });
    const rows = canals.map((c) => {
      const mine = blocks.filter((b) => b.canalId === c.id);
      const units = mine.reduce((t, b) => t + b.stats.hectareUnits, 0);
      const allocated = mine.reduce((t, b) => t + b.stats.allocatedUnits, 0);
      return {
        id: c.id, canalNumber: c.canalNumber, code: c.code, name: c.name, status: c.status,
        blockCount: mine.length, hectareUnits: units, area: mine.reduce((t, b) => t + b.stats.totalArea, 0),
        allocatedUnits: allocated, unallocatedUnits: units - allocated, completionPct: pct(allocated, units),
        farmerCount: mine.reduce((t, b) => t + b.stats.farmerCount, 0),
        blocksWithLeader: mine.filter((b) => b.leader?.state === 'ASSIGNED').length,
        blocksFull: mine.filter((b) => b.allocationState === 'FULL').length,
        blocksPartial: mine.filter((b) => b.allocationState === 'PARTIAL').length,
        blocksEmpty: mine.filter((b) => b.allocationState === 'NONE').length,
        leader: leaders.canal.get(c.id) ?? null,
      };
    });
    return { canals, rows, blocks };
  }

  async overview(actor: RequestUser, schemeId?: string) {
    const { scope, scheme } = await this.pickScheme(actor, schemeId);
    if (!scheme) return { scheme: null };
    const { canals, rows, blocks } = await this.canalRows(scope, scheme.id);
    const units = blocks.reduce((t, b) => t + b.stats.hectareUnits, 0);
    const area = blocks.reduce((t, b) => t + b.stats.totalArea, 0);
    const allocatedUnits = blocks.reduce((t, b) => t + b.stats.allocatedUnits, 0);
    const allocatedArea = blocks.reduce((t, b) => t + b.stats.allocatedArea, 0);
    const pendingUnits = blocks.reduce((t, b) => t + b.stats.pendingUnits, 0);
    const farmers = await this.prisma.irrigationHectareAllocation.findMany({
      where: { status: 'ACTIVE', hectare: { blockId: { in: blocks.map((b) => b.id) } } },
      distinct: ['farmerId'], select: { farmerId: true },
    });
    const amcosMembers = scheme.mamcosId ? await this.prisma.farmer.count({ where: { mamcosId: scheme.mamcosId } }) : null;
    const pendingTransfers = await this.prisma.irrigationAllocationTransfer.count({
      where: { status: 'PENDING_APPROVAL', hectare: { blockId: { in: blocks.map((b) => b.id) } } },
    });
    const membersWithoutHectare = amcosMembers == null ? null : Math.max(amcosMembers - farmers.length, 0);
    const blockLeaders = blocks.filter((b) => b.leader?.state === 'ASSIGNED').length;
    const canalLeaders = rows.filter((c) => c.leader?.state === 'ASSIGNED').length;

    const alerts: { severity: 'warning' | 'info'; message: string; href: string }[] = [];
    if (canals.length < scheme.plannedCanalCount)
      alerts.push({ severity: 'warning', message: `${canals.length} of ${scheme.plannedCanalCount} planned canals are registered`, href: '/dashboard/irrigation/structure/canals' });
    for (const c of rows) {
      if (c.blockCount < scheme.minBlocksPerCanal)
        alerts.push({ severity: 'warning', message: `${c.name} has ${c.blockCount} blocks; at least ${scheme.minBlocksPerCanal} are expected`, href: `/dashboard/irrigation/structure/canals/${c.id}` });
    }
    const missingUnits = blocks.filter((b) => b.stats.hectareUnits < b.hectareCount);
    if (missingUnits.length)
      alerts.push({ severity: 'warning', message: `${missingUnits.length} block(s) are missing hectare units`, href: '/dashboard/irrigation/structure/hectares' });
    if (rows.length - canalLeaders > 0)
      alerts.push({ severity: 'warning', message: `${rows.length - canalLeaders} canal(s) have no current canal leader`, href: '/dashboard/irrigation/leadership/assignments' });
    if (blocks.length - blockLeaders > 0)
      alerts.push({ severity: 'warning', message: `${blocks.length - blockLeaders} block(s) have no current block leader`, href: '/dashboard/irrigation/leadership/assignments' });
    if (pendingUnits > 0)
      alerts.push({ severity: 'info', message: `${pendingUnits} allocation(s) are waiting for approval`, href: '/dashboard/irrigation/allocation/allocate' });
    if (pendingTransfers > 0)
      alerts.push({ severity: 'info', message: `${pendingTransfers} transfer(s) are waiting for approval`, href: '/dashboard/irrigation/allocation/transfers' });
    if (!scheme.code) alerts.push({ severity: 'warning', message: 'This scheme has no scheme code', href: `/dashboard/irrigation/structure/scheme/${scheme.id}` });

    return {
      scheme: {
        id: scheme.id, code: scheme.code, name: scheme.name, status: scheme.status, mamcos: scheme.mamcos,
        region: scheme.region, district: scheme.district, ward: scheme.ward, village: scheme.village, waterSource: scheme.waterSource,
        plannedCanalCount: scheme.plannedCanalCount, requireAllocationApproval: scheme.requireAllocationApproval, requireRecipientAcceptance: scheme.requireRecipientAcceptance,
      },
      totals: {
        canals: canals.length, blocks: blocks.length, hectareUnits: units, registeredHectares: area, allocatedHectares: allocatedArea,
        unallocatedHectares: area - allocatedArea, pendingAllocations: pendingUnits, registeredFarmers: farmers.length, amcosMembers, membersWithoutHectare, pendingTransfers,
        completionPct: pct(allocatedArea, area), canalLeaders, blockLeaders,
      },
      canals: rows,
      blockDistribution: {
        full: blocks.filter((b) => b.allocationState === 'FULL').length,
        partial: blocks.filter((b) => b.allocationState === 'PARTIAL').length,
        none: blocks.filter((b) => b.allocationState === 'NONE').length,
      },
      alerts,
      recent: await this.recentActivity(blocks.map((b) => b.id), scheme.id),
    };
  }

  private async recentActivity(blockIds: string[], schemeId: string) {
    const inScope = { hectare: { blockId: { in: blockIds } } };
    const [allocations, transfers, leaders] = await Promise.all([
      this.prisma.irrigationHectareAllocation.findMany({
        where: inScope, orderBy: { createdAt: 'desc' }, take: 6,
        include: { farmer: { select: { firstName: true, lastName: true } }, hectare: { select: { code: true } } },
      }),
      this.prisma.irrigationAllocationTransfer.findMany({
        where: { status: 'COMPLETED', ...inScope }, orderBy: { processedAt: 'desc' }, take: 6,
        include: { hectare: { select: { code: true } }, toFarmer: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.irrigationLeadership.findMany({
        where: { canal: { schemeId }, OR: [{ blockId: { in: blockIds } }, { blockId: null }] }, orderBy: { createdAt: 'desc' }, take: 6,
        include: { farmer: { select: { firstName: true, lastName: true } }, canal: { select: { code: true } }, block: { select: { code: true } } },
      }),
    ]);
    const events = [
      ...allocations.map((a) => ({
        at: a.createdAt, kind: 'ALLOCATION',
        text: a.status === 'PENDING_APPROVAL' ? `${a.hectare.code} requested for ${fullName(a.farmer)}` : `${a.hectare.code} allocated to ${fullName(a.farmer)}`,
      })),
      ...transfers.map((t) => ({ at: t.processedAt ?? t.createdAt, kind: 'TRANSFER', text: `${t.hectare.code} transferred to ${fullName(t.toFarmer)}` })),
      ...leaders.map((l) => ({
        at: l.createdAt, kind: 'LEADERSHIP',
        text: `${fullName(l.farmer)} appointed ${l.position === 'CANAL_LEADER' ? `leader of ${l.canal.code}` : `leader of ${l.block?.code}`}`,
      })),
    ];
    return events.sort((a, b) => +b.at - +a.at).slice(0, 10);
  }

  async allocationOverview(actor: RequestUser, q: Record<string, string>) {
    const { scope, scheme } = await this.pickScheme(actor, q.schemeId);
    if (!scheme) return { scheme: null };
    const { rows, blocks: all } = await this.canalRows(scope, scheme.id);
    const blocks = all.filter((b) => (!q.canalId || b.canalId === q.canalId) && (!q.blockId || b.id === q.blockId));
    const sum = (f: (b: (typeof blocks)[number]) => number) => blocks.reduce((t, b) => t + f(b), 0);
    const units = sum((b) => b.stats.hectareUnits);
    const allocated = sum((b) => b.stats.allocatedUnits);
    return {
      scheme: { id: scheme.id, name: scheme.name },
      totals: {
        totalHectares: sum((b) => b.stats.totalArea), allocatedHectares: sum((b) => b.stats.allocatedArea),
        unallocatedHectares: sum((b) => b.stats.unallocatedArea), activeAllocations: allocated, pendingAllocations: sum((b) => b.stats.pendingUnits),
        blocksFull: blocks.filter((b) => allocationState(b.stats) === 'FULL').length,
        blocksPartial: blocks.filter((b) => allocationState(b.stats) === 'PARTIAL').length,
        blocksNone: blocks.filter((b) => allocationState(b.stats) === 'NONE').length,
        completionPct: pct(allocated, units),
      },
      byCanal: rows.filter((c) => !q.canalId || c.id === q.canalId),
      byBlock: blocks.map((b) => ({
        id: b.id, code: b.code, canalId: b.canalId, canalCode: b.canal.code, ...b.stats, state: b.allocationState,
        completionPct: pct(b.stats.allocatedUnits, b.stats.hectareUnits),
      })),
    };
  }

  async leadershipOverview(actor: RequestUser, schemeId?: string) {
    const { scope, scheme } = await this.pickScheme(actor, schemeId);
    if (!scheme) return { scheme: null };
    const { canals, rows, blocks } = await this.canalRows(scope, scheme.id);
    const now = today();
    const horizon = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 86_400_000);
    const active = await this.prisma.irrigationLeadership.findMany({
      where: {
        status: 'ACTIVE', canal: { schemeId: scheme.id },
        OR: [{ canalId: { in: canals.map((c) => c.id) }, blockId: null }, { blockId: { in: blocks.map((b) => b.id) } }],
      },
      orderBy: [{ position: 'asc' }, { termEnd: 'asc' }],
      include: {
        farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } },
        canal: { select: { id: true, code: true, name: true } }, block: { select: { id: true, code: true } },
      },
    });
    const view = (l: (typeof active)[number]) => ({
      id: l.id, position: l.position, leader: { id: l.farmer.id, name: fullName(l.farmer), memberNumber: l.farmer.controlNumber },
      canal: l.canal, block: l.block, termStart: l.termStart, termEnd: l.termEnd,
      daysLeft: l.termEnd ? Math.round((+l.termEnd - +now) / 86_400_000) : null,
    });
    const canalLeaders = rows.filter((c) => c.leader?.state === 'ASSIGNED').length;
    const blockLeaders = blocks.filter((b) => b.leader?.state === 'ASSIGNED').length;
    return {
      scheme: { id: scheme.id, name: scheme.name },
      totals: {
        canals: canals.length, blocks: blocks.length, assignedCanalLeaders: canalLeaders, unassignedCanals: canals.length - canalLeaders,
        assignedBlockLeaders: blockLeaders, blocksWithoutLeaders: blocks.length - blockLeaders, currentAppointments: active.length,
      },
      coverage: rows.map((c) => ({
        canalId: c.id, code: c.code, name: c.name, canalLeader: c.leader, blocks: c.blockCount, blocksWithLeader: c.blocksWithLeader,
        coveragePct: pct(c.blocksWithLeader, c.blockCount),
      })),
      appointments: active.map(view),
      expiring: active.filter((l) => l.termEnd && l.termEnd <= horizon).map(view),
      windowDays: EXPIRY_WINDOW_DAYS,
    };
  }
}
