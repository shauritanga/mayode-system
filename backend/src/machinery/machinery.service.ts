import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import {
  CreateActivityDto, CreateEquipmentDto, ListQueryDto, UpdateActivityDto, UpdateEquipmentDto,
} from './dto/machinery.dto';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const day = (value: string | Date) => new Date(`${(typeof value === 'string' ? value : value.toISOString()).slice(0, 10)}T00:00:00.000Z`);
const today = () => day(new Date());

/** The AMCOS's machinery register and the log of what each machine did, where, over how many hectares, for what fee. */
@Injectable()
export class MachineryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage machinery for your own cooperative');
    return id;
  }

  // ───────────────────────── equipment ─────────────────────────

  async listEquipment(actor: RequestUser, q: { mamcosId?: string; includeInactive?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const [items, totals] = await Promise.all([
      this.prisma.amcosEquipment.findMany({
        where: { mamcosId, ...(q.includeInactive === 'true' ? {} : { isActive: true }) },
        orderBy: [{ ownership: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.machineryActivity.groupBy({
        by: ['equipmentId'], where: { mamcosId, status: 'COMPLETED' },
        _sum: { hectares: true, feeAmount: true }, _count: { _all: true },
      }),
    ]);
    const used = new Map(totals.map((t) => [t.equipmentId, t]));
    return items.map((e) => ({
      ...e, feePerHectare: e.feePerHectare == null ? null : num(e.feePerHectare),
      jobs: used.get(e.id)?._count._all ?? 0, hectaresWorked: num(used.get(e.id)?._sum.hectares), feesEarned: num(used.get(e.id)?._sum.feeAmount),
    }));
  }

  private checkOwnership(dto: { ownership?: string; ownerName?: string | null; feePerHectare?: number | null }) {
    if (dto.ownership === 'EXTERNAL' && !dto.ownerName?.trim()) throw new BadRequestException('Give the owner of this external machine');
    if (dto.ownership === 'AMCOS' && (dto.ownerName || dto.feePerHectare)) {
      throw new BadRequestException('An AMCOS-owned machine has no outside owner and earns no contribution fee');
    }
  }

  async createEquipment(actor: RequestUser, dto: CreateEquipmentDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    this.checkOwnership(dto);
    try {
      return await this.prisma.amcosEquipment.create({
        data: {
          mamcosId, name: dto.name.trim(), type: dto.type, registrationNo: dto.registrationNo?.trim() || null, ownership: dto.ownership,
          ownerName: dto.ownerName?.trim() || null, ownerPhone: dto.ownerPhone?.trim() || null,
          feePerHectare: dto.ownership === 'EXTERNAL' ? dto.feePerHectare ?? null : null, notes: dto.notes?.trim() || null, createdById: actor.id,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`A machine called "${dto.name.trim()}" is already registered`);
      throw e;
    }
  }

  async updateEquipment(actor: RequestUser, id: string, dto: UpdateEquipmentDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const current = await this.prisma.amcosEquipment.findFirst({ where: { id, mamcosId } });
    if (!current) throw new NotFoundException('Equipment not found');
    this.checkOwnership({ ownership: current.ownership, ownerName: dto.ownerName ?? current.ownerName, feePerHectare: dto.feePerHectare ?? (current.feePerHectare == null ? null : num(current.feePerHectare)) });
    try {
      return await this.prisma.amcosEquipment.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.registrationNo !== undefined ? { registrationNo: dto.registrationNo.trim() || null } : {}),
          ...(dto.ownerName !== undefined ? { ownerName: dto.ownerName.trim() || null } : {}),
          ...(dto.ownerPhone !== undefined ? { ownerPhone: dto.ownerPhone.trim() || null } : {}),
          ...(dto.feePerHectare !== undefined ? { feePerHectare: dto.feePerHectare } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}), ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Another machine already has that name');
      throw e;
    }
  }

  // ───────────────────────── activities ─────────────────────────

  private async blockFor(mamcosId: string, blockId?: string | null) {
    if (!blockId) return null;
    const block = await this.prisma.irrigationBlock.findFirst({
      where: { id: blockId, canal: { scheme: { mamcosId } } }, select: { id: true, code: true, areaHectares: true },
    });
    if (!block) throw new NotFoundException('Block not found');
    return block;
  }

  /** Fee rules: AMCOS-owned machines earn nothing; external machines owe hectares × their rate unless an amount is given. */
  private fee(equipment: { ownership: string; feePerHectare: Prisma.Decimal | null }, hectares: number, explicit?: number) {
    if (equipment.ownership === 'AMCOS') {
      if (explicit && explicit > 0) throw new BadRequestException('An AMCOS-owned machine does not earn a contribution fee');
      return { feeAmount: 0, feeStatus: 'NOT_APPLICABLE' as const };
    }
    const amount = explicit ?? Math.round(hectares * num(equipment.feePerHectare) * 100) / 100;
    return amount > 0 ? { feeAmount: amount, feeStatus: 'PENDING' as const } : { feeAmount: 0, feeStatus: 'NOT_APPLICABLE' as const };
  }

  private assertDate(date: Date, status: string) {
    if (status === 'COMPLETED' && date > today()) throw new BadRequestException('A completed job cannot be dated in the future');
  }

  async createActivity(actor: RequestUser, dto: CreateActivityDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const equipment = await this.prisma.amcosEquipment.findFirst({ where: { id: dto.equipmentId, mamcosId } });
    if (!equipment) throw new NotFoundException('Equipment not found');
    if (!equipment.isActive) throw new BadRequestException('This machine is marked inactive');
    const block = await this.blockFor(mamcosId, dto.blockId);
    if (block && dto.hectares > num(block.areaHectares)) throw new BadRequestException(`${block.code} is only ${num(block.areaHectares)} ha; a single job cannot cover more`);
    const status = dto.status ?? 'COMPLETED';
    const date = day(dto.activityDate);
    this.assertDate(date, status);
    const fee = status === 'CANCELLED' ? { feeAmount: 0, feeStatus: 'NOT_APPLICABLE' as const } : this.fee(equipment, dto.hectares, dto.feeAmount);
    return this.prisma.machineryActivity.create({
      data: {
        mamcosId, activityDate: date, type: dto.type, equipmentId: equipment.id, operatorName: dto.operatorName?.trim() || null,
        blockId: block?.id ?? null, location: dto.location?.trim() || null, hectares: dto.hectares, status, notes: dto.notes?.trim() || null,
        createdById: actor.id, updatedById: actor.id, ...fee,
      },
    });
  }

  async updateActivity(actor: RequestUser, id: string, dto: UpdateActivityDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const current = await this.prisma.machineryActivity.findFirst({ where: { id, mamcosId }, include: { equipment: true } });
    if (!current) throw new NotFoundException('Activity not found');
    const paid = current.feeStatus === 'PAID';
    const equipment = dto.equipmentId && dto.equipmentId !== current.equipmentId
      ? await this.prisma.amcosEquipment.findFirst({ where: { id: dto.equipmentId, mamcosId } }) : current.equipment;
    if (!equipment) throw new NotFoundException('Equipment not found');
    const hectares = dto.hectares ?? num(current.hectares);
    const status = dto.status ?? current.status;
    const blockId = dto.blockId === undefined ? current.blockId : dto.blockId;
    const block = await this.blockFor(mamcosId, blockId);
    if (block && hectares > num(block.areaHectares)) throw new BadRequestException(`${block.code} is only ${num(block.areaHectares)} ha; a single job cannot cover more`);
    const date = dto.activityDate ? day(dto.activityDate) : current.activityDate;
    this.assertDate(date, status);

    const feeChanged = dto.hectares !== undefined || dto.equipmentId !== undefined || dto.feeAmount !== undefined;
    if (paid && (feeChanged || status === 'CANCELLED')) {
      throw new ConflictException('The fee for this job is already paid, so its hectares, machine and fee can no longer change');
    }
    let fee: { feeAmount: number; feeStatus: 'NOT_APPLICABLE' | 'PENDING' | 'PAID' } | null = null;
    if (!paid) {
      if (status === 'CANCELLED') fee = { feeAmount: 0, feeStatus: 'NOT_APPLICABLE' };
      else if (feeChanged || current.status === 'CANCELLED') fee = this.fee(equipment, hectares, dto.feeAmount);
    }
    return this.prisma.machineryActivity.update({
      where: { id },
      data: {
        ...(dto.activityDate ? { activityDate: date } : {}), ...(dto.type ? { type: dto.type } : {}), equipmentId: equipment.id,
        ...(dto.operatorName !== undefined ? { operatorName: dto.operatorName.trim() || null } : {}),
        blockId: block?.id ?? null, ...(dto.location !== undefined ? { location: dto.location.trim() || null } : {}),
        hectares, status, ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        ...(fee ?? {}), updatedById: actor.id,
      },
    });
  }

  async markFeePaid(actor: RequestUser, id: string, paidOn?: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const current = await this.prisma.machineryActivity.findFirst({ where: { id, mamcosId } });
    if (!current) throw new NotFoundException('Activity not found');
    if (current.status !== 'COMPLETED') throw new ConflictException('Only a completed job has a fee to collect');
    if (current.feeStatus !== 'PENDING') throw new ConflictException(current.feeStatus === 'PAID' ? 'This fee is already recorded as paid' : 'There is no fee to collect for this job');
    const date = paidOn ? day(paidOn) : today();
    if (date > today()) throw new BadRequestException('The payment date cannot be in the future');
    if (date < current.activityDate) throw new BadRequestException('The payment date is before the job date');
    return this.prisma.machineryActivity.update({ where: { id }, data: { feeStatus: 'PAID', feePaidOn: date, updatedById: actor.id } });
  }

  private where(mamcosId: string, q: ListQueryDto): Prisma.MachineryActivityWhereInput {
    const text = q.q?.trim();
    return {
      mamcosId,
      ...(q.from || q.to ? { activityDate: { ...(q.from ? { gte: day(q.from) } : {}), ...(q.to ? { lte: day(q.to) } : {}) } } : {}),
      ...(q.type ? { type: q.type } : {}), ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.ownership ? { equipment: { ownership: q.ownership } } : {}), ...(q.status ? { status: q.status } : {}),
      ...(q.feeStatus ? { feeStatus: q.feeStatus } : {}), ...(q.blockId ? { blockId: q.blockId } : {}),
      ...(text ? { OR: [
        { operatorName: { contains: text, mode: 'insensitive' } }, { location: { contains: text, mode: 'insensitive' } },
        { equipment: { name: { contains: text, mode: 'insensitive' } } }, { block: { code: { contains: text, mode: 'insensitive' } } },
      ] } : {}),
    };
  }

  async listActivities(actor: RequestUser, q: ListQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const pageSize = Math.min(q.pageSize ?? 20, 200);
    const page = q.page ?? 1;
    const where = this.where(mamcosId, q);
    const done = { ...where, status: 'COMPLETED' as const };
    const [total, rows, sum, byType, pendingFees, paidFees] = await Promise.all([
      this.prisma.machineryActivity.count({ where }),
      this.prisma.machineryActivity.findMany({
        where, orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize,
        include: { equipment: { select: { id: true, name: true, type: true, ownership: true, ownerName: true } }, block: { select: { id: true, code: true } } },
      }),
      this.prisma.machineryActivity.aggregate({ where: done, _sum: { hectares: true, feeAmount: true }, _count: { _all: true } }),
      this.prisma.machineryActivity.groupBy({ by: ['type'], where: done, _sum: { hectares: true }, _count: { _all: true } }),
      this.prisma.machineryActivity.aggregate({ where: { ...done, feeStatus: 'PENDING' }, _sum: { feeAmount: true } }),
      this.prisma.machineryActivity.aggregate({ where: { ...done, feeStatus: 'PAID' }, _sum: { feeAmount: true } }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id, activityDate: r.activityDate, type: r.type, status: r.status, operatorName: r.operatorName, location: r.location,
        hectares: num(r.hectares), feeAmount: num(r.feeAmount), feeStatus: r.feeStatus, feePaidOn: r.feePaidOn, notes: r.notes,
        equipment: r.equipment, block: r.block,
      })),
      meta: { total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) },
      summary: {
        jobs: sum._count._all, hectares: num(sum._sum.hectares), feesDue: num(pendingFees._sum.feeAmount), feesPaid: num(paidFees._sum.feeAmount),
        byType: byType.map((t) => ({ type: t.type, jobs: t._count._all, hectares: num(t._sum.hectares) })).sort((a, b) => b.hectares - a.hectares),
      },
    };
  }
}
