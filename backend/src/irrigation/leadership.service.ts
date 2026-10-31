import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';
import { IrrigationScopeService } from './irrigation-scope.service';
import { AllocationService } from './allocation.service';
import { LeaderAccessService } from './leader-access.service';
import { fullName, paged, paging, rethrowIntegrity, toDate, today, userNames } from './irrigation-common';
import { AppointLeaderDto, EndLeadershipDto } from './dto/irrigation.dto';

const farmerSelect = { id: true, firstName: true, lastName: true, controlNumber: true } as const;
const CONFLICT_MSG = 'Someone else was appointed to this position at the same time. Reload and try again.';

@Injectable()
export class LeadershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: IrrigationScopeService,
    private readonly allocations: AllocationService,
    private readonly access: LeaderAccessService,
  ) {}

  async appoint(actor: RequestUser, dto: AppointLeaderDto) {
    const scope = await this.scopeService.resolve(actor);
    const canal = await this.scopeService.assertCanal(scope, dto.canalId);
    if (dto.position === 'CANAL_LEADER') {
      if (dto.blockId) throw new BadRequestException('A canal leader is appointed to a canal, not a block');
      this.scopeService.assertUnrestricted(scope, 'Appointing a canal leader');
    } else {
      if (!dto.blockId) throw new BadRequestException('Choose the block for a block leader');
      const block = await this.scopeService.assertBlock(scope, dto.blockId);
      if (block.canalId !== canal.id) throw new BadRequestException('That block does not belong to the selected canal');
      // Leaders confined to a scope may appoint block leaders inside their own canal only.
      if (scope.restricted && !scope.canalIds.includes(canal.id))
        throw new ForbiddenException('Block leaders can only be appointed by a canal leader or scheme manager');
    }
    if (canal.archivedAt) throw new BadRequestException('This canal is archived');
    const appointedOn = dto.appointedOn ? toDate(dto.appointedOn, 'appointment date') : today();
    const termStart = dto.termStart ? toDate(dto.termStart, 'term start') : appointedOn;
    const termEnd = dto.termEnd ? toDate(dto.termEnd, 'term end') : null;
    if (termEnd && termEnd < termStart) throw new BadRequestException('Term end cannot be before term start');
    if (termEnd && termEnd < today()) throw new BadRequestException('Term end is already in the past');

    const target = dto.position === 'CANAL_LEADER'
      ? { position: 'CANAL_LEADER' as const, canalId: canal.id }
      : { position: 'BLOCK_LEADER' as const, blockId: dto.blockId! };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.allocations.requireMember(tx, dto.farmerId, canal.scheme);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'irrigation-leader:' + (dto.blockId ?? canal.id)}))`;
        const current = await tx.irrigationLeadership.findFirst({
          where: { ...target, status: 'ACTIVE' }, include: { farmer: { select: farmerSelect } },
        });
        const expired = !!current?.termEnd && current.termEnd < today();
        if (current) {
          if (current.farmerId === dto.farmerId && !expired)
            throw new ConflictException(`${fullName(current.farmer)} already holds this position`);
          if (!expired && !dto.replaceExisting) {
            const holder = fullName(current.farmer);
            throw new ConflictException(dto.position === 'CANAL_LEADER'
              ? `${holder} is the current canal leader. Confirm replacement to end that appointment.`
              : `${holder} is the current block leader. Confirm replacement to end that appointment.`);
          }
          await tx.irrigationLeadership.update({
            where: { id: current.id },
            data: { status: 'ENDED', endedOn: today(), endReason: expired ? 'Term ended' : 'Replaced by new appointment', endedById: actor.id },
          });
        }
        const created = await tx.irrigationLeadership.create({
          data: {
            position: dto.position, canalId: canal.id, blockId: dto.blockId ?? null, farmerId: dto.farmerId,
            appointedOn, termStart, termEnd, notes: dto.notes?.trim() || null, recordedById: actor.id,
          },
        });
        if (current) await tx.irrigationLeadership.update({ where: { id: current.id }, data: { replacedById: created.id } });
        // The new leader becomes AMCOS staff; the one they replaced goes back to a member login if nothing else holds them in office.
        await this.access.sync(tx, dto.farmerId);
        if (current && current.farmerId !== dto.farmerId) await this.access.sync(tx, current.farmerId);
        return created;
      });
    } catch (error) {
      rethrowIntegrity(error, {
        irrigation_leaderships_one_active_canal_leader: CONFLICT_MSG,
        irrigation_leaderships_one_active_block_leader: CONFLICT_MSG,
        'Unique constraint failed': CONFLICT_MSG,
      });
    }
  }

  async end(actor: RequestUser, id: string, dto: EndLeadershipDto) {
    const scope = await this.scopeService.resolve(actor);
    const row = await this.prisma.irrigationLeadership.findFirst({ where: { id, canal: this.scopeService.canalWhere(scope) } });
    if (!row) throw new NotFoundException('Appointment not found');
    if (scope.restricted && (row.position === 'CANAL_LEADER' || !scope.canalIds.includes(row.canalId)))
      throw new ForbiddenException('You cannot end this appointment');
    if (row.status !== 'ACTIVE') throw new ConflictException('This appointment has already ended');
    const endedOn = dto.endedOn ? toDate(dto.endedOn, 'end date') : today();
    if (endedOn < row.appointedOn) throw new BadRequestException('End date is before the appointment date');
    return this.prisma.$transaction(async (tx) => {
      const ended = await tx.irrigationLeadership.update({
        where: { id }, data: { status: 'ENDED', endedOn, endReason: dto.reason.trim(), endedById: actor.id },
      });
      await this.access.sync(tx, row.farmerId);
      return ended;
    });
  }

  /** Appointment register: current and past, newest first, with who replaced whom. */
  async list(actor: RequestUser, q: Record<string, string>) {
    const scope = await this.scopeService.resolve(actor);
    const { page, pageSize, skip, take } = paging(q as any);
    const now = today();
    const where: Prisma.IrrigationLeadershipWhereInput = {
      AND: [
        { canal: this.scopeService.canalWhere(scope) },
        // A restricted user sees appointments for what they can see: their canal, or just their block.
        scope.restricted ? { OR: [{ canalId: { in: scope.canalIds } }, { blockId: { in: scope.blockIds } }] } : {},
        q.schemeId ? { canal: { schemeId: q.schemeId } } : {},
        q.canalId ? { canalId: q.canalId } : {},
        q.blockId ? { blockId: q.blockId } : {},
        q.position ? { position: q.position as any } : {},
        q.farmerId ? { farmerId: q.farmerId } : {},
        q.status === 'ACTIVE' ? { status: 'ACTIVE', OR: [{ termEnd: null }, { termEnd: { gte: now } }] } : {},
        q.status === 'TERM_EXPIRED' ? { status: 'ACTIVE', termEnd: { lt: now } } : {},
        q.status === 'ENDED' ? { status: 'ENDED' } : {},
        q.from || q.to ? { appointedOn: { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) } } : {},
        q.q ? { farmer: { OR: [
          { firstName: { contains: q.q, mode: 'insensitive' } },
          { lastName: { contains: q.q, mode: 'insensitive' } },
          { controlNumber: { contains: q.q, mode: 'insensitive' } },
        ] } } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.irrigationLeadership.count({ where }),
      this.prisma.irrigationLeadership.findMany({
        where, skip, take, orderBy: [{ appointedOn: 'desc' }, { createdAt: 'desc' }],
        include: {
          farmer: { select: farmerSelect },
          canal: { select: { id: true, code: true, name: true } },
          block: { select: { id: true, code: true, name: true } },
          replacedBy: { select: { id: true, appointedOn: true, farmer: { select: farmerSelect } } },
          replaces: { select: { id: true, endedOn: true, farmer: { select: farmerSelect } } },
        },
      }),
    ]);
    const names = await userNames(this.prisma, rows.flatMap((r) => [r.recordedById, r.endedById]));
    return paged(rows.map((r) => ({
      id: r.id, position: r.position, canal: r.canal, block: r.block,
      leader: { id: r.farmer.id, name: fullName(r.farmer), memberNumber: r.farmer.controlNumber },
      appointedOn: r.appointedOn, termStart: r.termStart, termEnd: r.termEnd, endedOn: r.endedOn, endReason: r.endReason,
      status: r.status === 'ACTIVE' && r.termEnd && r.termEnd < now ? 'TERM_EXPIRED' : r.status,
      notes: r.notes,
      replacedBy: r.replacedBy ? { name: fullName(r.replacedBy.farmer), date: r.replacedBy.appointedOn } : null,
      replaces: r.replaces[0] ? { name: fullName(r.replaces[0].farmer), date: r.replaces[0].endedOn } : null,
      recordedBy: names.get(r.recordedById ?? '') ?? null, endedBy: names.get(r.endedById ?? '') ?? null,
    })), total, page, pageSize);
  }
}
