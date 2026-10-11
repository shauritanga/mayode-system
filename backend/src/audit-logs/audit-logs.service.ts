import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, type TenantActor } from '../common/tenant';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. Cooperative users see their own AMCOS; Super Admin sees everything. */
  async findAll(
    actor: TenantActor,
    q: {
      entityType?: string;
      userId?: string;
      from?: string;
      to?: string;
      take?: number;
    },
  ) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...tenantWhere(actor),
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
        ...(q.from || q.to
          ? {
              createdAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(q.take ?? 100, 1), 500),
    });
    return rows.map(({ user, ...row }) => ({
      ...row,
      actorName: user
        ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.phone
        : null,
    }));
  }
}
