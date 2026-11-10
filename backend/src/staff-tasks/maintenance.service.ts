import { BadRequestException, NotFoundException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { CreateScheduleDto, DoneDto, UpdateScheduleDto } from './dto/staff-tasks.dto';
import { day, num, tenantOf, today } from './common';

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Recurring maintenance of the canals, blocks, water gates and equipment: when each job is next due, and the record of every time it was done. */
@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  /** The canals, blocks and equipment a schedule can be about. */
  async structure(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const [canals, blocks, assets] = await Promise.all([
      this.prisma.irrigationCanal.findMany({ where: { scheme: { mamcosId }, archivedAt: null }, orderBy: { canalNumber: 'asc' }, select: { id: true, code: true, name: true } }),
      this.prisma.irrigationBlock.findMany({ where: { canal: { scheme: { mamcosId } }, archivedAt: null }, orderBy: [{ canal: { canalNumber: 'asc' } }, { blockNumber: 'asc' }], select: { id: true, code: true, canalId: true } }),
      this.prisma.asset.findMany({ where: { mamcosId }, select: { id: true, tag: true, name: true }, orderBy: { name: 'asc' }, take: 300 }),
    ]);
    return { canals, blocks, assets };
  }

  async create(actor: RequestUser, dto: CreateScheduleDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    if (dto.target === 'CANAL' && !dto.canalId) throw new BadRequestException('Choose the canal');
    if (dto.target === 'BLOCK' && !dto.blockId) throw new BadRequestException('Choose the block');
    if (dto.target === 'EQUIPMENT' && !dto.assetId) throw new BadRequestException('Choose the equipment');
    if ((dto.target === 'GATE' || dto.target === 'OTHER') && !dto.location?.trim() && !dto.canalId) throw new BadRequestException('Say where it is: choose the canal or describe the place');
    if (dto.canalId && !(await this.prisma.irrigationCanal.findFirst({ where: { id: dto.canalId, scheme: { mamcosId } }, select: { id: true } }))) throw new NotFoundException('Canal not found');
    if (dto.blockId && !(await this.prisma.irrigationBlock.findFirst({ where: { id: dto.blockId, canal: { scheme: { mamcosId } } }, select: { id: true } }))) throw new NotFoundException('Block not found');
    if (dto.assetId && !(await this.prisma.asset.findFirst({ where: { id: dto.assetId, mamcosId }, select: { id: true } }))) throw new NotFoundException('Equipment not found');
    const nextDueOn = dto.nextDueOn ? day(dto.nextDueOn) : today();
    return this.prisma.maintenanceSchedule.create({
      data: { mamcosId, title: dto.title.trim(), target: dto.target, canalId: dto.canalId ?? null, blockId: dto.blockId ?? null, assetId: dto.assetId ?? null, location: dto.location?.trim() || null, intervalDays: dto.intervalDays, nextDueOn, createdById: actor.id },
    });
  }

  async list(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const rows = await this.prisma.maintenanceSchedule.findMany({ where: { mamcosId }, orderBy: [{ isActive: 'desc' }, { nextDueOn: 'asc' }], include: { logs: { orderBy: { doneOn: 'desc' }, take: 3 } } });
    const canals = await this.prisma.irrigationCanal.findMany({ where: { id: { in: rows.flatMap((r) => (r.canalId ? [r.canalId] : [])) } }, select: { id: true, code: true } });
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { id: { in: rows.flatMap((r) => (r.blockId ? [r.blockId] : [])) } }, select: { id: true, code: true } });
    const assets = await this.prisma.asset.findMany({ where: { id: { in: rows.flatMap((r) => (r.assetId ? [r.assetId] : [])) } }, select: { id: true, name: true, tag: true } });
    const c = new Map(canals.map((x) => [x.id, x.code])); const b = new Map(blocks.map((x) => [x.id, x.code])); const a = new Map(assets.map((x) => [x.id, `${x.name} (${x.tag})`]));
    const t = today();
    const data = rows.map((r) => {
      const daysLeft = Math.round((+r.nextDueOn - +t) / 86_400_000);
      return {
        id: r.id, title: r.title, target: r.target, intervalDays: r.intervalDays, nextDueOn: r.nextDueOn, lastDoneOn: r.lastDoneOn, isActive: r.isActive, daysLeft,
        state: !r.isActive ? 'STOPPED' : daysLeft < 0 ? 'OVERDUE' : daysLeft <= 7 ? 'DUE_SOON' : 'OK',
        where: r.assetId ? a.get(r.assetId) ?? '' : r.blockId ? `Block ${b.get(r.blockId) ?? ''}` : r.canalId ? `Canal ${c.get(r.canalId) ?? ''}${r.location ? ` · ${r.location}` : ''}` : r.location ?? '',
        recent: r.logs.map((l) => ({ id: l.id, doneOn: l.doneOn, note: l.note, cost: l.cost == null ? null : num(l.cost) })),
      };
    });
    return { data, summary: { overdue: data.filter((d) => d.state === 'OVERDUE').length, dueSoon: data.filter((d) => d.state === 'DUE_SOON').length, total: data.filter((d) => d.isActive).length } };
  }

  /** Records that the job was done; the next one falls due an interval later. */
  async done(actor: RequestUser, id: string, dto: DoneDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const s = await this.prisma.maintenanceSchedule.findFirst({ where: { id, mamcosId } });
    if (!s) throw new NotFoundException('Schedule not found');
    if (!s.isActive) throw new BadRequestException('This schedule is stopped');
    const doneOn = dto.doneOn ? day(dto.doneOn) : today();
    if (doneOn > today()) throw new BadRequestException('You cannot record work that has not happened yet');
    await this.prisma.$transaction(async (tx) => {
      await tx.maintenanceLog.create({ data: { scheduleId: id, doneOn, doneById: actor.id, note: dto.note?.trim() || null, cost: dto.cost ?? null } });
      const later = !s.lastDoneOn || doneOn > s.lastDoneOn;
      if (later) await tx.maintenanceSchedule.update({ where: { id }, data: { lastDoneOn: doneOn, nextDueOn: addDays(doneOn, s.intervalDays) } });
    });
    return (await this.list(actor, mamcosId)).data.find((d) => d.id === id);
  }

  async update(actor: RequestUser, id: string, dto: UpdateScheduleDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    if (!(await this.prisma.maintenanceSchedule.findFirst({ where: { id, mamcosId }, select: { id: true } }))) throw new NotFoundException('Schedule not found');
    await this.prisma.maintenanceSchedule.update({ where: { id }, data: { intervalDays: dto.intervalDays, nextDueOn: dto.nextDueOn ? day(dto.nextDueOn) : undefined, isActive: dto.isActive } });
    return (await this.list(actor, mamcosId)).data.find((d) => d.id === id);
  }
}
