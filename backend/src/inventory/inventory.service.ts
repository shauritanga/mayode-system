import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInventoryRecordDto,
  UpdateInventoryStatusDto,
  CreateLotDto,
  FarmerReportDeliveryDto,
} from './dto/inventory.dto';
import { RiceProtocolsService } from '../rice-protocols/rice-protocols.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { ActivitiesService } from '../activities/activities.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riceProtocols: RiceProtocolsService,
    private readonly ownership: OwnershipService,
    private readonly activities: ActivitiesService,
  ) {}

  /**
   * Helper to generate unique Inventory Tracking Code (INV-YYYY-XXXX)
   */
  private async generateTrackingCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}`;

    const lastRecord = await this.prisma.inventoryRecord.findFirst({
      where: { trackingCode: { startsWith: prefix } },
      orderBy: { trackingCode: 'desc' },
    });

    if (!lastRecord) {
      return `${prefix}-0001`;
    }

    const lastNumber = parseInt(
      lastRecord.trackingCode.replace(`${prefix}-`, ''),
      10,
    );
    const nextNumber = lastNumber + 1;
    const padded = nextNumber.toString().padStart(4, '0');
    return `${prefix}-${padded}`;
  }

  private async farmerIdForUser(user: RequestUser): Promise<string> {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!farmer) {
      throw new ForbiddenException('No farmer profile is linked to this account.');
    }
    return farmer.id;
  }

  async receiveInventory(createInventoryRecordDto: CreateInventoryRecordDto) {
    const {
      farmId,
      farmerId,
      cropCycleId,
      weightKg,
      qualityGrade,
      moistureContentPct,
      warehouseLocation,
      receivedDate,
    } = createInventoryRecordDto;

    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true, mamcosId: true, farmCode: true },
    });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
    });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }
    const protocolEnabled =
      farm.mamcosId &&
      (await this.prisma.riceProtocol.findFirst({
        where: { mamcosId: farm.mamcosId, isActive: true },
        select: { id: true },
      }));
    if (protocolEnabled && !cropCycleId) {
      throw new BadRequestException({
        code: 'MBALARI_QUALITY_GATE',
        missing: ['crop_cycle'],
      });
    }
    if (cropCycleId) {
      const cycle = await this.prisma.cropCycle.findFirst({
        where: { id: cropCycleId, farmId, farmerId },
        select: { id: true },
      });
      if (!cycle)
        throw new BadRequestException(
          'The crop cycle must belong to the supplied farm and farmer',
        );
      await this.riceProtocols.recordWarehouseReceipt(
        cropCycleId,
        warehouseLocation ?? 'Mbalari cooperative warehouse',
        new Date(receivedDate),
      );
    }

    const trackingCode = await this.generateTrackingCode();

    const record = await this.prisma.inventoryRecord.create({
      data: {
        farmId,
        farmerId,
        cropCycleId,
        weightKg,
        qualityGrade,
        moistureContentPct,
        trackingCode,
        warehouseLocation,
        receivedDate: new Date(receivedDate),
        status: 'RECEIVED',
      },
      include: {
        farm: { select: { farmCode: true, isVerified: true } },
        farmer: {
          select: { controlNumber: true, firstName: true, lastName: true },
        },
      },
    });

    await this.activities.log(
      farmerId,
      'inventory.received',
      'Harvest received at warehouse',
      `${weightKg} kg · ${trackingCode}${farm.farmCode ? ` · ${farm.farmCode}` : ''}`,
      '📦',
    );

    return record;
  }

  /** Farmer reports a delivery for a crop cycle they operate. */
  async reportMyDelivery(user: RequestUser, dto: FarmerReportDeliveryDto) {
    if (user.role !== UserRole.FARMER) {
      throw new ForbiddenException('Only farmers can self-report warehouse deliveries.');
    }
    const farmerId = await this.farmerIdForUser(user);
    const cycle = await this.prisma.cropCycle.findUnique({
      where: { id: dto.cropCycleId },
      include: {
        farm: { select: { id: true, farmCode: true, mamcosId: true } },
      },
    });
    if (!cycle) {
      throw new NotFoundException(`Crop cycle with ID ${dto.cropCycleId} not found`);
    }
    await this.ownership.assertFarmAccess(user, cycle.farmId);
    if (cycle.farmerId !== farmerId) {
      throw new ForbiddenException(
        'You can only report deliveries for crop cycles assigned to you.',
      );
    }

    return this.receiveInventory({
      farmId: cycle.farmId,
      farmerId,
      cropCycleId: cycle.id,
      weightKg: dto.weightKg,
      qualityGrade: dto.qualityGrade,
      moistureContentPct: dto.moistureContentPct,
      warehouseLocation:
        dto.warehouseLocation ||
        'Farmer-reported delivery (confirm at AMCOS weighbridge)',
      receivedDate: dto.receivedDate || new Date().toISOString(),
    });
  }

  async findMyRecords(user: RequestUser, cropCycleId?: string) {
    const farmerId = await this.farmerIdForUser(user);
    return this.prisma.inventoryRecord.findMany({
      where: {
        farmerId,
        ...(cropCycleId ? { cropCycleId } : {}),
      },
      include: {
        farm: { select: { id: true, farmCode: true } },
        cropCycle: { select: { id: true, season: true, riceVariety: true, status: true } },
        lot: { select: { id: true, lotNumber: true } },
      },
      orderBy: { receivedDate: 'desc' },
      take: 100,
    });
  }

  async mySummary(user: RequestUser) {
    const farmerId = await this.farmerIdForUser(user);
    const records = await this.prisma.inventoryRecord.findMany({
      where: { farmerId },
      select: {
        weightKg: true,
        status: true,
        lotNumber: true,
        qualityGrade: true,
      },
    });
    const totalKg = records.reduce((sum, r) => sum + r.weightKg, 0);
    const byStatus: Record<string, { count: number; weightKg: number }> = {};
    for (const r of records) {
      const row = byStatus[r.status] ?? { count: 0, weightKg: 0 };
      row.count += 1;
      row.weightKg += r.weightKg;
      byStatus[r.status] = row;
    }
    const inWarehouseKg = records
      .filter((r) => r.status === 'RECEIVED' || r.status === 'IN_STORAGE')
      .reduce((sum, r) => sum + r.weightKg, 0);
    const batchedKg = records
      .filter((r) => r.status === 'BATCHED' || r.status === 'SHIPPED' || r.status === 'SOLD')
      .reduce((sum, r) => sum + r.weightKg, 0);
    return {
      recordCount: records.length,
      totalKg,
      inWarehouseKg,
      batchedOrSoldKg: batchedKg,
      byStatus,
    };
  }

  async findAllRecords() {
    return this.prisma.inventoryRecord.findMany({
      include: {
        farm: { select: { farmCode: true } },
        farmer: {
          select: { controlNumber: true, firstName: true, lastName: true },
        },
      },
      orderBy: { receivedDate: 'desc' },
    });
  }

  async findRecordById(id: string) {
    const record = await this.prisma.inventoryRecord.findUnique({
      where: { id },
      include: {
        farm: true,
        farmer: true,
        lot: true,
      },
    });

    if (!record) {
      throw new NotFoundException(`Inventory record with ID ${id} not found`);
    }

    return record;
  }

  async updateStatus(
    id: string,
    updateInventoryStatusDto: UpdateInventoryStatusDto,
  ) {
    await this.findRecordById(id); // Verify existence

    return this.prisma.inventoryRecord.update({
      where: { id },
      data: updateInventoryStatusDto,
    });
  }

  async createLot(createLotDto: CreateLotDto) {
    const { lotNumber, riceVariety, inventoryRecordIds } = createLotDto;

    const existingLot = await this.prisma.lot.findUnique({
      where: { lotNumber },
    });

    if (existingLot) {
      throw new ConflictException(
        `Lot with lot number ${lotNumber} already exists`,
      );
    }

    // Verify all inventory records exist and are not already in a lot
    const records = await this.prisma.inventoryRecord.findMany({
      where: { id: { in: inventoryRecordIds } },
    });

    if (records.length !== inventoryRecordIds.length) {
      throw new BadRequestException(
        'One or more inventory record IDs provided are invalid or not found',
      );
    }

    let totalWeightKg = 0;
    for (const rec of records) {
      if (rec.lotNumber) {
        throw new ConflictException(
          `Inventory record with tracking code ${rec.trackingCode} is already assigned to Lot ${rec.lotNumber}`,
        );
      }
      totalWeightKg += rec.weightKg;
    }

    // Perform transaction to create Lot and assign to all records
    return this.prisma.$transaction(async (prisma) => {
      const lot = await prisma.lot.create({
        data: {
          lotNumber,
          riceVariety,
          totalWeightKg,
        },
      });

      await prisma.inventoryRecord.updateMany({
        where: { id: { in: inventoryRecordIds } },
        data: {
          lotNumber,
          status: 'BATCHED',
        },
      });

      return prisma.lot.findUnique({
        where: { id: lot.id },
        include: {
          inventoryRecords: {
            include: {
              farm: { select: { farmCode: true, isVerified: true } },
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
      });
    });
  }

  /** Warehouse dashboard: totals by grade, warehouse, status and variety (via Lot). */
  async dashboardSummary() {
    const [byGrade, byWarehouse, byStatus, byVariety, totals, soldTotal] =
      await Promise.all([
        this.prisma.inventoryRecord.groupBy({
          by: ['qualityGrade'],
          _sum: { weightKg: true },
          _count: { _all: true },
        }),
        this.prisma.inventoryRecord.groupBy({
          by: ['warehouseLocation'],
          _sum: { weightKg: true },
          _count: { _all: true },
        }),
        this.prisma.inventoryRecord.groupBy({
          by: ['status'],
          _sum: { weightKg: true },
          _count: { _all: true },
        }),
        this.prisma.lot.groupBy({
          by: ['riceVariety'],
          _sum: { totalWeightKg: true },
          _count: { _all: true },
        }),
        this.prisma.inventoryRecord.aggregate({
          _sum: { weightKg: true },
          _count: { _all: true },
        }),
        this.prisma.inventoryRecord.aggregate({
          where: { status: 'SOLD' },
          _sum: { weightKg: true },
        }),
      ]);

    const totalReceivedKg = totals._sum.weightKg ?? 0;
    const soldKg = soldTotal._sum.weightKg ?? 0;
    const inStockKg = byStatus
      .filter(
        (row) =>
          row.status === 'RECEIVED' ||
          row.status === 'IN_STORAGE' ||
          row.status === 'BATCHED',
      )
      .reduce((sum, row) => sum + (row._sum.weightKg ?? 0), 0);

    return {
      totalReceivedKg,
      totalReceivedCount: totals._count._all,
      inStockKg,
      soldKg,
      currentBalanceKg: totalReceivedKg - soldKg,
      byGrade: byGrade.map((row) => ({
        grade: row.qualityGrade ?? 'Ungraded',
        weightKg: row._sum.weightKg ?? 0,
        count: row._count._all,
      })),
      byWarehouse: byWarehouse.map((row) => ({
        warehouseLocation: row.warehouseLocation ?? 'Unassigned',
        weightKg: row._sum.weightKg ?? 0,
        count: row._count._all,
      })),
      byStatus: byStatus.map((row) => ({
        status: row.status,
        weightKg: row._sum.weightKg ?? 0,
        count: row._count._all,
      })),
      byVariety: byVariety.map((row) => ({
        riceVariety: row.riceVariety ?? 'Unspecified',
        weightKg: row._sum.totalWeightKg ?? 0,
        count: row._count._all,
      })),
    };
  }

  async findAllLots() {
    return this.prisma.lot.findMany({
      include: {
        _count: { select: { inventoryRecords: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findLotByNumber(lotNumber: string) {
    const lot = await this.prisma.lot.findUnique({
      where: { lotNumber },
      include: {
        inventoryRecords: {
          include: {
            farm: { select: { farmCode: true, isVerified: true } },
            farmer: {
              select: { controlNumber: true, firstName: true, lastName: true },
            },
          },
        },
        sales: true,
      },
    });

    if (!lot) {
      throw new NotFoundException(`Lot with number ${lotNumber} not found`);
    }

    return lot;
  }
}
