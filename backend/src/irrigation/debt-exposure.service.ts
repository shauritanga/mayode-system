import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasGrant } from '../auth/role-access';
import { localDate } from '../accounting/tax';
import { num } from './irrigation-common';
import type { IrrigationScope } from './irrigation-scope.service';

const cents = (n: number) => Math.round(n * 100) / 100;
const whole = (n: number) => Math.round(n);

export interface Exposure { outstanding: number; overdue: number; defaulters: number }
export const noExposure = (): Exposure => ({ outstanding: 0, overdue: 0, defaulters: 0 });

/**
 * What members of a canal or block still owe the AMCOS. Money is held per farmer, so a farmer who farms hectares in several
 * blocks has their debt split between those blocks in proportion to the hectares they hold in each.
 */
@Injectable()
export class DebtExposureService {
  constructor(private readonly prisma: PrismaService) {}

  /** Staff with the Dues permission, and a leader looking at their own canal or block, may see money; others see none. */
  canSee(scope: IrrigationScope): boolean {
    return scope.actor.role === UserRole.SUPER_ADMIN || scope.restricted || hasGrant(scope.actor, 'dues', 'VIEW');
  }

  /** Per farmer: all they owe, and the part past its due date. */
  async standing(farmerIds: string[]): Promise<Map<string, { outstanding: number; overdue: number }>> {
    const out = new Map<string, { outstanding: number; overdue: number }>();
    if (!farmerIds.length) return out;
    const cutoff = new Date(`${localDate(new Date())}T00:00:00.000Z`);
    const dues = await this.prisma.farmerDue.findMany({
      where: { farmerId: { in: farmerIds }, status: 'ACTIVE' },
      select: { farmerId: true, amount: true, waivedAmount: true, dueDate: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
    });
    for (const d of dues) {
      const balance = cents(num(d.amount) - num(d.waivedAmount) - d.payments.reduce((t, p) => t + num(p.amount), 0));
      if (balance <= 0) continue;
      const row = out.get(d.farmerId) ?? { outstanding: 0, overdue: 0 };
      row.outstanding += balance;
      if (d.dueDate && d.dueDate < cutoff) row.overdue += balance;
      out.set(d.farmerId, row);
    }
    return out;
  }

  /** Debt per block, for the blocks asked about. */
  async forBlocks(blockIds: string[]): Promise<Map<string, Exposure>> {
    const result = new Map<string, Exposure>(blockIds.map((id) => [id, noExposure()]));
    if (!blockIds.length) return result;
    const held = await this.prisma.irrigationHectareAllocation.findMany({
      where: { status: 'ACTIVE', hectare: { blockId: { in: blockIds } } },
      select: { farmerId: true, hectare: { select: { blockId: true } } },
    });
    const farmerIds = [...new Set(held.map((h) => h.farmerId))];
    const [standing, totals] = await Promise.all([
      this.standing(farmerIds),
      this.prisma.irrigationHectareAllocation.groupBy({ by: ['farmerId'], where: { status: 'ACTIVE', farmerId: { in: farmerIds } }, _count: { _all: true } }),
    ]);
    const hectares = new Map(totals.map((t) => [t.farmerId, t._count._all]));
    const late = new Map<string, Set<string>>();
    for (const h of held) {
      const s = standing.get(h.farmerId);
      if (!s) continue;
      const share = 1 / (hectares.get(h.farmerId) || 1);
      const e = result.get(h.hectare.blockId)!;
      e.outstanding += s.outstanding * share;
      e.overdue += s.overdue * share;
      if (s.overdue > 0) (late.get(h.hectare.blockId) ?? late.set(h.hectare.blockId, new Set()).get(h.hectare.blockId)!).add(h.farmerId);
    }
    for (const [id, e] of result) {
      e.outstanding = whole(e.outstanding); e.overdue = whole(e.overdue); e.defaulters = late.get(id)?.size ?? 0;
    }
    return result;
  }

  /** How much of what the AMCOS has billed its members has been paid, and how much is overdue. */
  async collection(mamcosId: string) {
    const [billed, paid, late] = await Promise.all([
      this.prisma.farmerDue.aggregate({ where: { mamcosId, status: 'ACTIVE' }, _sum: { amount: true, waivedAmount: true } }),
      this.prisma.duePayment.aggregate({ where: { mamcosId, voidedAt: null, due: { status: 'ACTIVE' } }, _sum: { amount: true } }),
      this.standingForAmcos(mamcosId),
    ]);
    const total = num(billed._sum.amount) - num(billed._sum.waivedAmount);
    const collected = num(paid._sum.amount);
    return {
      billed: whole(total), collected: whole(collected), outstanding: whole(Math.max(total - collected, 0)),
      ratePct: total > 0 ? Math.min(100, Math.round((collected / total) * 1000) / 10) : null,
      overdue: late.overdue, farmersOverdue: late.farmers,
    };
  }

  private async standingForAmcos(mamcosId: string) {
    const farmers = await this.prisma.farmerDue.findMany({ where: { mamcosId, status: 'ACTIVE' }, distinct: ['farmerId'], select: { farmerId: true } });
    const s = await this.standing(farmers.map((f) => f.farmerId));
    let overdue = 0; let count = 0;
    for (const v of s.values()) if (v.overdue > 0) { overdue += v.overdue; count++; }
    return { overdue: whole(overdue), farmers: count };
  }
}
