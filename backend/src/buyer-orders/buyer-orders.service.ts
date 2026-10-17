import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeTenantRow, tenantWhere, type TenantActor } from '../common/tenant';
import {
  CreateBuyerOrderDto,
  UpdateBuyerOrderDto,
  UpdateBuyerOrderStatusDto,
} from './dto/buyer-order.dto';
import { progressOf } from './order-progress';

const SALE_SELECT = {
  id: true,
  invoiceNumber: true,
  quantityKg: true,
  totalRevenue: true,
  paymentReceived: true,
  saleDate: true,
} as const;

/**
 * Buyer orders. `actor` is the staff member acting; pass null for a buyer company's own login,
 * whose access is checked against its matched buyer by the controller instead.
 */
@Injectable()
export class BuyerOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private withProgress<T extends { quantityRequiredKg: number; sales: { quantityKg: number; totalRevenue: number; paymentReceived: boolean }[] }>(order: T) {
    return { ...order, progress: progressOf(order.quantityRequiredKg, order.sales) };
  }

  private async scopedOrder(id: string, actor: TenantActor | null) {
    const order = await this.prisma.buyerOrder.findUnique({
      where: { id },
      include: { buyer: true, sales: { select: SALE_SELECT } },
    });
    if (!order || (actor && !canSeeTenantRow(actor, order.mamcosId)))
      throw new NotFoundException(`Buyer order with ID ${id} not found`);
    return order;
  }

  async create(dto: CreateBuyerOrderDto, actor: TenantActor | null) {
    const buyer = await this.prisma.buyer.findUnique({ where: { id: dto.buyerId } });
    if (!buyer || (actor && !canSeeTenantRow(actor, buyer.mamcosId)))
      throw new NotFoundException('Buyer not found');
    const order = await this.prisma.buyerOrder.create({
      data: {
        ...dto,
        mamcosId: buyer.mamcosId,
        deliveryLocation: dto.deliveryLocation ?? buyer.deliveryLocation ?? undefined,
        requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : undefined,
      },
      include: { buyer: { select: { name: true } }, sales: { select: SALE_SELECT } },
    });
    return this.withProgress(order);
  }

  async findAll(actor: TenantActor) {
    const orders = await this.prisma.buyerOrder.findMany({
      where: tenantWhere(actor),
      include: {
        buyer: { select: { name: true, contactPerson: true, isCertified: true } },
        sales: { select: SALE_SELECT },
        _count: { select: { agreements: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.withProgress(o));
  }

  async findForBuyer(buyerId: string) {
    const orders = await this.prisma.buyerOrder.findMany({
      where: { buyerId },
      include: { sales: { select: SALE_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.withProgress(o));
  }

  async findOne(id: string, actor: TenantActor | null) {
    return this.withProgress(await this.scopedOrder(id, actor));
  }

  async update(id: string, dto: UpdateBuyerOrderDto, actor: TenantActor) {
    const order = await this.scopedOrder(id, actor);
    if (order.status === 'FULFILLED' || order.status === 'CANCELLED')
      throw new ForbiddenException('A fulfilled or cancelled order can no longer be edited');
    await this.prisma.buyerOrder.update({
      where: { id },
      data: {
        ...dto,
        requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : undefined,
      },
    });
    return this.findOne(id, actor);
  }

  async updateStatus(id: string, dto: UpdateBuyerOrderStatusDto, actor: TenantActor) {
    await this.scopedOrder(id, actor);
    return this.prisma.buyerOrder.update({ where: { id }, data: { status: dto.status } });
  }

  async remove(id: string, actor: TenantActor) {
    const order = await this.scopedOrder(id, actor);
    if (order.sales.length)
      throw new ForbiddenException('An order with recorded sales cannot be deleted; cancel it instead');
    await this.prisma.buyerOrder.delete({ where: { id } });
    return { deleted: true };
  }
}
