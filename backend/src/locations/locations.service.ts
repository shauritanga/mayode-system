import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllRegions() {
    return this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { districts: true } },
      },
    });
  }

  async findDistrictsByRegion(regionId: string) {
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
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
    const district = await this.prisma.district.findUnique({ where: { id: districtId } });
    if (!district) {
      throw new NotFoundException(`District with ID ${districtId} not found`);
    }

    return this.prisma.ward.findMany({
      where: { districtId },
      orderBy: { name: 'asc' },
    });
  }
}
