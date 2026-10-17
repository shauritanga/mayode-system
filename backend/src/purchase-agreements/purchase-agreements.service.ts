import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeTenantRow, tenantWhere, type TenantActor } from '../common/tenant';
import { progressOf } from '../buyer-orders/order-progress';
import { AgreementStatusDto, CreateAgreementDto, UpdateAgreementDto } from './dto/agreement.dto';
import { canMove, isExpired, nextReference } from './agreement-rules';

const SALE_SELECT = {
  id: true,
  invoiceNumber: true,
  quantityKg: true,
  totalRevenue: true,
  paymentReceived: true,
  saleDate: true,
} as const;

@Injectable()
export class PurchaseAgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  private decorate<T extends { quantityKg: number; status: any; endDate: Date; sales: { quantityKg: number; totalRevenue: number; paymentReceived: boolean }[] }>(a: T) {
    return { ...a, progress: progressOf(a.quantityKg, a.sales), expired: isExpired(a.status, a.endDate) };
  }

  private async scoped(id: string, actor: TenantActor) {
    const a = await this.prisma.purchaseAgreement.findUnique({
      where: { id },
      include: {
        buyer: { select: { id: true, name: true } },
        buyerOrder: { select: { id: true, quantityRequiredKg: true, riceVariety: true } },
        sales: { select: SALE_SELECT, orderBy: { saleDate: 'desc' } },
      },
    });
    if (!a || !canSeeTenantRow(actor, a.mamcosId)) throw new NotFoundException('Purchase agreement not found');
    return a;
  }

  private checkDates(start: Date, end: Date) {
    if (end < start) throw new BadRequestException('The agreement must end after it starts');
  }

  async list(actor: TenantActor, filter: { status?: string; buyerId?: string } = {}) {
    const rows = await this.prisma.purchaseAgreement.findMany({
      where: {
        ...tenantWhere(actor),
        ...(filter.status ? { status: filter.status as any } : {}),
        ...(filter.buyerId ? { buyerId: filter.buyerId } : {}),
      },
      include: {
        buyer: { select: { id: true, name: true } },
        buyerOrder: { select: { id: true, quantityRequiredKg: true, riceVariety: true } },
        sales: { select: SALE_SELECT, orderBy: { saleDate: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.decorate(r));
  }

  async findOne(id: string, actor: TenantActor) {
    return this.decorate(await this.scoped(id, actor));
  }

  async create(dto: CreateAgreementDto, actor: TenantActor) {
    const buyer = await this.prisma.buyer.findUnique({ where: { id: dto.buyerId } });
    if (!buyer || !canSeeTenantRow(actor, buyer.mamcosId)) throw new NotFoundException('Buyer not found');
    if (dto.buyerOrderId) {
      const order = await this.prisma.buyerOrder.findUnique({ where: { id: dto.buyerOrderId } });
      if (!order || order.buyerId !== buyer.id) throw new BadRequestException('That order does not belong to this buyer');
    }
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    this.checkDates(start, end);

    const year = new Date().getFullYear();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const last = await this.prisma.purchaseAgreement.findFirst({
        where: { reference: { startsWith: `PA-${year}-` } },
        orderBy: { reference: 'desc' },
        select: { reference: true },
      });
      try {
        const created = await this.prisma.purchaseAgreement.create({
          data: {
            reference: nextReference(year, last?.reference),
            mamcosId: buyer.mamcosId,
            buyerId: buyer.id,
            buyerOrderId: dto.buyerOrderId,
            riceVariety: dto.riceVariety,
            qualityTerms: dto.qualityTerms,
            quantityKg: dto.quantityKg,
            pricePerKg: dto.pricePerKg,
            deliveryLocation: dto.deliveryLocation ?? buyer.deliveryLocation ?? undefined,
            paymentTerms: dto.paymentTerms,
            startDate: start,
            endDate: end,
            documentUrl: dto.documentUrl,
            notes: dto.notes,
            createdByUserId: actor.id,
          },
        });
        return this.findOne(created.id, actor);
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw new ConflictException('Could not allocate an agreement number; try again');
  }

  async update(id: string, dto: UpdateAgreementDto, actor: TenantActor) {
    const a = await this.scoped(id, actor);
    if (a.status === 'FULFILLED' || a.status === 'CANCELLED')
      throw new ConflictException('A fulfilled or cancelled agreement can no longer be edited');
    // Once signed, the commercial terms are fixed; only the notes, document and end date may change.
    if (a.status === 'ACTIVE') {
      const locked = ['quantityKg', 'pricePerKg', 'riceVariety', 'qualityTerms', 'startDate'] as const;
      if (locked.some((k) => dto[k] !== undefined))
        throw new ConflictException('An active agreement’s quantity, price, variety, quality and start date are fixed. Cancel it and draw up a new one to change them.');
    }
    const start = dto.startDate ? new Date(dto.startDate) : a.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : a.endDate;
    this.checkDates(start, end);
    await this.prisma.purchaseAgreement.update({
      where: { id },
      data: { ...dto, startDate: dto.startDate ? start : undefined, endDate: dto.endDate ? end : undefined },
    });
    return this.findOne(id, actor);
  }

  async setStatus(id: string, dto: AgreementStatusDto, actor: TenantActor) {
    const a = await this.scoped(id, actor);
    if (!canMove(a.status, dto.status))
      throw new ConflictException(`An agreement that is ${a.status.toLowerCase()} cannot become ${dto.status.toLowerCase()}`);
    await this.prisma.purchaseAgreement.update({
      where: { id },
      data: { status: dto.status, ...(dto.status === 'ACTIVE' ? { signedAt: new Date() } : {}) },
    });
    return this.findOne(id, actor);
  }

  async remove(id: string, actor: TenantActor) {
    const a = await this.scoped(id, actor);
    if (a.status !== 'DRAFT') throw new ConflictException('Only a draft agreement can be deleted; cancel an active one instead');
    await this.prisma.purchaseAgreement.delete({ where: { id } });
    return { deleted: true };
  }
}
