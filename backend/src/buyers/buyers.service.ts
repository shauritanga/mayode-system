import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertBuyerDto } from './dto/buyer.dto';

@Injectable()
export class BuyersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: UpsertBuyerDto) {
    return this.prisma.buyer.create({ data: dto });
  }

  findAll() {
    return this.prisma.buyer.findMany({
      include: { _count: { select: { sales: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const buyer = await this.prisma.buyer.findUnique({ where: { id } });
    if (!buyer) throw new NotFoundException(`Buyer with ID ${id} not found`);
    return buyer;
  }

  async update(id: string, dto: UpsertBuyerDto) {
    await this.findOne(id);
    return this.prisma.buyer.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const buyer = await this.prisma.buyer.findUnique({
      where: { id },
      include: { _count: { select: { sales: true } } },
    });
    if (!buyer) throw new NotFoundException(`Buyer with ID ${id} not found`);
    if (buyer._count.sales)
      throw new ConflictException(
        'A buyer with recorded sales cannot be deleted; retain it for traceability and audit history.',
      );
    return this.prisma.buyer.delete({ where: { id } });
  }
}
