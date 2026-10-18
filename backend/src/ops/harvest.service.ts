import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Actor, assertVisible, nextRef, owner, OpsNotifyService, scope } from './ops-common';
import { harvestPosition } from './ops-rules';
import { CreateHarvestDto, TransportDto } from './dto/farm.dto';

type User = Actor & { id: string };

/** Harvest records say what the field produced. They never add warehouse stock: only a confirmed receipt does. */
@Injectable()
export class HarvestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: OpsNotifyService,
  ) {}

  private withPosition<T extends { actualKg: number; transportedKg: number; receipts: { grossKg: number; rejectedKg: number; status: string }[] }>(h: T) {
    return { ...h, position: harvestPosition(h, h.receipts) };
  }

  async create(dto: CreateHarvestDto, actor: User) {
    const farm = await this.prisma.farm.findUnique({ where: { id: dto.farmId } });
    assertVisible(actor, farm, 'Farm');
    const cycle = await this.prisma.cropCycle.findUnique({ where: { id: dto.cropCycleId } });
    if (!cycle || cycle.farmId !== farm.id) throw new BadRequestException('That crop season is not on this farm');
    if (dto.plotId) {
      const plot = await this.prisma.plot.findUnique({ where: { id: dto.plotId }, select: { farmId: true } });
      if (!plot || plot.farmId !== farm.id) throw new BadRequestException('That plot is not on this farm');
      if (cycle.plotId && cycle.plotId !== dto.plotId) throw new BadRequestException('That crop season is on a different plot');
    }
    const record = await this.prisma.$transaction(async (tx) => {
      const h = await tx.harvestRecord.create({
        data: {
          mamcosId: farm.mamcosId, reference: await nextRef(tx, 'HV'), batchRef: await nextRef(tx, 'HB'), farmId: farm.id, plotId: dto.plotId ?? cycle.plotId, cropCycleId: cycle.id,
          riceVariety: dto.riceVariety ?? cycle.riceVariety, harvestDate: new Date(dto.harvestDate), estimatedKg: dto.estimatedKg ?? cycle.estimatedYieldKg, actualKg: dto.actualKg,
          team: dto.team?.trim() || null, responsibleUserId: dto.responsibleUserId ?? actor.id, qualityNotes: dto.qualityNotes?.trim() || null, destination: dto.destination ?? 'WAREHOUSE', createdByUserId: actor.id,
        },
      });
      const total = await tx.harvestRecord.aggregate({ where: { cropCycleId: cycle.id }, _sum: { actualKg: true } });
      await tx.cropCycle.update({ where: { id: cycle.id }, data: { actualYieldKg: total._sum.actualKg ?? dto.actualKg, harvestDate: new Date(dto.harvestDate) } });
      return h;
    });
    if (record.destination === 'WAREHOUSE') {
      await this.notify.tellPermission('ops_receiving', 'VIEW', record.mamcosId, { type: 'OPS_HARVEST_SUBMITTED', title: 'Harvest recorded', body: `${record.reference} (${record.actualKg} kg) — expect it at the warehouse. Batch ${record.batchRef}.`, data: { harvestId: record.id } });
    }
    return this.detail(record.id, actor);
  }

  /** The load has left the field for the warehouse. This is a claim to check against the receipt, not stock. */
  async declareTransport(id: string, dto: TransportDto, actor: User) {
    const h = await this.prisma.harvestRecord.findUnique({ where: { id } });
    assertVisible(actor, h, 'Harvest');
    if (h.transportedKg + dto.transportedKg > h.actualKg + 0.0005) throw new BadRequestException('You cannot send more than was harvested');
    await this.prisma.harvestRecord.update({ where: { id }, data: { transportedKg: { increment: dto.transportedKg }, transportNote: dto.note?.trim() || h.transportNote } });
    return this.detail(id, actor);
  }

  async close(id: string, actor: User) {
    const h = await this.prisma.harvestRecord.findUnique({ where: { id } });
    assertVisible(actor, h, 'Harvest');
    const claimed = await this.prisma.harvestRecord.updateMany({ where: { id, status: { not: 'CLOSED' } }, data: { status: 'CLOSED' } });
    if (!claimed.count) throw new ConflictException('This harvest record is already closed');
    return this.detail(id, actor);
  }

  async list(actor: Actor, f: { farmId?: string; cropCycleId?: string; from?: string; to?: string } = {}) {
    const to = f.to ? new Date(f.to) : undefined;
    if (to) to.setHours(23, 59, 59, 999);
    const rows = await this.prisma.harvestRecord.findMany({
      where: { ...scope(actor), ...(f.farmId ? { farmId: f.farmId } : {}), ...(f.cropCycleId ? { cropCycleId: f.cropCycleId } : {}), ...(f.from || to ? { harvestDate: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      include: { farm: { select: { farmCode: true, name: true } }, plot: { select: { plotCode: true, name: true } }, cropCycle: { select: { season: true } }, receipts: { select: { grossKg: true, rejectedKg: true, status: true } } },
      orderBy: { harvestDate: 'desc' },
      take: 300,
    });
    return rows.map((h) => this.withPosition(h));
  }

  async detail(id: string, actor: Actor) {
    const h = await this.prisma.harvestRecord.findUnique({
      where: { id },
      include: { farm: { select: { farmCode: true, name: true } }, plot: { select: { plotCode: true, name: true } }, cropCycle: { select: { season: true, riceVariety: true } }, receipts: { select: { id: true, reference: true, grossKg: true, rejectedKg: true, status: true, receivedAt: true } } },
    });
    assertVisible(actor, h, 'Harvest');
    return this.withPosition(h);
  }
}

export { owner };
