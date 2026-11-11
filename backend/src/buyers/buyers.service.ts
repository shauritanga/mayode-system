import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertBuyerDto } from './dto/buyer.dto';
import { canSeeTenantRow, tenantOwner, tenantWhere, type TenantActor } from '../common/tenant';

@Injectable()
export class BuyersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Buyers belong to the cooperative that registered them; Super Admin's own buyers are platform-level. */
  create(dto: UpsertBuyerDto, actor: TenantActor) {
    return this.prisma.buyer.create({ data: { ...dto, mamcosId: tenantOwner(actor) } });
  }

  /** Buyers with their trading record: sales, value, what they still owe, and live orders. */
  async findAll(actor: TenantActor) {
    const buyers = await this.prisma.buyer.findMany({
      where: tenantWhere(actor),
      include: { _count: { select: { sales: true } } },
      orderBy: { name: 'asc' },
    });
    if (!buyers.length) return [];
    const stats = await this.statsFor(buyers.map((b) => b.id));
    return buyers.map((b) => ({ ...b, stats: stats.get(b.id) }));
  }

  /** What each buyer has bought, still owes, and has asked for, in one pass. */
  private async statsFor(ids: string[]) {
    const [sales, unpaid, orders, agreements] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['buyerId'],
        where: { buyerId: { in: ids } },
        _sum: { quantityKg: true, totalRevenue: true },
        _count: { _all: true },
      }),
      this.prisma.sale.groupBy({
        by: ['buyerId'],
        where: { buyerId: { in: ids }, paymentReceived: false },
        _sum: { totalRevenue: true },
      }),
      this.prisma.buyerOrder.groupBy({
        by: ['buyerId'],
        where: { buyerId: { in: ids }, status: { in: ['OPEN', 'PARTIALLY_FULFILLED'] } },
        _count: { _all: true },
        _sum: { quantityRequiredKg: true },
      }),
      this.prisma.purchaseAgreement.groupBy({
        by: ['buyerId'],
        where: { buyerId: { in: ids }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ]);
    const by = <T extends { buyerId: string }>(rows: T[]) => new Map(rows.map((r) => [r.buyerId, r]));
    const s = by(sales), u = by(unpaid), o = by(orders), a = by(agreements);
    return new Map(ids.map((id) => [id, {
      sales: s.get(id)?._count._all ?? 0,
      soldKg: s.get(id)?._sum.quantityKg ?? 0,
      soldValue: s.get(id)?._sum.totalRevenue ?? 0,
      outstanding: u.get(id)?._sum.totalRevenue ?? 0,
      openOrders: o.get(id)?._count._all ?? 0,
      requiredKg: o.get(id)?._sum.quantityRequiredKg ?? 0,
      activeAgreements: a.get(id)?._count._all ?? 0,
    }]));
  }

  /** One buyer with the trading record and the latest sales, for the details panel. */
  async detail(id: string, actor: TenantActor) {
    const buyer = await this.findOne(id, actor);
    const [stats, recentSales] = await Promise.all([
      this.statsFor([id]),
      this.prisma.sale.findMany({ where: { buyerId: id }, orderBy: { saleDate: 'desc' }, take: 8, select: { id: true, saleDate: true, quantityKg: true, pricePerKg: true, totalRevenue: true, paymentReceived: true } }),
    ]);
    return { ...buyer, stats: stats.get(id), recentSales };
  }

  /** Last 9 digits — matches TZ MSISDN regardless of +255 / 0 prefix. */
  private phoneTail(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) return null;
    return digits.slice(-9);
  }

  /** Match a login user to a Buyer company via contact phone or email. */
  async resolveForUser(user: {
    phone?: string | null;
    email?: string | null;
  }) {
    const phoneTail = this.phoneTail(user.phone);
    const email = user.email?.trim().toLowerCase();
    if (!phoneTail && !email) return null;

    const buyers = await this.prisma.buyer.findMany({
      orderBy: { name: 'asc' },
    });
    return (
      buyers.find((buyer) => {
        if (email && buyer.contactEmail?.trim().toLowerCase() === email) {
          return true;
        }
        if (phoneTail && this.phoneTail(buyer.contactPhone) === phoneTail) {
          return true;
        }
        return false;
      }) ?? null
    );
  }

  async requireMatchedBuyer(user: {
    role: UserRole | string;
    phone?: string | null;
    email?: string | null;
  }) {
    const company = await this.resolveForUser(user);
    if (!company) {
      throw new ForbiddenException(
        'No buyer company is linked to your account phone or email.',
      );
    }
    return company;
  }

  async assertBuyerAccess(
    user: {
      role: UserRole | string;
      phone?: string | null;
      email?: string | null;
    },
    buyerId: string,
  ) {
    if (user.role !== UserRole.BUYER) return;
    const company = await this.requireMatchedBuyer(user);
    if (company.id !== buyerId) {
      throw new ForbiddenException(
        'You can only access data for your matched buyer company.',
      );
    }
  }

  async findOne(id: string, actor?: TenantActor) {
    const buyer = await this.prisma.buyer.findUnique({ where: { id } });
    if (!buyer || (actor && !canSeeTenantRow(actor, buyer.mamcosId))) throw new NotFoundException(`Buyer with ID ${id} not found`);
    return buyer;
  }

  async update(id: string, dto: UpsertBuyerDto, actor: TenantActor) {
    await this.findOne(id, actor);
    return this.prisma.buyer.update({ where: { id }, data: dto });
  }

  async remove(id: string, actor: TenantActor) {
    const buyer = await this.prisma.buyer.findUnique({
      where: { id },
      include: { _count: { select: { sales: true } } },
    });
    if (!buyer || !canSeeTenantRow(actor, buyer.mamcosId)) throw new NotFoundException(`Buyer with ID ${id} not found`);
    if (buyer._count.sales)
      throw new ConflictException(
        'A buyer with recorded sales cannot be deleted; retain it for traceability and audit history.',
      );
    return this.prisma.buyer.delete({ where: { id } });
  }
}
