import { sameGrade } from '../common/rice-grade';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DispatchTransportMode, Prisma, SaleOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { SettingsService } from '../settings/settings.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { lockWarehouse, warehouseBalance } from '../warehouses/stock';
import {
  canSeeTenantRow,
  tenantWhere,
  type TenantActor,
} from '../common/tenant';
import {
  ApproveSaleOrderDto,
  CreateSaleOrderDto,
  LoadStatusDto,
  LoadTruckDto,
} from './dto/sale-order.dto';

type Tx = Prisma.TransactionClient;

/** Stock held by an order counts against its lot until it is cancelled. */
const LIVE: SaleOrderStatus[] = [
  'RESERVED',
  'CONFIRMED',
  'PARTIALLY_RELEASED',
  'RELEASED',
  'COMPLETED',
];

@Injectable()
export class SaleOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly warehouses: WarehousesService,
    private readonly settings: SettingsService,
  ) {}

  // ---------- helpers ----------

  /**
   * Short enough to read out over a phone call: MAD-26-0042. The three letters come from the
   * cooperative's name; cooperatives that share them simply share one running number, so a
   * reference is always unique. The number restarts each year.
   */
  private async nextReference(
    tx: Tx,
    mamcosId: string | null,
  ): Promise<string> {
    let code = 'MYD';
    if (mamcosId) {
      const mamcos = await tx.mamcos.findUnique({
        where: { id: mamcosId },
        select: { name: true },
      });
      const letters = (mamcos?.name ?? '')
        .split(/\s+/)[0]
        .replace(/[^A-Za-z]/g, '')
        .toUpperCase()
        .slice(0, 3);
      code = letters.padEnd(3, 'X') || 'COP';
    }
    const prefix = `${code}-${String(new Date().getFullYear()).slice(2)}`;
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO reference_counters ("key", "value") VALUES (${prefix}, 1)
      ON CONFLICT ("key") DO UPDATE SET "value" = reference_counters."value" + 1
      RETURNING "value"`;
    return `${prefix}-${String(rows[0].value).padStart(4, '0')}`;
  }

  private async event(
    tx: Tx,
    orderId: string,
    type: string,
    actorId: string | null,
    from: SaleOrderStatus | null,
    to: SaleOrderStatus | null,
    note?: string,
    data?: Prisma.InputJsonValue,
  ) {
    await tx.saleOrderEvent.create({
      data: {
        orderId,
        type,
        actorUserId: actorId,
        fromStatus: from,
        toStatus: to,
        note,
        data,
      },
    });
  }

  private async load(
    id: string,
    actor: TenantActor,
    opts: { forDesk?: boolean } = {},
  ) {
    const order = await this.prisma.saleOrder.findUnique({ where: { id } });
    if (!order || !canSeeTenantRow(actor, order.mamcosId))
      throw new NotFoundException('Sale order not found');
    if (opts.forDesk)
      await this.warehouses.requireWarehouse(order.warehouseId, actor, {
        forDesk: true,
      });
    return order;
  }

  /** Kilograms of the lot not yet promised to a live order or an older direct sale. */
  private async lotRemainingKg(
    tx: Tx,
    lotId: string,
    totalKg: number,
  ): Promise<number> {
    const [ordered, direct] = await Promise.all([
      tx.saleOrder.aggregate({
        where: { lotId, status: { in: LIVE } },
        _sum: { quantityKg: true },
      }),
      tx.sale.aggregate({
        where: { lotId, saleOrder: null },
        _sum: { quantityKg: true },
      }),
    ]);
    return (
      totalKg - (ordered._sum.quantityKg ?? 0) - (direct._sum.quantityKg ?? 0)
    );
  }

  // ---------- reserve ----------

  async reserve(dto: CreateSaleOrderDto, actor: TenantActor) {
    const [buyer, warehouse, lot] = await Promise.all([
      this.prisma.buyer.findUnique({ where: { id: dto.buyerId } }),
      this.warehouses.requireWarehouse(dto.warehouseId, actor),
      this.prisma.lot.findUnique({ where: { id: dto.lotId } }),
    ]);
    if (!buyer || !canSeeTenantRow(actor, buyer.mamcosId))
      throw new NotFoundException('Buyer not found');
    if (!warehouse.isActive)
      throw new BadRequestException('This warehouse is not active');
    if (!lot) throw new NotFoundException('Lot not found');
    if (lot.warehouseId !== warehouse.id)
      throw new BadRequestException(
        'This lot is not stored in the selected warehouse',
      );
    if (buyer.mamcosId !== warehouse.mamcosId) {
      throw new BadRequestException(
        'The buyer and warehouse must belong to the same cooperative',
      );
    }

    if (dto.grade && lot.grade && !sameGrade(dto.grade, lot.grade)) {
      throw new BadRequestException(
        `Lot ${lot.lotNumber} is ${lot.grade}, not ${dto.grade}. Pick a lot of the grade the buyer ordered.`,
      );
    }

    if (dto.agreementId) {
      const agreement = await this.prisma.purchaseAgreement.findUnique({
        where: { id: dto.agreementId },
        select: { buyerId: true, status: true, reference: true },
      });
      if (!agreement || agreement.buyerId !== buyer.id)
        throw new BadRequestException('That purchase agreement belongs to a different buyer');
      if (agreement.status !== 'ACTIVE')
        throw new BadRequestException(`Agreement ${agreement.reference} is not active`);
    }
    if (dto.buyerOrderId) {
      const buyerOrder = await this.prisma.buyerOrder.findUnique({
        where: { id: dto.buyerOrderId },
        select: { buyerId: true, status: true },
      });
      if (!buyerOrder || buyerOrder.buyerId !== buyer.id)
        throw new BadRequestException('That buyer order belongs to a different buyer');
      if (buyerOrder.status === 'CANCELLED' || buyerOrder.status === 'FULFILLED')
        throw new BadRequestException('That buyer order is already closed');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, warehouse.id);
      const balance = await warehouseBalance(tx, warehouse.id);
      if (dto.quantityKg > balance.availableKg) {
        throw new ConflictException(
          `Only ${balance.availableKg} kg is available in ${warehouse.name} (${balance.reservedKg} kg already reserved)`,
        );
      }
      const remaining = await this.lotRemainingKg(
        tx,
        lot.id,
        lot.totalWeightKg,
      );
      if (dto.quantityKg > remaining) {
        throw new ConflictException(
          `Lot ${lot.lotNumber} has only ${remaining} kg left to sell`,
        );
      }
      const mamcosId = warehouse.mamcosId;
      const reference = await this.nextReference(tx, mamcosId);
      const order = await tx.saleOrder.create({
        data: {
          reference,
          mamcosId,
          buyerId: buyer.id,
          warehouseId: warehouse.id,
          lotId: lot.id,
          quantityKg: dto.quantityKg,
          pricePerKg: dto.pricePerKg,
          fairtradePremium: dto.fairtradePremium,
          riceVariety: dto.riceVariety ?? lot.riceVariety,
          grade: lot.grade,
          packaging: dto.packaging,
          needsTransport: dto.needsTransport ?? false,
          notes: dto.notes,
          buyerOrderId: dto.buyerOrderId,
          agreementId: dto.agreementId,
          createdByUserId: actor.id,
        },
      });
      await tx.stockMovement.create({
        data: {
          warehouseId: warehouse.id,
          type: 'RESERVE',
          quantityKg: dto.quantityKg,
          refType: 'sale_order',
          refId: order.id,
          createdByUserId: actor.id,
        },
      });
      await this.event(
        tx,
        order.id,
        'order.reserved',
        actor.id,
        null,
        'RESERVED',
        undefined,
        {
          quantityKg: dto.quantityKg,
          pricePerKg: dto.pricePerKg,
          buyer: buyer.name,
          warehouse: warehouse.name,
          lot: lot.lotNumber,
        },
      );
      return order;
    });
  }

  /** Lots in a warehouse that still have rice left to sell, with how much, for the new-order form. */
  async sellableLots(warehouseId: string, actor: TenantActor) {
    await this.warehouses.requireWarehouse(warehouseId, actor);
    const lots = await this.prisma.lot.findMany({
      where: { warehouseId },
      select: {
        id: true,
        lotNumber: true,
        riceVariety: true,
        grade: true,
        totalWeightKg: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const rows = await Promise.all(
      lots.map(async (lot) => ({
        ...lot,
        remainingKg: await this.lotRemainingKg(
          this.prisma,
          lot.id,
          lot.totalWeightKg,
        ),
      })),
    );
    return rows.filter((l) => l.remainingKg > 0);
  }

  // ---------- read ----------

  async findAll(
    actor: TenantActor,
    filter: { status?: SaleOrderStatus; q?: string } = {},
  ) {
    const orders = await this.prisma.saleOrder.findMany({
      where: {
        ...tenantWhere(actor),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.q
          ? {
              OR: [
                { reference: { contains: filter.q, mode: 'insensitive' } },
                {
                  buyer: { name: { contains: filter.q, mode: 'insensitive' } },
                },
              ],
            }
          : {}),
      },
      include: {
        buyer: { select: { name: true } },
        warehouse: { select: { name: true } },
        lot: { select: { lotNumber: true } },
        sale: { select: { invoiceNumber: true, paymentReceived: true } },
        loads: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const names = await this.warehouses.userNames(
      orders.map((o) => o.createdByUserId),
    );
    return orders.map((o) => ({
      ...o,
      createdByName: names.get(o.createdByUserId) ?? null,
    }));
  }

  /** Full order with the payment gate state and the who/what/when timeline. */
  async detail(
    id: string,
    actor: TenantActor,
    opts: { forDesk?: boolean } = {},
  ) {
    await this.load(id, actor, opts);
    return this.buildDetail(id);
  }

  async lookup(reference: string, actor: TenantActor) {
    const found = await this.prisma.saleOrder.findUnique({
      where: { reference: reference.trim().toUpperCase() },
      select: { id: true },
    });
    if (!found)
      throw new NotFoundException('No sale order with this reference');
    return this.detail(found.id, actor, { forDesk: true });
  }

  private async buildDetail(id: string) {
    const order = await this.prisma.saleOrder.findUniqueOrThrow({
      where: { id },
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            contactPerson: true,
            contactPhone: true,
          },
        },
        warehouse: { select: { id: true, name: true, location: true } },
        lot: {
          select: {
            id: true,
            lotNumber: true,
            riceVariety: true,
            grade: true,
          },
        },
        sale: {
          select: {
            id: true,
            invoiceNumber: true,
            totalRevenue: true,
            paymentReceived: true,
            paymentDate: true,
          },
        },
        loads: { orderBy: { sequence: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    const names = await this.warehouses.userNames([
      order.createdByUserId,
      order.confirmedByUserId,
      order.releasedByUserId,
      order.cancelledByUserId,
      order.creditApprovedByUserId,
      order.releaseApprovedByUserId,
      ...order.loads.map((l) => l.loadedByUserId),
      ...order.events.map((e) => e.actorUserId),
    ]);
    const name = (uid?: string | null) =>
      uid ? (names.get(uid) ?? 'Unknown') : null;
    const loadedKg = order.loads.reduce((sum, l) => sum + l.weightKg, 0);
    const { reservationExpiryDays: expiryDays } =
      await this.settings.getSalesSettings();
    const paid = !!order.sale?.paymentReceived;
    const creditApproved = order.creditTermDays != null;
    const releaseApproved = !!order.releaseApprovedByUserId;
    return {
      ...order,
      amount:
        order.quantityKg * order.pricePerKg + (order.fairtradePremium ?? 0),
      createdByName: name(order.createdByUserId),
      confirmedByName: name(order.confirmedByUserId),
      releasedByName: name(order.releasedByUserId),
      cancelledByName: name(order.cancelledByUserId),
      payment: {
        paid,
        creditApproved,
        creditApprovedByName: name(order.creditApprovedByUserId),
        releaseApproved,
        releaseApprovedByName: name(order.releaseApprovedByUserId),
        /** The keeper may release only when this is true; otherwise a manager approval is needed. */
        canRelease: paid || creditApproved || releaseApproved,
      },
      loadedKg,
      remainingKg: Math.max(order.quantityKg - loadedKg, 0),
      expiresAt:
        order.status === 'RESERVED' && expiryDays > 0
          ? new Date(order.createdAt.getTime() + expiryDays * 86_400_000)
          : null,
      loads: order.loads.map((l) => ({
        ...l,
        loadedByName: name(l.loadedByUserId),
      })),
      events: order.events.map((e) => ({
        ...e,
        actorName: name(e.actorUserId),
      })),
    };
  }

  // ---------- keeper: confirm → (approval) → release ----------

  /** Keeper verifies the buyer and weight, then the financial sale, invoice and farmer obligations are created. */
  async confirm(id: string, actor: TenantActor, note?: string) {
    const order = await this.load(id, actor, { forDesk: true });
    if (order.status !== 'RESERVED')
      throw new ConflictException(
        `Order is already ${order.status.toLowerCase()}`,
      );

    // Claim the transition first so two keepers cannot both create a financial sale.
    const claimed = await this.prisma.saleOrder.updateMany({
      where: { id, status: 'RESERVED' },
      data: { status: 'CONFIRMED' },
    });
    if (!claimed.count)
      throw new ConflictException('Order was just changed by someone else');
    try {
      const sale = await this.sales.create(
        {
          lotId: order.lotId,
          buyerId: order.buyerId,
          quantityKg: order.quantityKg,
          pricePerKg: order.pricePerKg,
          fairtradePremium: order.fairtradePremium ?? undefined,
          riceVariety: order.riceVariety ?? undefined,
          packaging: order.packaging ?? undefined,
          buyerOrderId: order.buyerOrderId ?? undefined,
          agreementId: order.agreementId ?? undefined,
          saleDate: new Date().toISOString(),
        },
        { mamcosId: order.mamcosId },
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.saleOrder.update({
          where: { id },
          data: {
            saleId: sale.id,
            confirmedByUserId: actor.id,
            confirmedAt: new Date(),
          },
        });
        await this.event(
          tx,
          id,
          'order.confirmed',
          actor.id,
          'RESERVED',
          'CONFIRMED',
          note,
          { invoiceNumber: sale.invoiceNumber },
        );
      });
    } catch (err) {
      await this.prisma.saleOrder.updateMany({
        where: { id, status: 'CONFIRMED', saleId: null },
        data: { status: 'RESERVED' },
      });
      throw err;
    }
    return this.buildDetail(id);
  }

  /** A manager lets stock leave before payment: either a credit term or a one-off release override. */
  async approve(id: string, dto: ApproveSaleOrderDto, actor: TenantActor) {
    const order = await this.load(id, actor);
    if (!['RESERVED', 'CONFIRMED'].includes(order.status))
      throw new ConflictException('Only open orders can be approved');
    await this.prisma.$transaction(async (tx) => {
      if (dto.kind === 'CREDIT') {
        if (!dto.creditTermDays)
          throw new BadRequestException('A credit term in days is required');
        await tx.saleOrder.update({
          where: { id },
          data: {
            creditTermDays: dto.creditTermDays,
            creditApprovedByUserId: actor.id,
          },
        });
        await this.event(
          tx,
          id,
          'order.credit_approved',
          actor.id,
          order.status,
          order.status,
          dto.note,
          { creditTermDays: dto.creditTermDays },
        );
      } else {
        await tx.saleOrder.update({
          where: { id },
          data: {
            releaseApprovedByUserId: actor.id,
            releaseApprovedAt: new Date(),
          },
        });
        await this.event(
          tx,
          id,
          'order.release_approved',
          actor.id,
          order.status,
          order.status,
          dto.note,
        );
      }
    });
    return this.buildDetail(id);
  }

  /**
   * Loads one truck. Each trip is weighed, moves stock out of the warehouse by the weighed
   * figure, and gets its own vehicle and delivery progress. The order is released once the
   * loaded weight reaches the ordered weight (within tolerance).
   */
  async loadTruck(id: string, dto: LoadTruckDto, actor: TenantActor) {
    const order = await this.load(id, actor, { forDesk: true });
    if (order.status !== 'CONFIRMED' && order.status !== 'PARTIALLY_RELEASED') {
      throw new ConflictException(
        order.status === 'RESERVED'
          ? 'Confirm the order before loading a truck'
          : `Order is already ${order.status.toLowerCase().replace('_', ' ')}`,
      );
    }
    const mode =
      dto.mode ?? (order.needsTransport ? 'OWN_FLEET' : 'BUYER_PICKUP');
    if (order.needsTransport && mode === 'BUYER_PICKUP') {
      throw new BadRequestException(
        'The buyer asked us to arrange transport: choose our own vehicle or a hired transporter',
      );
    }
    if (!order.needsTransport && mode !== 'BUYER_PICKUP') {
      throw new BadRequestException(
        'The buyer collects with their own truck for this order',
      );
    }
    if (mode === 'HIRED' && !dto.transporterName?.trim()) {
      throw new BadRequestException('Name the transporter for a hired vehicle');
    }
    const tolerance =
      (await this.settings.getSalesSettings()).loadTolerancePct / 100;
    const sale = await this.prisma.sale.findUniqueOrThrow({
      where: { id: order.saleId! },
      include: {
        lot: { include: { inventoryRecords: { select: { id: true } } } },
      },
    });
    if (
      !(
        sale.paymentReceived ||
        order.creditTermDays != null ||
        order.releaseApprovedByUserId
      )
    ) {
      throw new ConflictException(
        'Payment has not been received. A manager must approve credit or an unpaid release first.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, order.warehouseId);
      const loads = await tx.orderLoad.findMany({
        where: { saleOrderId: id },
        select: { weightKg: true, sequence: true },
      });
      const loadedBefore = loads.reduce((s, l) => s + l.weightKg, 0);
      const owed = order.quantityKg - loadedBefore;
      const weightKg = dto.weightKg ?? owed;
      if (weightKg <= 0)
        throw new BadRequestException('Nothing is left to load');
      const ceiling = order.quantityKg * (1 + tolerance);
      if (loadedBefore + weightKg > ceiling) {
        throw new BadRequestException(
          `This would load ${Math.round(loadedBefore + weightKg)} kg against an order of ${order.quantityKg} kg (allowed up to ${Math.floor(ceiling)} kg). Re-weigh, or ask the salesperson to raise a new order for the extra.`,
        );
      }
      const loadedAfter = loadedBefore + weightKg;
      const complete = loadedAfter >= order.quantityKg * (1 - tolerance);

      // The reservation covers the ordered weight; anything loaded beyond it comes from free stock.
      const reservedLeft = Math.max(order.quantityKg - loadedBefore, 0);
      const fromReserved = Math.min(weightKg, reservedLeft);
      const extra = weightKg - fromReserved;
      if (extra > 0) {
        const balance = await warehouseBalance(tx, order.warehouseId);
        if (extra > balance.availableKg) {
          throw new ConflictException(
            `Only ${balance.availableKg} kg of free stock is left to cover the extra ${Math.round(extra)} kg`,
          );
        }
      }
      // A short final load frees what will no longer leave.
      const shortfall = complete
        ? Math.max(order.quantityKg - loadedAfter, 0)
        : 0;
      const movements: Prisma.StockMovementCreateManyInput[] = [
        {
          warehouseId: order.warehouseId,
          type: 'OUT' as const,
          quantityKg: weightKg,
          refType: 'sale_order',
          refId: id,
          note: `Load ${loads.length + 1} on ${order.reference}`,
          createdByUserId: actor.id,
        },
      ];
      if (fromReserved + shortfall > 0) {
        movements.unshift({
          warehouseId: order.warehouseId,
          type: 'UNRESERVE' as const,
          quantityKg: fromReserved + shortfall,
          refType: 'sale_order',
          refId: id,
          note: shortfall
            ? `Released ${Math.round(shortfall)} kg short of the order`
            : undefined,
          createdByUserId: actor.id,
        });
      }
      await tx.stockMovement.createMany({ data: movements });

      const sequence = Math.max(0, ...loads.map((l) => l.sequence)) + 1;
      const delivered = mode === 'BUYER_PICKUP';
      await tx.orderLoad.create({
        data: {
          saleOrderId: id,
          sequence,
          weightKg,
          bagCount: dto.bagCount,
          vehiclePlate: dto.vehiclePlate.trim().toUpperCase(),
          driverName: dto.driverName.trim(),
          driverPhone: dto.driverPhone,
          mode,
          transporterName: dto.transporterName,
          fee: dto.fee,
          destination: dto.destination,
          notes: dto.notes,
          loadedByUserId: actor.id,
          // A buyer's own truck leaves with the goods at the gate.
          status: delivered ? 'DELIVERED' : 'ASSIGNED',
          ...(delivered
            ? {
                departedAt: new Date(),
                deliveredAt: new Date(),
                receivedBy: dto.driverName.trim(),
              }
            : {}),
        },
      });

      const next = complete ? 'RELEASED' : 'PARTIALLY_RELEASED';
      const claimed = await tx.saleOrder.updateMany({
        where: { id, status: { in: ['CONFIRMED', 'PARTIALLY_RELEASED'] } },
        data: {
          status: next,
          ...(complete
            ? { releasedByUserId: actor.id, releasedAt: new Date() }
            : {}),
        },
      });
      if (!claimed.count)
        throw new ConflictException('Order was just changed by someone else');

      if (sequence === 1) {
        await tx.dispatch.create({
          data: {
            saleId: sale.id,
            transportMode: order.needsTransport
              ? DispatchTransportMode.MAYODE_ARRANGED
              : DispatchTransportMode.BUYER_OWN_VEHICLE,
            vehiclePlateNumber: dto.vehiclePlate.trim().toUpperCase(),
            driverName: dto.driverName.trim(),
            driverPhone: dto.driverPhone,
            transportFee: dto.fee,
            notes: dto.notes,
            releasedByUserId: actor.id,
          },
        });
      }
      if (complete) {
        const recordIds = sale.lot.inventoryRecords.map((r) => r.id);
        if (recordIds.length) {
          await tx.inventoryRecord.updateMany({
            where: { id: { in: recordIds }, status: { not: 'SHIPPED' } },
            data: { status: 'SHIPPED' },
          });
        }
      }
      await this.event(
        tx,
        id,
        'order.truck_loaded',
        actor.id,
        order.status,
        next,
        dto.notes,
        {
          load: sequence,
          weightKg,
          bagCount: dto.bagCount ?? null,
          vehiclePlate: dto.vehiclePlate.trim().toUpperCase(),
          driverName: dto.driverName.trim(),
          mode,
          transporterName: dto.transporterName ?? null,
          loadedKg: loadedAfter,
          orderedKg: order.quantityKg,
          paid: sale.paymentReceived,
          creditTermDays: order.creditTermDays,
          overrideBy: order.releaseApprovedByUserId,
        },
      );
    });
    return this.buildDetail(id);
  }

  async cancel(id: string, reason: string, actor: TenantActor) {
    const order = await this.load(id, actor);
    if (order.status !== 'RESERVED') {
      throw new ConflictException(
        order.status === 'CANCELLED'
          ? 'Order is already cancelled'
          : 'A confirmed order has a financial sale and can no longer be cancelled here',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, order.warehouseId);
      const claimed = await tx.saleOrder.updateMany({
        where: { id, status: 'RESERVED' },
        data: {
          status: 'CANCELLED',
          cancelledByUserId: actor.id,
          cancelledAt: new Date(),
          cancelReason: reason,
        },
      });
      if (!claimed.count)
        throw new ConflictException('Order was just changed by someone else');
      await tx.stockMovement.create({
        data: {
          warehouseId: order.warehouseId,
          type: 'UNRESERVE',
          quantityKg: order.quantityKg,
          refType: 'sale_order',
          refId: id,
          note: reason,
          createdByUserId: actor.id,
        },
      });
      await this.event(
        tx,
        id,
        'order.cancelled',
        actor.id,
        'RESERVED',
        'CANCELLED',
        reason,
      );
    });
    return this.buildDetail(id);
  }

  // ---------- transport ----------

  /** Moves one truck along: it leaves the gate, then is received by the buyer. */
  async setLoadStatus(
    id: string,
    loadId: string,
    dto: LoadStatusDto,
    actor: TenantActor,
  ) {
    const order = await this.load(id, actor, { forDesk: true });
    const load = await this.prisma.orderLoad.findFirst({
      where: { id: loadId, saleOrderId: id },
    });
    if (!load) throw new NotFoundException('Load not found');
    if (load.status === 'DELIVERED')
      throw new ConflictException('This load has already been delivered');
    if (dto.status === 'IN_TRANSIT' && load.status !== 'ASSIGNED') {
      throw new ConflictException('This load is already on the road');
    }
    if (dto.status === 'DELIVERED' && !dto.receivedBy?.trim()) {
      throw new BadRequestException('Record who received the goods');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.orderLoad.update({
        where: { id: loadId },
        data:
          dto.status === 'IN_TRANSIT'
            ? { status: 'IN_TRANSIT', departedAt: new Date() }
            : {
                status: 'DELIVERED',
                deliveredAt: new Date(),
                departedAt: load.departedAt ?? new Date(),
                receivedBy: dto.receivedBy!.trim(),
                proofNote: dto.proofNote,
              },
      });
      await this.event(
        tx,
        id,
        dto.status === 'IN_TRANSIT' ? 'load.departed' : 'load.delivered',
        actor.id,
        order.status,
        order.status,
        dto.proofNote,
        {
          load: load.sequence,
          vehiclePlate: load.vehiclePlate,
          ...(dto.receivedBy ? { receivedBy: dto.receivedBy.trim() } : {}),
        },
      );
    });
    return this.buildDetail(id);
  }

  /** Closes the order once every truck has been received and the money is in. */
  async complete(id: string, actor: TenantActor) {
    const order = await this.load(id, actor, { forDesk: true });
    if (order.status !== 'RELEASED') {
      throw new ConflictException(
        order.status === 'PARTIALLY_RELEASED'
          ? 'Some of the order is still to be loaded'
          : 'Only a fully loaded order can be completed',
      );
    }
    const [loads, sale] = await Promise.all([
      this.prisma.orderLoad.findMany({
        where: { saleOrderId: id },
        select: { status: true },
      }),
      this.prisma.sale.findUniqueOrThrow({
        where: { id: order.saleId! },
        select: { paymentReceived: true },
      }),
    ]);
    if (loads.some((l) => l.status !== 'DELIVERED'))
      throw new BadRequestException('Not every truck has been delivered yet');
    if (!sale.paymentReceived)
      throw new BadRequestException('Payment has not been settled yet');
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.saleOrder.updateMany({
        where: { id, status: 'RELEASED' },
        data: { status: 'COMPLETED' },
      });
      if (!claimed.count)
        throw new ConflictException('Order was just changed by someone else');
      await this.event(
        tx,
        id,
        'order.completed',
        actor.id,
        'RELEASED',
        'COMPLETED',
      );
    });
    return this.buildDetail(id);
  }

  /**
   * A buyer who will not collect the rest. The manager closes the order at what was loaded: the
   * unloaded stock goes back on sale, and the sale, invoice and farmer payouts shrink to match.
   */
  async closeShort(id: string, reason: string, actor: TenantActor) {
    const order = await this.load(id, actor);
    if (order.status !== 'PARTIALLY_RELEASED') {
      throw new ConflictException(
        'Only an order that is part loaded can be closed short',
      );
    }
    const loads = await this.prisma.orderLoad.findMany({
      where: { saleOrderId: id },
      select: { weightKg: true },
    });
    const loadedKg = loads.reduce((sum, l) => sum + l.weightKg, 0);
    const unloaded = order.quantityKg - loadedKg;
    if (unloaded <= 0)
      throw new ConflictException('Everything has already been loaded');

    // Shrink the financial sale first; it refuses if payment has already been settled.
    await this.sales.reduceQuantity(order.saleId!, loadedKg);
    await this.prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, order.warehouseId);
      const claimed = await tx.saleOrder.updateMany({
        where: { id, status: 'PARTIALLY_RELEASED' },
        data: {
          status: 'RELEASED',
          quantityKg: loadedKg,
          // The bag count described the ordered weight, which no longer applies.
          packaging: null,
          releasedByUserId: actor.id,
          releasedAt: new Date(),
        },
      });
      if (!claimed.count)
        throw new ConflictException('Order was just changed by someone else');
      await tx.stockMovement.create({
        data: {
          warehouseId: order.warehouseId,
          type: 'UNRESERVE',
          quantityKg: unloaded,
          refType: 'sale_order',
          refId: id,
          note: `Closed short: ${reason}`,
          createdByUserId: actor.id,
        },
      });
      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: order.saleId! },
        include: {
          lot: { include: { inventoryRecords: { select: { id: true } } } },
        },
      });
      const ids = sale.lot.inventoryRecords.map((r) => r.id);
      if (ids.length) {
        await tx.inventoryRecord.updateMany({
          where: { id: { in: ids }, status: { not: 'SHIPPED' } },
          data: { status: 'SHIPPED' },
        });
      }
      await this.event(
        tx,
        id,
        'order.closed_short',
        actor.id,
        'PARTIALLY_RELEASED',
        'RELEASED',
        reason,
        {
          orderedKg: order.quantityKg,
          loadedKg,
          releasedBackKg: unloaded,
        },
      );
    });
    return this.buildDetail(id);
  }

  /**
   * Hourly sweep: an order nobody confirmed holds stock off the market. After the configured
   * number of days it is cancelled and its reservation returned, recorded as done by the system.
   */
  async expireStale(): Promise<number> {
    const { reservationExpiryDays } = await this.settings.getSalesSettings();
    if (reservationExpiryDays <= 0) return 0;
    const cutoff = new Date(Date.now() - reservationExpiryDays * 86_400_000);
    const stale = await this.prisma.saleOrder.findMany({
      where: { status: 'RESERVED', createdAt: { lt: cutoff } },
      select: { id: true, warehouseId: true, quantityKg: true },
    });
    let expired = 0;
    for (const order of stale) {
      const reason = `Not confirmed within ${reservationExpiryDays} days`;
      await this.prisma.$transaction(async (tx) => {
        await lockWarehouse(tx, order.warehouseId);
        const claimed = await tx.saleOrder.updateMany({
          where: { id: order.id, status: 'RESERVED' },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: reason,
          },
        });
        if (!claimed.count) return;
        await tx.stockMovement.create({
          data: {
            warehouseId: order.warehouseId,
            type: 'UNRESERVE',
            quantityKg: order.quantityKg,
            refType: 'sale_order',
            refId: order.id,
            note: reason,
          },
        });
        await this.event(
          tx,
          order.id,
          'order.expired',
          null,
          'RESERVED',
          'CANCELLED',
          reason,
        );
        expired++;
      });
    }
    return expired;
  }
}
