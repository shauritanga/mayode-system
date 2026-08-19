import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDistrictDto,
  CreateRegionDto,
  CreateWardDto,
  UpdateLocationNameDto,
} from './dto/location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  createRegion(dto: CreateRegionDto) {
    return this.prisma.region.create({ data: dto });
  }

  async updateRegion(id: string, dto: UpdateLocationNameDto) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException(`Region with ID ${id} not found`);
    return this.prisma.region.update({ where: { id }, data: dto });
  }

  async deleteRegion(id: string) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException(`Region with ID ${id} not found`);
    await this.prisma.region.delete({ where: { id } });
    return { deleted: true };
  }

  async createDistrict(dto: CreateDistrictDto) {
    const region = await this.prisma.region.findUnique({
      where: { id: dto.regionId },
    });
    if (!region)
      throw new NotFoundException(`Region with ID ${dto.regionId} not found`);
    return this.prisma.district.create({ data: dto });
  }

  async updateDistrict(id: string, dto: UpdateLocationNameDto) {
    const district = await this.prisma.district.findUnique({ where: { id } });
    if (!district)
      throw new NotFoundException(`District with ID ${id} not found`);
    return this.prisma.district.update({ where: { id }, data: dto });
  }

  async deleteDistrict(id: string) {
    const district = await this.prisma.district.findUnique({ where: { id } });
    if (!district)
      throw new NotFoundException(`District with ID ${id} not found`);
    await this.prisma.district.delete({ where: { id } });
    return { deleted: true };
  }

  async createWard(dto: CreateWardDto) {
    const district = await this.prisma.district.findUnique({
      where: { id: dto.districtId },
    });
    if (!district)
      throw new NotFoundException(
        `District with ID ${dto.districtId} not found`,
      );
    return this.prisma.ward.create({ data: dto });
  }

  async updateWard(id: string, dto: UpdateLocationNameDto) {
    const ward = await this.prisma.ward.findUnique({ where: { id } });
    if (!ward) throw new NotFoundException(`Ward with ID ${id} not found`);
    return this.prisma.ward.update({ where: { id }, data: dto });
  }

  async deleteWard(id: string) {
    const ward = await this.prisma.ward.findUnique({ where: { id } });
    if (!ward) throw new NotFoundException(`Ward with ID ${id} not found`);
    await this.prisma.ward.delete({ where: { id } });
    return { deleted: true };
  }

  async findAllRegions() {
    return this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { districts: true } },
      },
    });
  }

  async findDistrictsByRegion(regionId: string) {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
    });
    if (!region) {
      throw new NotFoundException(`Region with ID ${regionId} not found`);
    }

    return this.prisma.district.findMany({
      where: { regionId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { wards: true } },
      },
    });
  }

  async findWardsByDistrict(districtId: string) {
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
    });
    if (!district) {
      throw new NotFoundException(`District with ID ${districtId} not found`);
    }

    return this.prisma.ward.findMany({
      where: { districtId },
      orderBy: { name: 'asc' },
    });
  }
}
