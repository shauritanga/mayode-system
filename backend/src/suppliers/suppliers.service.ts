import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: UpsertSupplierDto) {
    return this.prisma.supplier.create({
      data: { ...dto, itemsSupplied: dto.itemsSupplied ?? [] },
    });
  }

  findAll() {
    return this.prisma.supplier.findMany({
      include: { _count: { select: { inputCosts: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: { select: { inputCosts: true } },
        inputCosts: {
          orderBy: { dateIncurred: 'desc' },
          take: 40,
          select: {
            id: true,
            category: true,
            itemName: true,
            quantity: true,
            unit: true,
            totalCost: true,
            dateIncurred: true,
            paymentStatus: true,
            cropCycle: {
              select: {
                id: true,
                season: true,
                riceVariety: true,
                farm: { select: { farmCode: true, village: true } },
                farmer: {
                  select: {
                    controlNumber: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!supplier)
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    return supplier;
  }

  async update(id: string, dto: UpsertSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { inputCosts: true } } },
    });
    if (!supplier)
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    if (supplier._count.inputCosts)
      throw new ConflictException(
        'A supplier with recorded input costs cannot be deleted; deactivate it instead to preserve traceability.',
      );
    return this.prisma.supplier.delete({ where: { id } });
  }
}
