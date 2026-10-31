import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasGrant } from '../auth/role-access';
import type { RequestUser } from '../common/ownership.service';
import { IRRIGATION_RESOURCE, today } from './irrigation-common';

/**
 * What one request may see. Scheme managers (Super Admin, or a role with EDIT on `irrigation`) and read-only
 * staff with no leadership appointment (e.g. auditors) see their whole AMCOS. A member who currently leads a
 * canal or block and has no manager grant is confined to that canal / block — enforced here for reads and writes.
 */
export interface IrrigationScope {
  actor: RequestUser;
  /** Cooperative filter for schemes; Super Admin is unfiltered. */
  tenant: { mamcosId?: string | null };
  restricted: boolean;
  /** Canals the user leads (every block in them is visible). */
  canalIds: string[];
  /** Blocks the user leads (restricted users only). */
  blockIds: string[];
  farmerId: string | null;
}

@Injectable()
export class IrrigationScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(actor: RequestUser): Promise<IrrigationScope> {
    const tenant = actor.role === UserRole.SUPER_ADMIN ? {} : { mamcosId: actor.mamcosId ?? null };
    const farmer = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true } });
    const base = { actor, tenant, farmerId: farmer?.id ?? null };
    const manager = actor.role === UserRole.SUPER_ADMIN || hasGrant(actor, IRRIGATION_RESOURCE, 'EDIT');
    if (manager || !farmer) return { ...base, restricted: false, canalIds: [], blockIds: [] };

    const appointments = await this.prisma.irrigationLeadership.findMany({
      where: {
        farmerId: farmer.id,
        status: 'ACTIVE',
        OR: [{ termEnd: null }, { termEnd: { gte: today() } }],
      },
      select: { position: true, canalId: true, blockId: true },
    });
    if (!appointments.length) {
      // Someone who has held office but holds none now (term ended or lapsed) must not fall back to whole-AMCOS read access.
      const everLed = await this.prisma.irrigationLeadership.count({ where: { farmerId: farmer.id } });
      return { ...base, restricted: everLed > 0, canalIds: [], blockIds: [] };
    }
    return {
      ...base,
      restricted: true,
      canalIds: appointments.filter((a) => a.position === 'CANAL_LEADER').map((a) => a.canalId),
      blockIds: appointments.filter((a) => a.position === 'BLOCK_LEADER' && a.blockId).map((a) => a.blockId as string),
    };
  }

  schemeWhere(scope: IrrigationScope): Prisma.IrrigationSchemeWhereInput {
    return {
      ...scope.tenant,
      ...(scope.restricted
        ? { canals: { some: this.canalWhere(scope) } }
        : {}),
    };
  }

  canalWhere(scope: IrrigationScope): Prisma.IrrigationCanalWhereInput {
    const tenant: Prisma.IrrigationCanalWhereInput = { scheme: scope.tenant };
    if (!scope.restricted) return tenant;
    return {
      ...tenant,
      OR: [{ id: { in: scope.canalIds } }, { blocks: { some: { id: { in: scope.blockIds } } } }],
    };
  }

  blockWhere(scope: IrrigationScope): Prisma.IrrigationBlockWhereInput {
    const tenant: Prisma.IrrigationBlockWhereInput = { canal: { scheme: scope.tenant } };
    if (!scope.restricted) return tenant;
    return { ...tenant, OR: [{ canalId: { in: scope.canalIds } }, { id: { in: scope.blockIds } }] };
  }

  hectareWhere(scope: IrrigationScope): Prisma.IrrigationHectareWhereInput {
    return { block: this.blockWhere(scope) };
  }

  /** Throws 404 (not 403) when the scheme is outside the caller's cooperative or leadership scope. */
  async assertScheme(scope: IrrigationScope, schemeId: string) {
    const scheme = await this.prisma.irrigationScheme.findFirst({ where: { id: schemeId, ...this.schemeWhere(scope) } });
    if (!scheme) throw new NotFoundException('Irrigation scheme not found');
    return scheme;
  }

  async assertCanal(scope: IrrigationScope, canalId: string) {
    const canal = await this.prisma.irrigationCanal.findFirst({
      where: { id: canalId, ...this.canalWhere(scope) },
      include: { scheme: true },
    });
    if (!canal) throw new NotFoundException('Canal not found');
    return canal;
  }

  async assertBlock(scope: IrrigationScope, blockId: string) {
    const block = await this.prisma.irrigationBlock.findFirst({
      where: { id: blockId, ...this.blockWhere(scope) },
      include: { canal: { include: { scheme: true } } },
    });
    if (!block) throw new NotFoundException('Block not found');
    return block;
  }

  async assertHectare(scope: IrrigationScope, hectareId: string) {
    const hectare = await this.prisma.irrigationHectare.findFirst({
      where: { id: hectareId, ...this.hectareWhere(scope) },
      include: { block: { include: { canal: { include: { scheme: true } } } } },
    });
    if (!hectare) throw new NotFoundException('Hectare not found');
    return hectare;
  }

  /** Only a manager (unrestricted) may change scheme-level configuration. */
  assertUnrestricted(scope: IrrigationScope, _what?: string) {
    if (scope.restricted) throw new ForbiddenException('This action is limited to scheme managers');
  }
}
