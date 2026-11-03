import { cleanGrade } from '../common/rice-grade';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canSeeTenantRow,
  tenantOwner,
  tenantWhere,
  type TenantActor,
} from '../common/tenant';
import { isSuperAdmin } from '../auth/delegation';
import {
  AdjustStockDto,
  CreateWarehouseDto,
  MakeLotDto,
  ReceiveStockDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';
import { lockWarehouse, unlottedKg, warehouseBalance } from './stock';
import { drawFromBatches } from './batch-draw';
import { nextRef } from '../ops/ops-common';
import { ReceivingService } from '../ops/receiving.service';
import { StockAccountingService } from '../ops/stock-accounting.service';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiving: ReceivingService,
    private readonly stockBooks: StockAccountingService,
  ) {}

  /** Warehouse ids this user keeps; empty means unrestricted within their scope. */
  async keptWarehouseIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.warehouseKeeper.findMany({
      where: { userId },
      select: { warehouseId: true },
    });
    return rows.map((r) => r.warehouseId);
  }

  /** A warehouse the actor may act on: in their tenant, and — for assigned keepers — one they keep. */
  async requireWarehouse(
    id: string,
    actor: TenantActor,
    opts: { forDesk?: boolean } = {},
  ) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse || !canSeeTenantRow(actor, warehouse.mamcosId)) {
      throw new NotFoundException('Warehouse not found');
    }
    if (opts.forDesk && !isSuperAdmin(actor)) {
      const kept = await this.keptWarehouseIds(actor.id);
      if (kept.length && !kept.includes(id)) {
        throw new NotFoundException('Warehouse not found');
      }
    }
    return warehouse;
  }

  async create(dto: CreateWarehouseDto, actor: TenantActor) {
    const mamcosId = isSuperAdmin(actor)
      ? (dto.mamcosId ?? null)
      : tenantOwner(actor);
    if (mamcosId) {
      const mamcos = await this.prisma.mamcos.findUnique({
        where: { id: mamcosId },
        select: { id: true },
      });
      if (!mamcos) throw new NotFoundException('AMCOS not found');
    }
    const name = dto.name.trim();
    const dup = await this.prisma.warehouse.findFirst({
      where: { mamcosId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (dup)
      throw new ConflictException('A warehouse with this name already exists');
    return this.prisma.warehouse.create({
      data: {
        name,
        location: dto.location,
        capacityKg: dto.capacityKg,
        mamcosId,
      },
    });
  }

  async findAll(actor: TenantActor) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: tenantWhere(actor),
      include: {
        mamcos: { select: { name: true } },
        keepers: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return Promise.all(
      warehouses.map(async (w) => ({
        ...w,
        balance: await warehouseBalance(this.prisma, w.id),
        unlottedKg: await unlottedKg(this.prisma, w.id),
      })),
    );
  }

  async update(id: string, dto: UpdateWarehouseDto, actor: TenantActor) {
    await this.requireWarehouse(id, actor);
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  async assignKeeper(id: string, userId: string, actor: TenantActor) {
    const warehouse = await this.requireWarehouse(id, actor);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mamcosId: true, isActive: true },
    });
    if (!user || (user.mamcosId ?? null) !== warehouse.mamcosId) {
      throw new BadRequestException(
        'A keeper must be an account of the same cooperative as the warehouse',
      );
    }
    if (!user.isActive)
      throw new BadRequestException('This account is deactivated');
    return this.prisma.warehouseKeeper.upsert({
      where: { warehouseId_userId: { warehouseId: id, userId } },
      update: {},
      create: { warehouseId: id, userId },
    });
  }

  async removeKeeper(id: string, userId: string, actor: TenantActor) {
    await this.requireWarehouse(id, actor);
    await this.prisma.warehouseKeeper.deleteMany({
      where: { warehouseId: id, userId },
    });
    return { removed: true };
  }

  /** Keeper weighs a delivery in: stock goes up through the ledger, records are tied to the warehouse. */
  /** The paddy product a warehouse's counter receipts are recorded under, created the first time it is needed. */
  private async counterProduct(tx: Prisma.TransactionClient, warehouse: { id: string; mamcosId: string | null }) {
    const existing = await tx.product.findFirst({
      where: { mamcosId: warehouse.mamcosId, category: 'PADDY', isActive: true, NOT: { code: { startsWith: 'OPENING-' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return tx.product.upsert({
      where: { code: `PADDY-${(warehouse.mamcosId ?? 'PLATFORM').slice(0, 8)}` },
      update: {},
      create: { mamcosId: warehouse.mamcosId, code: `PADDY-${(warehouse.mamcosId ?? 'PLATFORM').slice(0, 8)}`, name: 'Paddy', category: 'PADDY', unit: 'kg' },
    });
  }

  /** Stock counted in by hand (no delivery record): one batch owned by the cooperative, with a note of why it is there. */
  private async countIn(tx: Prisma.TransactionClient, warehouse: { id: string; mamcosId: string | null }, quantityKg: number, note: string | undefined, actorId: string) {
    const product = await this.counterProduct(tx, warehouse);
    const batch = await tx.stockBatch.create({
      data: { mamcosId: warehouse.mamcosId, reference: await nextRef(tx, 'BT'), productId: product.id, warehouseId: warehouse.id, ownerType: 'COOPERATIVE' },
    });
    await tx.stockLedgerEntry.create({
      data: { batchId: batch.id, warehouseId: warehouse.id, type: 'RECEIPT', quantityKg, refType: 'counted-stock', reason: note?.trim() || 'Counted in at the warehouse', createdByUserId: actorId },
    });
    return batch;
  }

  async receive(id: string, dto: ReceiveStockDto, actor: TenantActor) {
    const warehouse = await this.requireWarehouse(id, actor, { forDesk: true });
    if (!warehouse.isActive)
      throw new BadRequestException('This warehouse is not active');
    const ids = dto.inventoryRecordIds ?? [];
    if (!ids.length && !dto.quantityKg) {
      throw new BadRequestException(
        'Provide inventory records or a counted quantity',
      );
    }
    if (ids.length && dto.quantityKg) {
      throw new BadRequestException(
        'Receive either inventory records or a counted quantity, not both',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, id);
      let quantityKg = dto.quantityKg ?? 0;
      if (ids.length) {
        const records = await tx.inventoryRecord.findMany({ where: { id: { in: ids } } });
        if (records.length !== new Set(ids).size)
          throw new NotFoundException('Some inventory records were not found');
        const already = records.filter((r) => r.warehouseId);
        if (already.length) {
          throw new ConflictException(
            `Already received into a warehouse: ${already.map((r) => r.trackingCode).join(', ')}`,
          );
        }
        quantityKg = records.reduce((sum, r) => sum + r.weightKg, 0);
        if (warehouse.capacityKg) {
          const { onHandKg } = await warehouseBalance(tx, id);
          if (onHandKg + quantityKg > warehouse.capacityKg) {
            throw new BadRequestException(
              `Receiving ${quantityKg} kg would exceed the warehouse capacity of ${warehouse.capacityKg} kg`,
            );
          }
        }
        const product = await this.counterProduct(tx, warehouse);
        for (const r of records) {
          // A delivery that was priced at the centre is already in the books; the receipt carries its cost but does not book it again.
          const priced = r.totalValue != null && r.totalValue > 0 && r.weightKg > 0;
          await this.receiving.receiveWithin(
            tx,
            {
              warehouseId: id, productId: product.id, sourceType: 'EXTERNAL_FARMER', farmerId: r.farmerId, farmId: r.farmId, cropCycleId: r.cropCycleId ?? undefined,
              riceVariety: r.riceVariety ?? undefined, receivedAt: r.receivedDate.toISOString(), grossKg: r.weightKg, bags: r.bags ?? undefined,
              moisturePct: r.moistureContentPct ?? undefined, qualityGrade: r.qualityGrade ?? undefined, notes: `Delivery ${r.trackingCode}`,
              pricePerKg: priced ? r.totalValue! / r.weightKg : undefined,
            },
            actor,
            { mamcosId: warehouse.mamcosId, valuedBySource: priced ? 'PaddyDelivery' : undefined },
          );
        }
        await tx.inventoryRecord.updateMany({
          where: { id: { in: ids }, lotNumber: null },
          data: { warehouseId: id, status: InventoryStatus.IN_STORAGE },
        });
        // Records already batched into a lot keep their BATCHED status.
        await tx.inventoryRecord.updateMany({
          where: { id: { in: ids }, lotNumber: { not: null } },
          data: { warehouseId: id },
        });
        const lotNumbers = [
          ...new Set(
            records.map((r) => r.lotNumber).filter((n): n is string => !!n),
          ),
        ];
        if (lotNumbers.length) {
          await tx.lot.updateMany({
            where: { lotNumber: { in: lotNumbers } },
            data: { warehouseId: id },
          });
        }
      } else {
        if (warehouse.capacityKg) {
          const { onHandKg } = await warehouseBalance(tx, id);
          if (onHandKg + quantityKg > warehouse.capacityKg) {
            throw new BadRequestException(
              `Receiving ${quantityKg} kg would exceed the warehouse capacity of ${warehouse.capacityKg} kg`,
            );
          }
        }
        await this.countIn(tx, warehouse, quantityKg, dto.note, actor.id);
      }
      return { received: quantityKg, balance: await warehouseBalance(tx, id) };
    });
  }

  /** Corrects the count of a warehouse: more is counted in as a new batch, less is taken from the oldest stock and booked as a loss. */
  async adjust(id: string, dto: AdjustStockDto, actor: TenantActor) {
    const warehouse = await this.requireWarehouse(id, actor, { forDesk: true });
    if (!dto.deltaKg)
      throw new BadRequestException('Adjustment cannot be zero');
    return this.prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, id);
      const before = await warehouseBalance(tx, id);
      if (before.availableKg + dto.deltaKg < 0) {
        throw new BadRequestException(
          'Adjustment would take available stock below zero (reserved stock cannot be written off)',
        );
      }
      if (dto.deltaKg > 0) {
        await this.countIn(tx, warehouse, dto.deltaKg, dto.reason, actor.id);
      } else {
        const taken = await drawFromBatches(tx, {
          warehouseId: id, quantityKg: -dto.deltaKg, refType: 'adjustment', refId: id, actorId: actor.id, note: dto.reason, type: 'ADJUSTMENT',
        });
        for (const t of taken) await this.stockBooks.postAdjustment(tx, { id: t.entryId, batchId: t.batchId, quantityKg: -t.quantityKg, reason: dto.reason }, actor.id);
      }
      return warehouseBalance(tx, id);
    });
  }

  /**
   * Counted stock becomes sellable once a lot labels it. The lot is the owner's own rice (no source
   * farmers), so it can be sold and invoiced but produces no farmer payouts.
   */
  async makeLot(id: string, dto: MakeLotDto, actor: TenantActor) {
    const warehouse = await this.requireWarehouse(id, actor, {
      forDesk: true,
    });
    if (!warehouse.isActive)
      throw new BadRequestException('This warehouse is not active');
    const lotNumber = dto.lotNumber.trim().toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, id);
      if (await tx.lot.findUnique({ where: { lotNumber } }))
        throw new ConflictException(`Lot ${lotNumber} already exists`);
      const free = await unlottedKg(tx, id);
      if (dto.quantityKg > free) {
        throw new BadRequestException(
          `Only ${Math.round(free * 100) / 100} kg of counted stock is not in a lot yet. Receive or count more stock first.`,
        );
      }
      return tx.lot.create({
        data: {
          lotNumber,
          riceVariety: dto.riceVariety,
          grade: cleanGrade(dto.grade),
          totalWeightKg: dto.quantityKg,
          warehouseId: id,
        },
      });
    });
  }

  /** Everything that moved in or out of the warehouse, newest first, in plain words (in, out, adjusted, reserved, released). */
  async movements(id: string, actor: TenantActor, take = 100) {
    await this.requireWarehouse(id, actor);
    const limit = Math.min(Math.max(take, 1), 500);
    const [ledger, reservations] = await Promise.all([
      this.prisma.stockLedgerEntry.findMany({ where: { warehouseId: id }, orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.stockMovement.findMany({ where: { warehouseId: id, type: { in: ['RESERVE', 'UNRESERVE'] } }, orderBy: { createdAt: 'desc' }, take: limit }),
    ]);
    const rows = [
      ...ledger.map((e) => ({
        id: e.id,
        type: e.type === 'ADJUSTMENT' || e.type === 'WRITE_OFF' ? 'ADJUST' : e.quantityKg >= 0 ? 'IN' : 'OUT',
        quantityKg: Math.abs(e.quantityKg),
        refType: e.refType, refId: e.refId, note: e.reason, createdByUserId: e.createdByUserId, createdAt: e.createdAt,
      })),
      ...reservations.map((m) => ({ id: m.id, type: m.type as string, quantityKg: m.quantityKg, refType: m.refType, refId: m.refId, note: m.note, createdByUserId: m.createdByUserId, createdAt: m.createdAt })),
    ].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).slice(0, limit);
    const names = await this.userNames(rows.map((r) => r.createdByUserId));
    return rows.map((r) => ({
      ...r,
      createdByName: r.createdByUserId ? (names.get(r.createdByUserId) ?? null) : null,
    }));
  }

  /** Inventory not yet received into any warehouse, for the receiving screen. */
  async unreceivedRecords(actor: TenantActor) {
    return this.prisma.inventoryRecord.findMany({
      where: {
        warehouseId: null,
        status: { in: [InventoryStatus.RECEIVED, InventoryStatus.IN_STORAGE] },
        ...(isSuperAdmin(actor)
          ? {}
          : { farm: { mamcosId: actor.mamcosId ?? null } }),
      },
      select: {
        id: true,
        trackingCode: true,
        weightKg: true,
        qualityGrade: true,
        lotNumber: true,
        receivedDate: true,
        farmer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { receivedDate: 'desc' },
      take: 200,
    });
  }

  async userNames(
    ids: (string | null | undefined)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((u) => [
        u.id,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Unknown',
      ]),
    );
  }
}
