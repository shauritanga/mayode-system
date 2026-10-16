import { resolveLotGrade } from '../common/rice-grade';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInventoryRecordDto,
  UpdateInventoryStatusDto,
  CreateLotDto,
  FarmerReportDeliveryDto,
  UpdateInventoryRecordDto,
  RecordFarmerPaymentDto,
  CollectionCentreDto,
} from './dto/inventory.dto';
import { deliveryValue, paymentStatusFor } from './farmer-payment';
import { summariseWarehouse } from './warehouse-summary';
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
      throw new ForbiddenException(
        'No farmer profile is linked to this account.',
      );
    }
    return farmer.id;
  }

  /** Rows of this cooperative only; platform-wide roles (no cooperative) see everything. */
  private tenantFilter(user?: RequestUser): { mamcosId?: string } {
    const tenantId = user ? this.ownership.resolveTenantMamcosId(user) : null;
    return tenantId ? { mamcosId: tenantId } : {};
  }

  private async assertCentre(
    centreId: string | undefined,
    farmMamcosId: string | null,
  ) {
    if (!centreId) return;
    const centre = await this.prisma.collectionCentre.findUnique({
      where: { id: centreId },
      select: { mamcosId: true, isActive: true },
    });
    if (!centre) throw new NotFoundException('Collection centre not found');
    if (centre.mamcosId && farmMamcosId && centre.mamcosId !== farmMamcosId)
      throw new BadRequestException(
        'That collection centre belongs to another cooperative',
      );
  }

  async receiveInventory(
    createInventoryRecordDto: CreateInventoryRecordDto,
    user?: RequestUser,
  ) {
    const {
      farmId,
      farmerId,
      cropCycleId,
      weightKg,
      qualityGrade,
      moistureContentPct,
      warehouseLocation,
      receivedDate,
      collectionCentreId,
      bags,
      pricePerKg,
      batchNumber,
    } = createInventoryRecordDto;
    if (user) await this.ownership.assertFarmAccess(user, farmId);

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
    // The quality gate follows the platform rice calendar (the one farmers' tasks come from).
    const protocolEnabled = await this.prisma.riceProtocol.findFirst({
      where: { mamcosId: null, isActive: true },
      select: { id: true },
    });
    if (protocolEnabled && !cropCycleId) {
      throw new BadRequestException({
        code: 'MBALARI_QUALITY_GATE',
        missing: ['crop_cycle'],
      });
    }
    let cycleVariety: string | undefined;
    if (cropCycleId) {
      const cycle = await this.prisma.cropCycle.findFirst({
        where: { id: cropCycleId, farmId, farmerId },
        select: { id: true, riceVariety: true },
      });
      cycleVariety = cycle?.riceVariety ?? undefined;
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

    await this.assertCentre(collectionCentreId, farm.mamcosId);
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
        mamcosId: farm.mamcosId,
        collectionCentreId,
        riceVariety: createInventoryRecordDto.riceVariety?.trim() || cycleVariety,
        bags,
        pricePerKg,
        totalValue: deliveryValue(weightKg, pricePerKg),
        batchNumber: batchNumber?.trim() || undefined,
      },
      include: {
        farm: { select: { farmCode: true, isVerified: true } },
        collectionCentre: { select: { id: true, name: true } },
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
      {
        weightKg,
        trackingCode,
        farmCode: farm.farmCode ?? null,
      },
    );

    return record;
  }

  /**
   * Report a warehouse delivery for a crop cycle. Farmers self-report their
   * own cycles; grant-holding staff (inventory CREATE) may record on a
   * farmer's behalf — e.g. at the AMCOS weighbridge — attributed to the
   * cycle's farmer. Tenancy still applies via assertFarmAccess either way.
   */
  async reportMyDelivery(user: RequestUser, dto: FarmerReportDeliveryDto) {
    const cycle = await this.prisma.cropCycle.findUnique({
      where: { id: dto.cropCycleId },
      include: {
        farm: { select: { id: true, farmCode: true, mamcosId: true } },
      },
    });
    if (!cycle) {
      throw new NotFoundException(
        `Crop cycle with ID ${dto.cropCycleId} not found`,
      );
    }
    await this.ownership.assertFarmAccess(user, cycle.farmId);

    let farmerId: string;
    let warehouseNote: string;
    if (user.role === UserRole.FARMER) {
      farmerId = await this.farmerIdForUser(user);
      if (cycle.farmerId !== farmerId) {
        throw new ForbiddenException(
          'You can only report deliveries for crop cycles assigned to you.',
        );
      }
      warehouseNote = 'Farmer-reported delivery (confirm at AMCOS weighbridge)';
    } else {
      // Staff on-behalf flow: matrix grant required (the route guard checks
      // first; this is defense in depth for direct service use).
      if (!this.ownership.passesMatrix(user, 'inventory', 'CREATE')) {
        throw new ForbiddenException('Missing permission: CREATE on inventory');
      }
      if (!cycle.farmerId) {
        throw new ForbiddenException(
          'This crop cycle has no farmer assigned; only the assigned farmer can report it.',
        );
      }
      farmerId = cycle.farmerId;
      warehouseNote = 'Staff-recorded delivery (confirm at AMCOS weighbridge)';
    }

    return this.receiveInventory({
      farmId: cycle.farmId,
      farmerId,
      cropCycleId: cycle.id,
      weightKg: dto.weightKg,
      qualityGrade: dto.qualityGrade,
      moistureContentPct: dto.moistureContentPct,
      warehouseLocation: dto.warehouseLocation || warehouseNote,
      receivedDate: dto.receivedDate || new Date().toISOString(),
      collectionCentreId: dto.collectionCentreId,
      riceVariety: dto.riceVariety,
      bags: dto.bags,
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
        cropCycle: {
          select: { id: true, season: true, riceVariety: true, status: true },
        },
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
      .filter(
        (r) =>
          r.status === 'BATCHED' ||
          r.status === 'SHIPPED' ||
          r.status === 'SOLD',
      )
      .reduce((sum, r) => sum + r.weightKg, 0);
    return {
      recordCount: records.length,
      totalKg,
      inWarehouseKg,
      batchedOrSoldKg: batchedKg,
      byStatus,
    };
  }

  private readonly recordInclude = {
    warehouse: { select: { id: true, name: true } },
    collectionCentre: { select: { id: true, name: true } },
    farm: { select: { id: true, farmCode: true } },
    farmer: {
      select: {
        id: true,
        controlNumber: true,
        firstName: true,
        lastName: true,
      },
    },
    lot: {
      select: {
        lotNumber: true,
        riceVariety: true,
        grade: true,
        sales: {
          select: {
            id: true,
            invoiceNumber: true,
            paymentReceived: true,
            buyer: { select: { id: true, name: true } },
          },
        },
        saleOrders: {
          select: {
            id: true,
            reference: true,
            status: true,
            buyer: { select: { id: true, name: true } },
          },
        },
      },
    },
  } satisfies Prisma.InventoryRecordInclude;

  async findAllRecords(user?: RequestUser) {
    return this.prisma.inventoryRecord.findMany({
      where: this.tenantFilter(user),
      include: this.recordInclude,
      orderBy: { receivedDate: 'desc' },
    });
  }

  async findRecordById(id: string, user?: RequestUser) {
    const record = await this.prisma.inventoryRecord.findUnique({
      where: { id },
      include: {
        ...this.recordInclude,
        farm: true,
        farmer: true,
        cropCycle: { select: { id: true, season: true, riceVariety: true } },
      },
    });
    const tenant = this.tenantFilter(user).mamcosId;
    if (!record || (tenant && record.mamcosId !== tenant)) {
      throw new NotFoundException(`Inventory record with ID ${id} not found`);
    }
    return record;
  }

  async updateStatus(
    id: string,
    updateInventoryStatusDto: UpdateInventoryStatusDto,
    user?: RequestUser,
  ) {
    await this.findRecordById(id, user); // Verify existence and scope

    return this.prisma.inventoryRecord.update({
      where: { id },
      data: updateInventoryStatusDto,
    });
  }

  /** Complete or correct a delivery after weighing and grading; the value and payment status follow. */
  async updateRecord(
    id: string,
    dto: UpdateInventoryRecordDto,
    user?: RequestUser,
  ) {
    const record = await this.findRecordById(id, user);
    if (dto.weightKg != null && record.lotNumber)
      throw new BadRequestException(
        'The weight cannot change once the delivery is in a lot',
      );
    await this.assertCentre(dto.collectionCentreId, record.mamcosId);
    const weightKg = dto.weightKg ?? record.weightKg;
    const pricePerKg = dto.pricePerKg ?? record.pricePerKg;
    const totalValue = deliveryValue(weightKg, pricePerKg);
    return this.prisma.inventoryRecord.update({
      where: { id },
      data: {
        ...dto,
        riceVariety: dto.riceVariety?.trim() || undefined,
        batchNumber: dto.batchNumber?.trim() || undefined,
        totalValue,
        farmerPaymentStatus: paymentStatusFor(totalValue, record.amountPaid),
      },
      include: this.recordInclude,
    });
  }

  /** Record money paid to the farmer; the status moves from unpaid to partial to paid. */
  async recordFarmerPayment(
    id: string,
    dto: RecordFarmerPaymentDto,
    user?: RequestUser,
  ) {
    const record = await this.findRecordById(id, user);
    if (record.totalValue == null)
      throw new BadRequestException(
        'Set the purchase price before recording a payment',
      );
    const amountPaid = record.amountPaid + dto.amount;
    if (amountPaid > record.totalValue + 0.005)
      throw new BadRequestException(
        'That payment is more than the amount still owed to the farmer',
      );
    const status = paymentStatusFor(record.totalValue, amountPaid);
    return this.prisma.inventoryRecord.update({
      where: { id },
      data: {
        amountPaid,
        farmerPaymentStatus: status,
        paidAt: status === 'PAID' ? new Date() : null,
      },
      include: this.recordInclude,
    });
  }

  // ------------------------------------------------------ collection centres

  listCentres(user: RequestUser) {
    return this.prisma.collectionCentre.findMany({
      where: this.tenantFilter(user),
      include: {
        warehouse: { select: { id: true, name: true } },
        mamcos: { select: { name: true } },
        _count: { select: { inventoryRecords: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  private async centreOrThrow(id: string, user: RequestUser) {
    const tenant = this.tenantFilter(user).mamcosId;
    const centre = await this.prisma.collectionCentre.findUnique({
      where: { id },
    });
    if (!centre || (tenant && centre.mamcosId !== tenant))
      throw new NotFoundException('Collection centre not found');
    return centre;
  }

  async createCentre(dto: CollectionCentreDto, user: RequestUser) {
    const tenant = this.tenantFilter(user).mamcosId ?? null;
    return this.prisma.collectionCentre.create({
      data: { ...dto, mamcosId: tenant ?? dto.mamcosId ?? null },
    });
  }

  async updateCentre(
    id: string,
    dto: Partial<CollectionCentreDto>,
    user: RequestUser,
  ) {
    await this.centreOrThrow(id, user);
    const { mamcosId: _ignored, ...data } = dto;
    return this.prisma.collectionCentre.update({ where: { id }, data });
  }

  async createLot(createLotDto: CreateLotDto, user?: RequestUser) {
    const { lotNumber, riceVariety, inventoryRecordIds } = createLotDto;

    const existingLot = await this.prisma.lot.findUnique({
      where: { lotNumber },
    });

    if (existingLot) {
      throw new ConflictException(
        `Lot with lot number ${lotNumber} already exists`,
      );
    }

    // Verify all inventory records exist (in the user's cooperative) and are not already in a lot
    const records = await this.prisma.inventoryRecord.findMany({
      where: { id: { in: inventoryRecordIds }, ...this.tenantFilter(user) },
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

    // A lot holds one grade, so buyers get exactly the rice their order names.
    const grade = resolveLotGrade(
      records.map((r) => r.qualityGrade),
      createLotDto.grade,
    );

    // A lot is sold from one warehouse, so records received into different warehouses cannot be mixed.
    const warehouseIds = [...new Set(records.map((r) => r.warehouseId))];
    if (warehouseIds.length > 1) {
      throw new BadRequestException(
        'These records are in different warehouses (or only some are received). Batch records from one warehouse at a time.',
      );
    }

    // Perform transaction to create Lot and assign to all records
    return this.prisma.$transaction(async (prisma) => {
      const lot = await prisma.lot.create({
        data: {
          lotNumber,
          riceVariety,
          grade,
          totalWeightKg,
          warehouseId: warehouseIds[0] ?? null,
        },
      });

      await prisma.inventoryRecord.updateMany({
        where: { id: { in: inventoryRecordIds } },
        data: {
          lotNumber,
          status: 'BATCHED',
        },
      });
      await prisma.inventoryRecord.updateMany({
        where: { id: { in: inventoryRecordIds }, riceVariety: null },
        data: { riceVariety },
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

  /** Warehouse dashboard: stock, value and payments, by grade, variety, warehouse, centre and status. */
  async dashboardSummary(
    user?: RequestUser,
    filter: { from?: string; to?: string; warehouseId?: string } = {},
  ) {
    const records = await this.prisma.inventoryRecord.findMany({
      where: {
        ...this.tenantFilter(user),
        warehouseId: filter.warehouseId,
        receivedDate: {
          gte: filter.from ? new Date(filter.from) : undefined,
          lte: filter.to ? new Date(filter.to) : undefined,
        },
      },
      select: {
        weightKg: true,
        bags: true,
        status: true,
        qualityGrade: true,
        riceVariety: true,
        warehouseLocation: true,
        totalValue: true,
        amountPaid: true,
        farmerPaymentStatus: true,
        warehouse: { select: { name: true } },
        collectionCentre: { select: { name: true } },
        lot: { select: { riceVariety: true } },
      },
    });
    return summariseWarehouse(
      records.map((r) => ({
        weightKg: r.weightKg,
        bags: r.bags,
        status: r.status,
        qualityGrade: r.qualityGrade,
        riceVariety: r.riceVariety,
        lotVariety: r.lot?.riceVariety ?? null,
        warehouseName: r.warehouse?.name ?? null,
        warehouseLocation: r.warehouseLocation,
        centreName: r.collectionCentre?.name ?? null,
        totalValue: r.totalValue,
        amountPaid: r.amountPaid,
        farmerPaymentStatus: r.farmerPaymentStatus,
      })),
    );
  }

  async findAllLots(user?: RequestUser) {
    const tenant = this.tenantFilter(user).mamcosId;
    return this.prisma.lot.findMany({
      where: tenant ? { inventoryRecords: { some: { mamcosId: tenant } } } : undefined,
      include: {
        _count: { select: { inventoryRecords: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findLotByNumber(lotNumber: string, user?: RequestUser) {
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

    const tenant = this.tenantFilter(user).mamcosId;
    if (
      !lot ||
      (tenant && !lot.inventoryRecords.some((r) => r.mamcosId === tenant))
    ) {
      throw new NotFoundException(`Lot with number ${lotNumber} not found`);
    }

    return lot;
  }
}
