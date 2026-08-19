import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
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
