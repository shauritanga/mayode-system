import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateAggregationCentreDto,
  UpdateIrrigationSchemeDto,
  UpsertAggregationCentreDto,
  UpsertIrrigationSchemeDto,
} from './dto/facility.dto';

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  createIrrigationScheme(dto: UpsertIrrigationSchemeDto) {
    return this.prisma.irrigationScheme.create({ data: dto });
  }

  findIrrigationSchemes(mamcosId?: string) {
    return this.prisma.irrigationScheme.findMany({
      where: mamcosId ? { mamcosId } : undefined,
      include: { mamcos: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async updateIrrigationScheme(id: string, dto: UpdateIrrigationSchemeDto) {
    const existing = await this.prisma.irrigationScheme.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Irrigation scheme with ID ${id} not found`);
    return this.prisma.irrigationScheme.update({ where: { id }, data: dto });
  }

  async removeIrrigationScheme(id: string) {
    const existing = await this.prisma.irrigationScheme.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Irrigation scheme with ID ${id} not found`);
    await this.prisma.irrigationScheme.delete({ where: { id } });
    return { deleted: true };
  }

  createAggregationCentre(dto: UpsertAggregationCentreDto) {
    return this.prisma.aggregationCentre.create({ data: dto });
  }

  findAggregationCentres(mamcosId?: string) {
    return this.prisma.aggregationCentre.findMany({
      where: mamcosId ? { mamcosId } : undefined,
      include: { mamcos: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async updateAggregationCentre(id: string, dto: UpdateAggregationCentreDto) {
    const existing = await this.prisma.aggregationCentre.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Aggregation centre with ID ${id} not found`);
    return this.prisma.aggregationCentre.update({ where: { id }, data: dto });
  }

  async removeAggregationCentre(id: string) {
    const existing = await this.prisma.aggregationCentre.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Aggregation centre with ID ${id} not found`);
    await this.prisma.aggregationCentre.delete({ where: { id } });
    return { deleted: true };
  }
}
