import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantOwner, type TenantActor } from '../common/tenant';
import { UpdateSupplierDto, UpsertSupplierDto } from './dto/supplier.dto';

const clean = (v?: string | null) => (v == null ? v : v.trim().replace(/\s+/g, ' ') || null);

/**
 * Suppliers belong to a cooperative: a cooperative sees its own, plus the older shared entries (no cooperative), and changes only
 * its own. Super Admin sees and changes everything.
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  private visible(actor: TenantActor): Prisma.SupplierWhereInput {
    return actor.role === UserRole.SUPER_ADMIN ? {} : { OR: [{ mamcosId: actor.mamcosId ?? null }, { mamcosId: null }] };
  }

  /** The supplier, if this person may see it. */
  private async find(id: string, actor: TenantActor) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, ...this.visible(actor) } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  /** Only a cooperative's own suppliers can be changed by it; a shared entry is Super Admin's to change. */
  private assertMine(actor: TenantActor, supplier: { mamcosId: string | null }) {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    if (supplier.mamcosId == null || supplier.mamcosId !== (actor.mamcosId ?? null)) {
      throw new ForbiddenException('This is a shared supplier. Only the platform administrator can change it.');
    }
  }

  private async assertNameFree(mamcosId: string | null, name: string, exceptId?: string) {
    const clash = await this.prisma.supplier.findFirst({
      where: { mamcosId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { name: true },
    });
    if (clash) throw new ConflictException(`A supplier called "${clash.name}" already exists`);
  }

  async create(dto: UpsertSupplierDto, actor: TenantActor) {
    const name = clean(dto.name);
    if (!name || name.length < 2) throw new BadRequestException('Give the supplier a name of at least two letters');
    const kind = dto.kind ?? 'COMPANY';
    const mamcosId = tenantOwner(actor);
    await this.assertNameFree(mamcosId, name);
    return this.prisma.supplier.create({
      data: {
        mamcosId, kind, name,
        contactPerson: kind === 'COMPANY' ? clean(dto.contactPerson) : null,
        contactPhone: clean(dto.contactPhone), contactEmail: dto.contactEmail?.trim() || null, tin: clean(dto.tin),
        idNumber: kind === 'INDIVIDUAL' ? clean(dto.idNumber) : null, businessRegNo: kind === 'COMPANY' ? clean(dto.businessRegNo) : null,
        address: clean(dto.address), notes: clean(dto.notes),
        itemsSupplied: [...new Set((dto.itemsSupplied ?? []).map((i) => i.trim()).filter(Boolean))],
      },
    });
  }

  findAll(actor: TenantActor) {
    return this.prisma.supplier.findMany({
      where: this.visible(actor),
      include: { _count: { select: { inputCosts: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, actor: TenantActor) {
    await this.find(id, actor);
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
                farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    });
    return supplier!;
  }

  async update(id: string, dto: UpdateSupplierDto, actor: TenantActor) {
    const current = await this.find(id, actor);
    this.assertMine(actor, current);
    const name = dto.name === undefined ? undefined : clean(dto.name);
    if (name !== undefined) {
      if (!name || name.length < 2) throw new BadRequestException('Give the supplier a name of at least two letters');
      await this.assertNameFree(current.mamcosId, name, id);
    }
    const kind = dto.kind ?? current.kind;
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(dto.contactPerson !== undefined || dto.kind !== undefined ? { contactPerson: kind === 'COMPANY' ? clean(dto.contactPerson ?? current.contactPerson) : null } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: clean(dto.contactPhone) } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail?.trim() || null } : {}),
        ...(dto.tin !== undefined ? { tin: clean(dto.tin) } : {}),
        ...(dto.idNumber !== undefined || dto.kind !== undefined ? { idNumber: kind === 'INDIVIDUAL' ? clean(dto.idNumber ?? current.idNumber) : null } : {}),
        ...(dto.businessRegNo !== undefined || dto.kind !== undefined ? { businessRegNo: kind === 'COMPANY' ? clean(dto.businessRegNo ?? current.businessRegNo) : null } : {}),
        ...(dto.address !== undefined ? { address: clean(dto.address) } : {}),
        ...(dto.notes !== undefined ? { notes: clean(dto.notes) } : {}),
        ...(dto.itemsSupplied !== undefined ? { itemsSupplied: [...new Set(dto.itemsSupplied.map((i) => i.trim()).filter(Boolean))] } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string, actor: TenantActor) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, ...this.visible(actor) },
      include: { _count: { select: { inputCosts: true, bills: true } } },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    this.assertMine(actor, supplier);
    if (supplier._count.inputCosts || supplier._count.bills)
      throw new ConflictException(
        'A supplier with recorded costs or bills cannot be deleted; deactivate it instead to preserve traceability.',
      );
    return this.prisma.supplier.delete({ where: { id } });
  }
}
