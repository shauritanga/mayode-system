import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLenderDto, UpdateLenderDto } from './dto/loans.dto';

@Injectable()
export class LendersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.lender.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { loans: true } } },
    });
  }

  async findOne(id: string) {
    const lender = await this.prisma.lender.findUnique({
      where: { id },
      include: { loans: true },
    });
    if (!lender) throw new NotFoundException('Lender not found');
    return lender;
  }

  async create(dto: CreateLenderDto) {
    const existing = await this.prisma.lender.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A lender with this name already exists');
    return this.prisma.lender.create({ data: dto });
  }

  async update(id: string, dto: UpdateLenderDto) {
    await this.findOne(id);
    return this.prisma.lender.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const lender = await this.prisma.lender.findUnique({
      where: { id },
      include: { _count: { select: { loans: true } } },
    });
    if (!lender) throw new NotFoundException('Lender not found');
    if (lender._count.loans > 0) {
      throw new ConflictException(
        'This lender still has loan records; deactivate it instead of deleting',
      );
    }
    await this.prisma.lender.delete({ where: { id } });
    return { success: true };
  }
}
