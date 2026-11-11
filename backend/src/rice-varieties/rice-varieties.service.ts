import {
  ConflictException,
  ForbiddenException,
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

  /**
   * The rice types a person can choose: the platform-wide ones plus those their own cooperative added in its settings.
   * `tenant` undefined = no limit (Super Admin sees every cooperative's); null = platform-wide only.
   */
  async list(includeInactive = false, tenant?: string | null) {
    const varieties = await this.prisma.riceVariety.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(tenant === undefined ? {} : { OR: [{ mamcosId: null }, ...(tenant ? [{ mamcosId: tenant }] : [])] }),
      },
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

  /** A name must be free among what the owner can see: the platform-wide types and its own. */
  private async assertNameFree(name: string, mamcosId: string | null, exceptId?: string) {
    const clash = await this.prisma.riceVariety.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        OR: [{ mamcosId: null }, ...(mamcosId ? [{ mamcosId }] : [])],
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException(
        'A rice variety with this name already exists',
      );
  }

  async create(dto: CreateRiceVarietyDto, mamcosId: string | null = null) {
    const name = dto.name.trim();
    await this.assertNameFree(name, mamcosId);
    return this.prisma.riceVariety.create({
      data: {
        mamcosId,
        name,
        code: dto.code?.trim() || null,
        maturityDays: dto.maturityDays,
        description: dto.description?.trim() || null,
      },
    });
  }

  /** `tenant`: the caller's cooperative; undefined = Super Admin (may change any). A cooperative changes only its own types. */
  async update(id: string, dto: UpdateRiceVarietyDto, tenant?: string | null) {
    const existing = await this.prisma.riceVariety.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Rice variety not found');
    if (tenant !== undefined && existing.mamcosId !== tenant) {
      if (!existing.mamcosId) throw new ForbiddenException('This rice type is set by the platform; ask the platform administrator to change it');
      throw new NotFoundException('Rice variety not found');
    }
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== existing.name.toLowerCase())
      await this.assertNameFree(name, existing.mamcosId, id);
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
