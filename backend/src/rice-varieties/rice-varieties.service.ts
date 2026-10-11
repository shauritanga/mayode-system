import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRiceVarietyDto,
  UpdateRiceVarietyDto,
} from './dto/rice-variety.dto';

@Injectable()
export class RiceVarietiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** What a farmer can choose when starting a crop cycle. Staff may also list the hidden ones. */
  async list(includeInactive = false) {
    const varieties = await this.prisma.riceVariety.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        protocols: {
          where: { mamcosId: null, isActive: true },
          select: { id: true, version: true },
        },
        _count: { select: { cropCycles: true } },
      },
    });
    return varieties.map(({ protocols, _count, ...v }) => ({
      ...v,
      /** Whether this variety has its own calendar; without one, farmers get the default calendar. */
      hasCalendar: protocols.length > 0,
      calendarVersion: protocols[0]?.version ?? null,
      cropCycleCount: _count.cropCycles,
    }));
  }

  /** An active variety by id, for crop cycles. */
  async requireActive(id: string) {
    const variety = await this.prisma.riceVariety.findUnique({ where: { id } });
    if (!variety || !variety.isActive) {
      throw new NotFoundException('That rice variety is not available');
    }
    return variety;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.riceVariety.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException(
        'A rice variety with this name already exists',
      );
  }

  async create(dto: CreateRiceVarietyDto) {
    const name = dto.name.trim();
    await this.assertNameFree(name);
    return this.prisma.riceVariety.create({
      data: {
        name,
        code: dto.code?.trim() || null,
        maturityDays: dto.maturityDays,
        description: dto.description?.trim() || null,
      },
    });
  }

  async update(id: string, dto: UpdateRiceVarietyDto) {
    const existing = await this.prisma.riceVariety.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Rice variety not found');
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== existing.name.toLowerCase())
      await this.assertNameFree(name, id);
    const updated = await this.prisma.riceVariety.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim() || null } : {}),
        ...(dto.maturityDays !== undefined
          ? { maturityDays: dto.maturityDays }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    // Keep the readable name on existing crop cycles in step with a rename.
    if (name && name !== existing.name) {
      await this.prisma.cropCycle.updateMany({
        where: { riceVarietyId: id },
        data: { riceVariety: name },
      });
    }
    return updated;
  }
}
