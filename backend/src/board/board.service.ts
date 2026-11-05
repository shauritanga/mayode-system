import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardPosition, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AddBoardMemberDto, BoardQueryDto, EndBoardMemberDto, UpdateBoardMemberDto } from './dto/board.dto';

const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const today = () => day(new Date().toISOString());

export const POSITION_LABEL: Record<BoardPosition, string> = {
  CHAIRPERSON: 'Chairperson', VICE_CHAIRPERSON: 'Vice chairperson', SECRETARY: 'Secretary', TREASURER: 'Treasurer', MEMBER: 'Board member',
};

/** The AMCOS board: registered farmers who sit on it, with a post and a term. Other screens (Communication) read this list. */
@Injectable()
export class BoardService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage the board of your own cooperative');
    return id;
  }

  private shape(m: { id: string; position: BoardPosition; termStart: Date; termEnd: Date | null; status: string; notes: string | null; endedOn: Date | null; endReason: string | null; createdAt: Date;
    farmer: { id: string; firstName: string; lastName: string; controlNumber: string; village: string | null; user: { phone: string } | null; email: string | null } }) {
    return {
      id: m.id, position: m.position, positionLabel: POSITION_LABEL[m.position], termStart: m.termStart, termEnd: m.termEnd,
      status: m.status, termLapsed: m.status === 'ACTIVE' && !!m.termEnd && m.termEnd < today(), notes: m.notes, endedOn: m.endedOn, endReason: m.endReason, createdAt: m.createdAt,
      farmer: { id: m.farmer.id, name: `${m.farmer.firstName} ${m.farmer.lastName}`.trim(), memberNumber: m.farmer.controlNumber, village: m.farmer.village, phone: m.farmer.user?.phone ?? null, email: m.farmer.email },
    };
  }

  private static readonly INCLUDE = { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, email: true, user: { select: { phone: true } } } } } as const;

  async list(actor: RequestUser, q: BoardQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const text = q.q?.trim();
    const where: Prisma.BoardMemberWhereInput = {
      mamcosId,
      ...(q.status === 'ENDED' ? { status: 'ENDED' } : q.status === 'ALL' ? {} : { status: 'ACTIVE' }),
      ...(text ? { farmer: { OR: [{ firstName: { contains: text, mode: 'insensitive' } }, { lastName: { contains: text, mode: 'insensitive' } }, { controlNumber: { contains: text, mode: 'insensitive' } }] } } : {}),
    };
    const rows = await this.prisma.boardMember.findMany({ where, include: BoardService.INCLUDE, orderBy: [{ status: 'asc' }, { termStart: 'asc' }] });
    const order: BoardPosition[] = ['CHAIRPERSON', 'VICE_CHAIRPERSON', 'SECRETARY', 'TREASURER', 'MEMBER'];
    const data = rows.map((r) => this.shape(r)).sort((a, b) => (a.status === b.status ? order.indexOf(a.position) - order.indexOf(b.position) : a.status < b.status ? -1 : 1));
    const active = await this.prisma.boardMember.groupBy({ by: ['position'], where: { mamcosId, status: 'ACTIVE' }, _count: { _all: true } });
    const vacant = (['CHAIRPERSON', 'VICE_CHAIRPERSON', 'SECRETARY', 'TREASURER'] as BoardPosition[]).filter((p) => !active.some((a) => a.position === p)).map((p) => POSITION_LABEL[p]);
    return { data, totals: { active: active.reduce((n, a) => n + a._count._all, 0), vacantPosts: vacant } };
  }

  /** Registered farmers of this AMCOS who are not already on the board, found by name, member number or phone. */
  async candidates(actor: RequestUser, q: BoardQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const text = q.q?.trim();
    if (!text || text.length < 2) return { data: [] };
    const rows = await this.prisma.farmer.findMany({
      where: {
        mamcosId, boardSeats: { none: { status: 'ACTIVE' } },
        OR: [{ firstName: { contains: text, mode: 'insensitive' } }, { lastName: { contains: text, mode: 'insensitive' } }, { controlNumber: { contains: text, mode: 'insensitive' } }, { user: { phone: { contains: text } } }],
      },
      select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, user: { select: { phone: true } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: Math.min(q.pageSize ?? 10, 50),
    });
    return { data: rows.map((f) => ({ id: f.id, name: `${f.firstName} ${f.lastName}`.trim(), memberNumber: f.controlNumber, village: f.village, phone: f.user?.phone ?? null })) };
  }

  private checkTerm(start: Date, end: Date | null | undefined) {
    if (end && end < start) throw new BadRequestException('The term cannot end before it starts');
  }

  /** One holder per officer post; say who holds it instead of surfacing a database error. */
  private async assertPostFree(mamcosId: string, position: BoardPosition, exceptId?: string) {
    if (position === 'MEMBER') return;
    const holder = await this.prisma.boardMember.findFirst({ where: { mamcosId, position, status: 'ACTIVE', ...(exceptId ? { id: { not: exceptId } } : {}) }, include: BoardService.INCLUDE });
    if (holder) throw new ConflictException(`${POSITION_LABEL[position]} is already held by ${holder.farmer.firstName} ${holder.farmer.lastName}. Change their post or end their term first`);
  }

  async add(actor: RequestUser, dto: AddBoardMemberDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const farmer = await this.prisma.farmer.findFirst({ where: { id: dto.farmerId, mamcosId }, select: { id: true } });
    if (!farmer) throw new BadRequestException('Choose a registered farmer of your AMCOS');
    const position = dto.position ?? 'MEMBER';
    const termStart = day(dto.termStart);
    const termEnd = dto.termEnd ? day(dto.termEnd) : null;
    this.checkTerm(termStart, termEnd);
    if (await this.prisma.boardMember.findFirst({ where: { mamcosId, farmerId: farmer.id, status: 'ACTIVE' }, select: { id: true } })) throw new ConflictException('This farmer is already on the board');
    await this.assertPostFree(mamcosId, position);
    const row = await this.prisma.boardMember.create({
      data: { mamcosId, farmerId: farmer.id, position, termStart, termEnd, notes: dto.notes?.trim() || null, createdById: actor.id }, include: BoardService.INCLUDE,
    });
    return this.shape(row);
  }

  private async mine(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const row = await this.prisma.boardMember.findFirst({ where: { id, mamcosId } });
    if (!row) throw new NotFoundException('Board member not found');
    return row;
  }

  async update(actor: RequestUser, id: string, dto: UpdateBoardMemberDto, mamcosIdParam?: string) {
    const row = await this.mine(actor, id, mamcosIdParam);
    if (row.status !== 'ACTIVE') throw new BadRequestException('This board term has ended; add the farmer again for a new term');
    const position = dto.position ?? row.position;
    const termStart = dto.termStart ? day(dto.termStart) : row.termStart;
    const termEnd = dto.termEnd ? day(dto.termEnd) : row.termEnd;
    this.checkTerm(termStart, termEnd);
    if (position !== row.position) await this.assertPostFree(row.mamcosId, position, row.id);
    const updated = await this.prisma.boardMember.update({
      where: { id }, data: { position, termStart, termEnd, ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}) }, include: BoardService.INCLUDE,
    });
    return this.shape(updated);
  }

  /** Ending keeps the record (who sat, which post, when) and frees the post. */
  async end(actor: RequestUser, id: string, dto: EndBoardMemberDto, mamcosIdParam?: string) {
    const row = await this.mine(actor, id, mamcosIdParam);
    if (row.status !== 'ACTIVE') throw new BadRequestException('This board term has already ended');
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Say why the term is ending');
    const endedOn = dto.endedOn ? day(dto.endedOn) : today();
    if (endedOn < row.termStart) throw new BadRequestException('The term cannot end before it starts');
    const updated = await this.prisma.boardMember.update({ where: { id }, data: { status: 'ENDED', endedOn, endReason: reason, endedById: actor.id }, include: BoardService.INCLUDE });
    return this.shape(updated);
  }
}
