import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, nextRef, owner, OpsNotifyService, scope, Tx } from './ops-common';
import { r3 } from './ops-rules';
import { CreateReceiptDto } from './dto/warehouse.dto';

type User = Actor & { id: string };

@Injectable()
export class ReceivingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: OpsNotifyService,
  ) {}

  private include = {
    product: { select: { name: true, brand: true, code: true } },
    warehouse: { select: { name: true } },
    farmer: { select: { firstName: true, lastName: true, controlNumber: true } },
    farm: { select: { farmCode: true, name: true } },
    plot: { select: { plotCode: true, name: true } },
    cropCycle: { select: { season: true, riceVariety: true, plantingDate: true, harvestDate: true } },
    harvest: { select: { reference: true, batchRef: true, actualKg: true } },
    batch: { select: { id: true, reference: true } },
  } as const;

  list(actor: Actor, f: { status?: string; farmerId?: string; sourceType?: string; q?: string; from?: string; to?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    return this.prisma.goodsReceipt.findMany({
      where: {
        ...scope(actor),
        ...(f.status ? { status: f.status as never } : {}),
        ...(f.farmerId ? { farmerId: f.farmerId } : {}),
        ...(f.sourceType ? { sourceType: f.sourceType as never } : {}),
        ...(f.from || to ? { receivedAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(f.q ? { OR: [{ reference: { contains: f.q, mode: 'insensitive' } }, { sellerName: { contains: f.q, mode: 'insensitive' } }, { farmer: { OR: [{ firstName: { contains: f.q, mode: 'insensitive' } }, { lastName: { contains: f.q, mode: 'insensitive' } }, { controlNumber: { contains: f.q, mode: 'insensitive' } }] } }] } : {}),
      },
      include: this.include,
      orderBy: { receivedAt: 'desc' },
      take: 500,
    });
  }

  async detail(id: string, actor: Actor) {
    const r = await this.prisma.goodsReceipt.findUnique({ where: { id }, include: this.include });
    assertVisible(actor, r, 'Receipt');
    return r;
  }

  /** The receipt must tell the truth about where the rice came from: a known farmer, a Mayode farm, or a named seller. */
  private async validate(dto: CreateReceiptDto, actor: Actor) {
    const [warehouse, product] = await Promise.all([
      this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } }),
      this.prisma.product.findUnique({ where: { id: dto.productId } }),
    ]);
    if (!warehouse || !warehouse.isActive) throw new NotFoundException('Warehouse not found');
    if (!product || !product.isActive) throw new NotFoundException('Product not found');
    if (product.category !== 'PADDY') throw new BadRequestException('Only paddy rice is received this way; choose a paddy product');
    const linkedHarvest = dto.harvestRecordId ? await this.prisma.harvestRecord.findUnique({ where: { id: dto.harvestRecordId }, select: { farmId: true } }) : null;
    if (dto.sourceType === 'MAYODE_FARM' && !dto.farmId && !linkedHarvest) throw new BadRequestException('Choose the Mayode farm this rice came from');
    if (dto.sourceType === 'EXTERNAL_FARMER' && !dto.farmerId && !dto.sellerName?.trim()) throw new BadRequestException('Choose the farmer, or write the seller’s name');
    const rejected = dto.rejectedKg ?? 0;
    if (rejected > dto.grossKg) throw new BadRequestException('Rejected rice cannot be more than the quantity delivered');
    if (dto.inspection === 'FAILED' && rejected < dto.grossKg) throw new BadRequestException('A failed inspection means all of the delivery is rejected');

    let farmerId = dto.farmerId ?? null;
    let farmId = dto.farmId ?? null;
    let plotId = dto.plotId ?? null;
    let cycleId = dto.cropCycleId ?? null;
    const harvest = dto.harvestRecordId ? await this.prisma.harvestRecord.findUnique({ where: { id: dto.harvestRecordId } }) : null;
    if (dto.harvestRecordId && !harvest) throw new NotFoundException('Harvest record not found');
    if (harvest) {
      farmId = farmId ?? harvest.farmId;
      plotId = plotId ?? harvest.plotId;
      cycleId = cycleId ?? harvest.cropCycleId;
      if (harvest.farmId !== farmId) throw new BadRequestException('That harvest belongs to a different farm');
    }
    if (farmerId && !(await this.prisma.farmer.findUnique({ where: { id: farmerId }, select: { id: true } }))) throw new NotFoundException('Farmer not found');
    if (farmId && !(await this.prisma.farm.findUnique({ where: { id: farmId }, select: { id: true } }))) throw new NotFoundException('Farm not found');
    if (plotId) {
      const plot = await this.prisma.plot.findUnique({ where: { id: plotId }, select: { farmId: true } });
      if (!plot || plot.farmId !== farmId) throw new BadRequestException('That plot is not on the chosen farm');
    }
    let variety = dto.riceVariety?.trim() || product.riceVariety || null;
    if (cycleId) {
      const cycle = await this.prisma.cropCycle.findUnique({ where: { id: cycleId }, select: { farmId: true, farmerId: true, riceVariety: true } });
      if (!cycle || (farmId && cycle.farmId !== farmId)) throw new BadRequestException('That crop season is not on the chosen farm');
      if (farmerId && cycle.farmerId !== farmerId && dto.sourceType === 'EXTERNAL_FARMER') throw new BadRequestException('That crop season belongs to a different farmer');
      if (!farmerId && dto.sourceType === 'EXTERNAL_FARMER') farmerId = cycle.farmerId;
      variety = variety ?? cycle.riceVariety ?? null;
    }
    return { farmerId, farmId, plotId, cycleId, variety, harvest, warehouse, product };
  }

  async create(dto: CreateReceiptDto, actor: User) {
    const v = await this.validate(dto, actor);
    const receipt = await this.prisma.$transaction(async (tx) => {
      const reference = await nextRef(tx, 'GR');
      return tx.goodsReceipt.create({
        data: {
          mamcosId: owner(actor), reference, warehouseId: dto.warehouseId, productId: dto.productId, sourceType: dto.sourceType,
          farmerId: v.farmerId, sellerName: dto.sellerName?.trim() || null, sellerPhone: dto.sellerPhone?.trim() || null,
          farmId: v.farmId, plotId: v.plotId, cropCycleId: v.cycleId, harvestRecordId: v.harvest?.id ?? null,
          harvestBatchRef: dto.harvestBatchRef?.trim() || v.harvest?.batchRef || null, riceVariety: v.variety,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(), grossKg: dto.grossKg, bags: dto.bags ?? null, bagWeightKg: dto.bagWeightKg ?? null,
          moisturePct: dto.moisturePct ?? null, qualityGrade: dto.qualityGrade?.trim() || null, inspection: dto.inspection ?? 'NOT_REQUIRED',
          rejectedKg: dto.rejectedKg ?? 0, inspectionNotes: dto.inspectionNotes?.trim() || null, notes: dto.notes?.trim() || null,
          attachments: dto.attachments ?? [], receivedByUserId: actor.id,
        },
      });
    });
    return dto.confirmNow ? this.confirm(receipt.id, actor) : this.detail(receipt.id, actor);
  }

  /** Confirming is what adds stock: a batch is created, linked to the source, and the ledger gets one RECEIPT row. */
  async confirm(id: string, actor: User) {
    const result = await this.prisma.$transaction(async (tx: Tx) => {
      const r = await tx.goodsReceipt.findUnique({ where: { id }, include: { product: true } });
      assertVisible(actor, r, 'Receipt');
      const acceptedKg = r3(r.grossKg - r.rejectedKg);
      if (acceptedKg <= 0) throw new BadRequestException('Nothing was accepted, so there is no stock to add. Cancel the receipt instead.');
      const claimed = await tx.goodsReceipt.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CONFIRMED', confirmedByUserId: actor.id, confirmedAt: new Date() } });
      if (!claimed.count) throw new ConflictException('This receipt has already been confirmed or cancelled');
      const batch = await tx.stockBatch.create({
        data: {
          mamcosId: r.mamcosId, reference: await nextRef(tx, 'BT'), productId: r.productId, warehouseId: r.warehouseId, riceVariety: r.riceVariety,
          grade: r.qualityGrade, receiptId: r.id,
        },
      });
      await tx.stockLedgerEntry.create({ data: { batchId: batch.id, warehouseId: r.warehouseId, type: 'RECEIPT', quantityKg: acceptedKg, refType: 'receipt', refId: r.id, createdByUserId: actor.id } });
      // Keep the crop record in step with what actually reached the warehouse.
      if (r.cropCycleId) {
        await tx.harvestQualityCheck.upsert({
          where: { cropCycleId: r.cropCycleId },
          create: { cropCycleId: r.cropCycleId, bagCount: r.bags, bagWeightKg: r.bagWeightKg, dryingMoisturePct: r.moisturePct, warehouseReceivedAt: r.receivedAt },
          update: { bagCount: r.bags ?? undefined, bagWeightKg: r.bagWeightKg ?? undefined, dryingMoisturePct: r.moisturePct ?? undefined, warehouseReceivedAt: r.receivedAt },
        });
      }
      return { receipt: r, batch, acceptedKg };
    });
    if (result.receipt.rejectedKg > 0) {
      await this.notify.tellPermission('ops_stock', 'EDIT', result.receipt.mamcosId, { type: 'OPS_RECEIPT_REJECTED', title: 'Rice rejected at receiving', body: `${result.receipt.reference}: ${result.receipt.rejectedKg} kg rejected.`, data: { receiptId: id } });
    }
    return this.detail(id, actor);
  }

  async cancel(id: string, reason: string, actor: User) {
    if (!reason.trim()) throw new BadRequestException('Give the reason for cancelling');
    const r = await this.prisma.goodsReceipt.findUnique({ where: { id } });
    assertVisible(actor, r, 'Receipt');
    const claimed = await this.prisma.goodsReceipt.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
    if (!claimed.count) throw new ConflictException('A confirmed receipt cannot be cancelled. Use a stock adjustment, which keeps the history.');
    return this.detail(id, actor);
  }
}
