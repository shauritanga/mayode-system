import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryRecordDto, UpdateInventoryStatusDto, CreateLotDto } from './dto/inventory.dto';
import { RiceProtocolsService } from '../rice-protocols/rice-protocols.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly riceProtocols: RiceProtocolsService) {}

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

    const lastNumber = parseInt(lastRecord.trackingCode.replace(`${prefix}-`, ''), 10);
    const nextNumber = lastNumber + 1;
    const padded = nextNumber.toString().padStart(4, '0');
    return `${prefix}-${padded}`;
  }

  async receiveInventory(createInventoryRecordDto: CreateInventoryRecordDto) {
    const { farmId, farmerId, cropCycleId, weightKg, qualityGrade, warehouseLocation, receivedDate } = createInventoryRecordDto;

    const farm = await this.prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, mamcosId: true } });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }
    const protocolEnabled = farm.mamcosId && await this.prisma.riceProtocol.findFirst({ where: { mamcosId: farm.mamcosId, isActive: true }, select: { id: true } });
    if (protocolEnabled && !cropCycleId) {
      throw new BadRequestException({ code: 'MBALARI_QUALITY_GATE', missing: ['crop_cycle'] });
    }
    if (cropCycleId) {
      const cycle = await this.prisma.cropCycle.findFirst({ where: { id: cropCycleId, farmId, farmerId }, select: { id: true } });
      if (!cycle) throw new BadRequestException('The crop cycle must belong to the supplied farm and farmer');
      await this.riceProtocols.recordWarehouseReceipt(cropCycleId, warehouseLocation ?? 'Mbalari cooperative warehouse', new Date(receivedDate));
    }

    const trackingCode = await this.generateTrackingCode();

    return this.prisma.inventoryRecord.create({
      data: {
        farmId,
        farmerId,
        cropCycleId,
        weightKg,
        qualityGrade,
        trackingCode,
        warehouseLocation,
        receivedDate: new Date(receivedDate),
        status: 'RECEIVED',
      },
      include: {
        farm: { select: { farmCode: true, isVerified: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAllRecords() {
    return this.prisma.inventoryRecord.findMany({
      include: {
        farm: { select: { farmCode: true } },
        farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
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

  async updateStatus(id: string, updateInventoryStatusDto: UpdateInventoryStatusDto) {
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
      throw new ConflictException(`Lot with lot number ${lotNumber} already exists`);
    }

    // Verify all inventory records exist and are not already in a lot
    const records = await this.prisma.inventoryRecord.findMany({
      where: { id: { in: inventoryRecordIds } },
    });

    if (records.length !== inventoryRecordIds.length) {
      throw new BadRequestException('One or more inventory record IDs provided are invalid or not found');
    }

    let totalWeightKg = 0;
    for (const rec of records) {
      if (rec.lotNumber) {
        throw new ConflictException(`Inventory record with tracking code ${rec.trackingCode} is already assigned to Lot ${rec.lotNumber}`);
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
              farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
            },
          },
        },
      });
    });
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
            farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
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
