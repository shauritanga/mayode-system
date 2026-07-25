import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { CreatePlotDto, UpdatePlotDto, UpdatePlotBoundaryDto } from './dto/plots.dto';

@Injectable()
export class PlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  /** Generate a unique plot code derived from the parent farm, e.g. FP-JD-01-P1 */
  private async generatePlotCode(farmId: string): Promise<string> {
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { farmCode: true },
    });
    if (!farm) throw new NotFoundException(`Farm with ID ${farmId} not found`);
    const count = await this.prisma.plot.count({ where: { farmId } });
    return `${farm.farmCode}-P${count + 1}`;
  }

  async create(dto: CreatePlotDto, user: RequestUser) {
    await this.ownership.assertFarmAccess(user, dto.farmId);
    const plotCode = await this.generatePlotCode(dto.farmId);
    return this.prisma.plot.create({
      data: {
        farmId: dto.farmId,
        plotCode,
        name: dto.name,
        sizeAcres: dto.sizeAcres,
        soilCondition: dto.soilCondition,
        irrigationStatus: dto.irrigationStatus,
      },
    });
  }

  findAll(farmId?: string) {
    return this.prisma.plot.findMany({
      where: farmId ? { farmId } : undefined,
      include: {
        farm: { select: { farmCode: true, name: true } },
        _count: { select: { cropCycles: true } },
      },
      orderBy: { plotCode: 'asc' },
    });
  }

  findByFarmId(farmId: string) {
    return this.prisma.plot.findMany({
      where: { farmId },
      include: { _count: { select: { cropCycles: true } } },
      orderBy: { plotCode: 'asc' },
    });
  }

  async findOne(id: string) {
    const plot = await this.prisma.plot.findUnique({
      where: { id },
      include: {
        farm: {
          select: {
            farmCode: true,
            name: true,
            farmerId: true,
            farmer: { select: { controlNumber: true, firstName: true, lastName: true } },
          },
        },
        cropCycles: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!plot) throw new NotFoundException(`Plot with ID ${id} not found`);
    return plot;
  }

  async update(id: string, dto: UpdatePlotDto, user: RequestUser) {
    await this.ownership.assertPlotAccess(user, id);
    await this.findOne(id);
    return this.prisma.plot.update({ where: { id }, data: dto });
  }

  async updateBoundary(id: string, dto: UpdatePlotBoundaryDto, user: RequestUser) {
    await this.ownership.assertPlotAccess(user, id);
    await this.findOne(id);
    return this.prisma.plot.update({
      where: { id },
      data: {
        boundaryCoordinates: dto.boundaryCoordinates,
        centerLatitude: dto.centerLat,
        centerLongitude: dto.centerLng,
      },
    });
  }

  async remove(id: string, user: RequestUser) {
    await this.ownership.assertPlotAccess(user, id);
    await this.findOne(id);
    return this.prisma.plot.delete({ where: { id } });
  }
}
