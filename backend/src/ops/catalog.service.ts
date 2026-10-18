import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, nextRef, owner, scope } from './ops-common';
import { UpsertCustomerDto, UpsertProductDto } from './dto/catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- products ----------

  products(actor: Actor, f: { category?: string; active?: string; q?: string } = {}) {
    return this.prisma.product.findMany({
      where: {
        ...scope(actor),
        ...(f.category ? { category: f.category as never } : {}),
        ...(f.active === 'true' ? { isActive: true } : f.active === 'false' ? { isActive: false } : {}),
        ...(f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { brand: { contains: f.q, mode: 'insensitive' } }, { code: { contains: f.q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ category: 'asc' }, { brand: 'asc' }, { name: 'asc' }],
    });
  }

  async createProduct(dto: UpsertProductDto, actor: Actor) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const code = dto.code?.trim() || (await nextRef(tx, 'PRD'));
        return tx.product.create({ data: { ...this.productData(dto), code, mamcosId: owner(actor) } });
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new ConflictException('A product with this code already exists');
      throw e;
    }
  }

  private productData(dto: UpsertProductDto): Omit<Prisma.ProductCreateInput, 'code'> {
    if (dto.category === 'PROCESSED' && !dto.packSizeKg && dto.unit === 'bag') throw new BadRequestException('Give the pack size in kg for a bagged product');
    return {
      name: dto.name.trim(), brand: dto.brand?.trim() || null, riceVariety: dto.riceVariety?.trim() || null, category: dto.category,
      grade: dto.grade?.trim() || null, packSizeKg: dto.packSizeKg ?? null, unit: dto.unit?.trim() || 'kg', unitPrice: dto.unitPrice ?? null,
      taxRatePercent: dto.taxRatePercent ?? 0, reorderLevelKg: dto.reorderLevelKg ?? null, isActive: dto.isActive ?? true,
    };
  }

  async updateProduct(id: string, dto: UpsertProductDto, actor: Actor) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    assertVisible(actor, p, 'Product');
    return this.prisma.product.update({ where: { id }, data: this.productData(dto) });
  }

  // ---------- customers ----------

  customers(actor: Actor, f: { q?: string; type?: string; active?: string } = {}) {
    const q = f.q?.trim();
    return this.prisma.customer.findMany({
      where: {
        ...scope(actor),
        ...(f.type ? { type: f.type as CustomerType } : {}),
        ...(f.active === 'false' ? { isActive: false } : { isActive: true }),
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q.replace(/\s/g, '') } }, { tin: { contains: q, mode: 'insensitive' } }, { contactPerson: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  /** What each type of customer must give. A person is not asked for company details, and a company must name a contact. */
  private customerData(dto: UpsertCustomerDto) {
    const business = dto.type === 'BUSINESS';
    if (business && !dto.contactPerson?.trim()) throw new BadRequestException('A business customer needs a contact person');
    const clean = (v?: string) => v?.trim() || null;
    return {
      type: dto.type,
      name: dto.name.trim(),
      phone: dto.phone.replace(/\s/g, ''),
      email: clean(dto.email),
      address: clean(dto.address),
      billingAddress: clean(dto.billingAddress),
      notes: clean(dto.notes),
      idNumber: business ? null : clean(dto.idNumber),
      contactPerson: business ? clean(dto.contactPerson) : null,
      businessRegNo: business ? clean(dto.businessRegNo) : null,
      tin: business ? clean(dto.tin) : null,
      vrn: business ? clean(dto.vrn) : null,
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
    };
  }

  async createCustomer(dto: UpsertCustomerDto, actor: Actor) {
    const data = this.customerData(dto);
    const dup = await this.prisma.customer.findFirst({ where: { ...scope(actor), phone: data.phone, name: { equals: data.name, mode: 'insensitive' } }, select: { reference: true } });
    if (dup) throw new ConflictException(`${data.name} is already registered as ${dup.reference}`);
    return this.prisma.$transaction(async (tx) => tx.customer.create({ data: { ...data, reference: await nextRef(tx, 'CU'), mamcosId: owner(actor) } }));
  }

  async updateCustomer(id: string, dto: UpsertCustomerDto, actor: Actor) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    assertVisible(actor, c, 'Customer');
    return this.prisma.customer.update({ where: { id }, data: this.customerData(dto) });
  }

  async customer(id: string, actor: Actor) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: { orders: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, reference: true, status: true, paymentStatus: true, fulfilState: true, total: true, amountPaid: true, createdAt: true } } },
    });
    assertVisible(actor, c, 'Customer');
    return c;
  }

  async requireCustomer(id: string, actor: Actor) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c || !c.isActive) throw new NotFoundException('Customer not found');
    assertVisible(actor, c, 'Customer');
    return c;
  }
}
