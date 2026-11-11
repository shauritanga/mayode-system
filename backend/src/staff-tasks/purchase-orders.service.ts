import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { CreateOrderDto, ReceiveOrderDto } from './dto/staff-tasks.dto';
import { InputStockService } from '../input-stock/input-stock.service';
import { cents, day, num, tenantOf, today } from './common';

const OPEN: PurchaseOrderStatus[] = ['APPROVED', 'PARTIALLY_RECEIVED'];

/**
 * Purchase orders to suppliers and the delivery receipts that record what arrived. The Procurement Officer drafts and receives;
 * a Manager approves, so procurement never approves its own spending. Delivered farm inputs go into stock.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService, private readonly stock: InputStockService) {}

  private async next(mamcosId: string, kind: 'PO' | 'DR') {
    const year = new Date().getUTCFullYear();
    const prefix = `${kind}-${year}-`;
    const count = kind === 'PO'
      ? await this.prisma.purchaseOrder.count({ where: { mamcosId, number: { startsWith: prefix } } })
      : await this.prisma.deliveryReceipt.count({ where: { mamcosId, number: { startsWith: prefix } } });
    return { prefix, n: count };
  }

  async create(actor: RequestUser, dto: CreateOrderDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, isActive: true, OR: [{ mamcosId }, { mamcosId: null }] }, select: { id: true } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const expectedOn = dto.expectedOn ? day(dto.expectedOn) : null;
    if (expectedOn && expectedOn < today()) throw new BadRequestException('The expected delivery date cannot be in the past');
    const inputIds = [...new Set(dto.lines.flatMap((l) => (l.inputItemId ? [l.inputItemId] : [])))];
    if (inputIds.length && (await this.prisma.farmInputItem.count({ where: { id: { in: inputIds }, mamcosId } })) !== inputIds.length) throw new NotFoundException('One of the farm inputs was not found');
    const total = cents(dto.lines.reduce((n, l) => n + cents(l.quantity * l.unitPrice), 0));
    for (let attempt = 0; attempt < 4; attempt++) {
      const { prefix, n } = await this.next(mamcosId, 'PO');
      try {
        const po = await this.prisma.purchaseOrder.create({
          data: {
            mamcosId, number: `${prefix}${String(n + 1 + attempt).padStart(4, '0')}`, supplierId: supplier.id, expectedOn, note: dto.note?.trim() || null, totalAmount: total, createdById: actor.id,
            lines: { create: dto.lines.map((l) => ({ itemName: l.itemName.trim(), inputItemId: l.inputItemId ?? null, unit: l.unit.trim(), quantity: l.quantity, unitPrice: l.unitPrice })) },
          },
        });
        return this.detail(actor, po.id, mamcosId);
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    throw new ConflictException('Could not number the order. Try again');
  }

  private async mine(mamcosId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, mamcosId }, include: { lines: true, receipts: { include: { lines: true }, orderBy: { createdAt: 'asc' } } } });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  private async shape(po: Prisma.PurchaseOrderGetPayload<{ include: { lines: true; receipts: { include: { lines: true } } } }>) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: po.supplierId }, select: { id: true, name: true, contactPhone: true } });
    return {
      id: po.id, number: po.number, status: po.status, supplier, expectedOn: po.expectedOn, note: po.note, totalAmount: num(po.totalAmount), createdAt: po.createdAt,
      createdById: po.createdById, approvedById: po.approvedById, approvedAt: po.approvedAt, cancelReason: po.cancelReason,
      lines: po.lines.map((l) => ({ id: l.id, itemName: l.itemName, inputItemId: l.inputItemId, unit: l.unit, quantity: num(l.quantity), unitPrice: num(l.unitPrice), received: num(l.received), outstanding: cents(num(l.quantity) - num(l.received)) })),
      receipts: po.receipts.map((r) => ({ id: r.id, number: r.number, receivedOn: r.receivedOn, deliveryNote: r.deliveryNote, note: r.note, lines: r.lines.map((x) => ({ lineId: x.orderLineId, quantity: num(x.quantity) })) })),
    };
  }

  async detail(actor: RequestUser, id: string, mamcosIdParam?: string) {
    return this.shape(await this.mine(tenantOf(this.ownership, actor, mamcosIdParam), id));
  }

  async list(actor: RequestUser, q: { status?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const rows = await this.prisma.purchaseOrder.findMany({ where: { mamcosId, ...(q.status && q.status !== 'ALL' ? { status: q.status as PurchaseOrderStatus } : {}) }, orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { receipts: true } } } });
    const suppliers = await this.prisma.supplier.findMany({ where: { id: { in: rows.map((r) => r.supplierId) } }, select: { id: true, name: true } });
    const s = new Map(suppliers.map((x) => [x.id, x.name]));
    return { data: rows.map((r) => ({ id: r.id, number: r.number, status: r.status, supplier: s.get(r.supplierId) ?? '', totalAmount: num(r.totalAmount), expectedOn: r.expectedOn, receipts: r._count.receipts, createdAt: r.createdAt })) };
  }

  /** The Manager approves. Not the person who drafted it. */
  async approve(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const po = await this.mine(mamcosId, id);
    if (po.status !== 'DRAFT') throw new ConflictException('Only a draft order can be approved');
    if (po.createdById === actor.id) throw new ForbiddenException('An order must be approved by someone other than the person who wrote it');
    const claimed = await this.prisma.purchaseOrder.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() } });
    if (!claimed.count) throw new ConflictException('This order has changed. Reload and try again');
    return this.detail(actor, id, mamcosId);
  }

  async cancel(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const po = await this.mine(mamcosId, id);
    if (po.receipts.length) throw new ConflictException('Goods have already been delivered against this order: it cannot be cancelled');
    if (po.status !== 'DRAFT' && po.status !== 'APPROVED') throw new ConflictException('This order cannot be cancelled');
    if (reason.trim().length < 3) throw new BadRequestException('Say why the order is cancelled');
    await this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
    return this.detail(actor, id, mamcosId);
  }

  /** Records a delivery: what arrived against which lines, the supplier's delivery note, and stock in for farm inputs. */
  async receive(actor: RequestUser, id: string, dto: ReceiveOrderDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const po = await this.mine(mamcosId, id);
    if (!OPEN.includes(po.status)) throw new ConflictException(po.status === 'DRAFT' ? 'The Manager must approve the order before goods can be received' : 'This order is not waiting for goods');
    const receivedOn = dto.receivedOn ? day(dto.receivedOn) : today();
    if (receivedOn > today()) throw new BadRequestException('The delivery date cannot be in the future');
    const ids = dto.lines.map((l) => l.lineId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each line can appear once per delivery');
    const warehouseId = dto.warehouseId ?? null;
    if (warehouseId && !(await this.prisma.warehouse.findFirst({ where: { id: warehouseId, mamcosId, isActive: true }, select: { id: true } }))) throw new BadRequestException('Choose one of your own warehouses');
    const supplierName = (await this.prisma.supplier.findUnique({ where: { id: po.supplierId }, select: { name: true } }))?.name ?? null;
    for (const l of dto.lines) {
      const line = po.lines.find((x) => x.id === l.lineId);
      if (!line) throw new BadRequestException('A line does not belong to this order');
      const outstanding = cents(num(line.quantity) - num(line.received));
      if (l.quantity > outstanding + 0.0001) throw new ConflictException(`Only ${outstanding} ${line.unit} of ${line.itemName} is still expected`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${id} FOR UPDATE`;
      const year = new Date().getUTCFullYear();
      const count = await tx.deliveryReceipt.count({ where: { mamcosId, number: { startsWith: `DR-${year}-` } } });
      const receipt = await tx.deliveryReceipt.create({
        data: { mamcosId, orderId: id, number: `DR-${year}-${String(count + 1).padStart(4, '0')}`, receivedOn, deliveryNote: dto.deliveryNote?.trim() || null, note: dto.note?.trim() || null, receivedById: actor.id },
      });
      for (const l of dto.lines) {
        const line = po.lines.find((x) => x.id === l.lineId)!;
        const fresh = await tx.purchaseOrderLine.findUniqueOrThrow({ where: { id: line.id } });
        if (cents(num(fresh.received) + l.quantity) > num(fresh.quantity) + 0.0001) throw new ConflictException(`${line.itemName} was just received by someone else. Reload and try again`);
        await tx.deliveryReceiptLine.create({ data: { receiptId: receipt.id, orderLineId: line.id, quantity: l.quantity } });
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { received: { increment: l.quantity } } });
        // delivered inputs go into the chosen warehouse (the default store when none is named), tied to this delivery
        if (line.inputItemId) await this.stock.receiveWithin(tx, { itemId: line.inputItemId, quantity: l.quantity, userId: actor.id, refType: 'PURCHASE', refId: receipt.id, warehouseId, supplierName, unitCost: num(line.unitPrice) || null, note: `Delivery ${receipt.number} for ${po.number}` });
      }
      const after = await tx.purchaseOrderLine.findMany({ where: { orderId: id } });
      const complete = after.every((x) => num(x.received) >= num(x.quantity) - 0.0001);
      await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED' } });
    });
    return this.detail(actor, id, mamcosId);
  }
}
