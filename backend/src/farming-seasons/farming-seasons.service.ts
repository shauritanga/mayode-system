import { Injectable, NotFoundException } from '@nestjs/common';
import { FarmingSeasonStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFarmingSeasonDto,
  UpdateFarmingSeasonDto,
} from './dto/farming-seasons.dto';

@Injectable()
export class FarmingSeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  private toData(dto: CreateFarmingSeasonDto | UpdateFarmingSeasonDto) {
    const data: Prisma.FarmingSeasonUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.mamcosId !== undefined) data.mamcosId = dto.mamcosId;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.crop !== undefined) data.crop = dto.crop;
    if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);
    if (dto.registrationOpenDate !== undefined)
      data.registrationOpenDate = new Date(dto.registrationOpenDate);
    if (dto.registrationCloseDate !== undefined)
      data.registrationCloseDate = new Date(dto.registrationCloseDate);
    if (dto.verificationDeadline !== undefined)
      data.verificationDeadline = new Date(dto.verificationDeadline);
    if (dto.status !== undefined) data.status = dto.status;
    return data;
  }

  create(dto: CreateFarmingSeasonDto) {
    // DTO validation guarantees the required fields (name, startDate, endDate).
    return this.prisma.farmingSeason.create({
      data: this.toData(dto) as Prisma.FarmingSeasonUncheckedCreateInput,
    });
  }

  findAll() {
    return this.prisma.farmingSeason.findMany({
      orderBy: { startDate: 'desc' },
      include: { mamcos: { select: { id: true, name: true } } },
    });
  }

  /**
   * The season memberships/leases should attach to right now: the most recent
   * season that is open for registration, in verification, active or harvesting.
   */
  findCurrent() {
    return this.prisma.farmingSeason.findFirst({
      where: {
        status: {
          in: [
            FarmingSeasonStatus.REGISTRATION_OPEN,
            FarmingSeasonStatus.VERIFICATION_IN_PROGRESS,
            FarmingSeasonStatus.ACTIVE,
            FarmingSeasonStatus.HARVESTING,
          ],
        },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const season = await this.prisma.farmingSeason.findUnique({
      where: { id },
      include: { mamcos: { select: { id: true, name: true } } },
    });
    if (!season) throw new NotFoundException(`Farming season ${id} not found`);
    return season;
  }

  async update(id: string, dto: UpdateFarmingSeasonDto) {
    await this.findOne(id);
    return this.prisma.farmingSeason.update({
      where: { id },
      data: this.toData(dto),
    });
  }
}
