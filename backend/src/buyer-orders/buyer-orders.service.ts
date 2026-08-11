import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuyerOrderDto, UpdateBuyerOrderStatusDto } from './dto/buyer-order.dto';

@Injectable()
export class BuyerOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateBuyerOrderDto) {
    return this.prisma.buyerOrder.create({
      data: {
        ...dto,
        requiredByDate: dto.requiredByDate ? new Date(dto.requiredByDate) : undefined,
      },
      include: { buyer: { select: { name: true } } },
    });
  }

  findAll() {
    return this.prisma.buyerOrder.findMany({
      include: {
        buyer: { select: { name: true, contactPerson: true, isCertified: true } },
        sales: { select: { id: true, invoiceNumber: true, quantityKg: true, saleDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findForBuyer(buyerId: string) {
    return this.prisma.buyerOrder.findMany({
      where: { buyerId },
      include: { sales: { select: { id: true, invoiceNumber: true, quantityKg: true, saleDate: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.buyerOrder.findUnique({
      where: { id },
      include: { buyer: true, sales: true },
    });
    if (!order) throw new NotFoundException(`Buyer order with ID ${id} not found`);
    return order;
  }

  async updateStatus(id: string, dto: UpdateBuyerOrderStatusDto) {
    await this.findOne(id);
    return this.prisma.buyerOrder.update({ where: { id }, data: { status: dto.status } });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.buyerOrder.delete({ where: { id } });
    return { deleted: true };
  }
}
