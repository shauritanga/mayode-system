import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';

export type InsCtx =
  | { kind: 'farmer'; farmerId: string }
  | { kind: 'insurer'; providerId: string | null }
  | { kind: 'staff'; tenant: string | null; isSuper: boolean };

/** Who is asking, and which policies, claims and applications that person may see. */
@Injectable()
export class InsuranceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private tail(p?: string | null) {
    const d = (p ?? '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : null;
  }

  /** An insurer's login is matched to its company record by the contact phone or email. */
  async providerFor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, email: true } });
    if (!user) return null;
    const tail = this.tail(user.phone);
    const email = user.email?.trim().toLowerCase();
    const all = await this.prisma.insuranceProvider.findMany({ where: { isActive: true } });
    return all.find((p) => (email && p.email?.trim().toLowerCase() === email) || (tail && this.tail(p.phone) === tail)) ?? null;
  }

  async context(user: RequestUser): Promise<InsCtx> {
    if (user.role === UserRole.FARMER) {
      const farmer = await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!farmer) throw new ForbiddenException('A farmer profile is required');
      return { kind: 'farmer', farmerId: farmer.id };
    }
    if (user.role === UserRole.FINANCIAL_PROVIDER) return { kind: 'insurer', providerId: (await this.providerFor(user.id))?.id ?? null };
    return { kind: 'staff', tenant: user.role === UserRole.SUPER_ADMIN ? null : (user.mamcosId ?? null), isSuper: user.role === UserRole.SUPER_ADMIN };
  }

  policyWhere(ctx: InsCtx): Prisma.InsurancePolicyWhereInput {
    if (ctx.kind === 'farmer') return { farmerId: ctx.farmerId };
    if (ctx.kind === 'insurer') return { providerId: ctx.providerId ?? '__none__' };
    return ctx.isSuper ? {} : { mamcosId: ctx.tenant };
  }

  applicationWhere(ctx: InsCtx): Prisma.InsuranceApplicationWhereInput {
    if (ctx.kind === 'farmer') return { farmerId: ctx.farmerId };
    if (ctx.kind === 'insurer') return { providerId: ctx.providerId ?? '__none__' };
    return ctx.isSuper ? {} : { mamcosId: ctx.tenant };
  }

  /** True when this person may see a policy-linked record of the given owner/insurer. */
  canSee(ctx: InsCtx, row: { farmerId?: string; providerId?: string; mamcosId?: string | null }) {
    if (ctx.kind === 'farmer') return row.farmerId === ctx.farmerId;
    if (ctx.kind === 'insurer') return !!ctx.providerId && row.providerId === ctx.providerId;
    return ctx.isSuper || (row.mamcosId ?? null) === ctx.tenant;
  }
}
