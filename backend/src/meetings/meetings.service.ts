import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MeetingKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttendanceDto, CancelMeetingDto, CloseMeetingDto, CreateMeetingDto, MeetingQueryDto, ResolutionDto, UpdateMeetingDto } from './dto/meetings.dto';
import { cancelMessage, invitationMessage, reminderMessage, toLang, updateMessage, type Msg } from './meetings.messages';

const DEFAULT_QUORUM: Record<MeetingKind, number> = { BOARD: 51, AGM: 25 };
const fullName = (f: { firstName: string; lastName: string }) => `${f.firstName} ${f.lastName}`.trim();
/** People needed in the room. */
export const quorumNeeded = (invited: number, percent: number) => Math.max(1, Math.ceil((invited * percent) / 100));

type Person = { farmerId: string; userId: string | null; phone: string | null; language: string | null };

/**
 * Board meetings and the General Meeting (Mkutano Mkuu). Scheduling texts everyone invited (board members, or every member for
 * a general meeting); members check in on their phone or the office marks them; the meeting cannot start without a quorum;
 * minutes lock when it closes; resolutions are logged once and never edited.
 */
@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage the meetings of your own cooperative');
    return id;
  }

  // ───────────────────────── who is invited ─────────────────────────

  /** Active board members for a board meeting; every member of the AMCOS for a general meeting. */
  private async invitees(mamcosId: string, kind: MeetingKind): Promise<Person[]> {
    const farmers = await this.prisma.farmer.findMany({
      where: kind === 'BOARD' ? { mamcosId, boardSeats: { some: { mamcosId, status: 'ACTIVE' } } } : { mamcosId },
      select: { id: true, user: { select: { id: true, phone: true, language: true } } },
    });
    return farmers.map((f) => ({ farmerId: f.id, userId: f.user?.id ?? null, phone: f.user?.phone ?? null, language: f.user?.language ?? null }));
  }

  private async isInvited(meeting: { mamcosId: string; kind: MeetingKind }, farmerId: string) {
    const f = await this.prisma.farmer.findFirst({
      where: { id: farmerId, mamcosId: meeting.mamcosId, ...(meeting.kind === 'BOARD' ? { boardSeats: { some: { mamcosId: meeting.mamcosId, status: 'ACTIVE' } } } : {}) },
      select: { id: true },
    });
    return !!f;
  }

  private async tellAll(people: Person[], make: (lang: ReturnType<typeof toLang>) => Msg) {
    for (const p of people) {
      try {
        const m = make(toLang(p.language));
        if (p.userId) await this.notifications.create({ userId: p.userId, type: 'meeting', title: m.title, body: m.body }).catch(() => undefined);
        if (p.phone) await this.sms.send(p.phone, m.body, 'meeting');
      } catch (e) {
        this.logger.warn(`Could not notify a meeting invitee: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // ───────────────────────── scheduling ─────────────────────────

  async create(actor: RequestUser, dto: CreateMeetingDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const at = new Date(dto.scheduledAt);
    if (Number.isNaN(+at)) throw new BadRequestException('Choose a valid date and time');
    if (at.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('The meeting time is in the past');
    const people = await this.invitees(mamcosId, dto.kind);
    if (!people.length) throw new ConflictException(dto.kind === 'BOARD' ? 'Add board members first: nobody would be invited' : 'This AMCOS has no members to invite');
    const meeting = await this.prisma.amcosMeeting.create({
      data: {
        mamcosId, kind: dto.kind, title: dto.title.trim(), agenda: dto.agenda.trim(), venue: dto.venue.trim(), scheduledAt: at,
        quorumPercent: dto.quorumPercent ?? DEFAULT_QUORUM[dto.kind], invitedCount: people.length, createdById: actor.id,
      },
    });
    const m = { kind: meeting.kind, title: meeting.title, agenda: meeting.agenda, venue: meeting.venue, at };
    await this.tellAll(people, (lang) => invitationMessage(lang, m));
    return this.shape(meeting, 0);
  }

  private async mine(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const m = await this.prisma.amcosMeeting.findFirst({ where: { id, mamcosId } });
    if (!m) throw new NotFoundException('Meeting not found');
    return m;
  }

  async update(actor: RequestUser, id: string, dto: UpdateMeetingDto, mamcosIdParam?: string) {
    const m = await this.mine(actor, id, mamcosIdParam);
    if (m.status !== 'SCHEDULED') throw new ConflictException('Only a meeting that has not opened for check-in can be changed');
    const at = dto.scheduledAt ? new Date(dto.scheduledAt) : m.scheduledAt;
    if (Number.isNaN(+at)) throw new BadRequestException('Choose a valid date and time');
    if (dto.scheduledAt && at.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('The meeting time is in the past');
    const updated = await this.prisma.amcosMeeting.update({
      where: { id },
      data: { title: dto.title?.trim() ?? m.title, agenda: dto.agenda?.trim() ?? m.agenda, venue: dto.venue?.trim() ?? m.venue, scheduledAt: at, ...(dto.scheduledAt ? { reminderSentAt: null } : {}) },
    });
    const people = await this.invitees(m.mamcosId, m.kind);
    const msg = { kind: updated.kind, title: updated.title, agenda: updated.agenda, venue: updated.venue, at: updated.scheduledAt };
    await this.tellAll(people, (lang) => updateMessage(lang, msg));
    return this.shape(updated, await this.prisma.meetingAttendance.count({ where: { meetingId: id } }));
  }

  async cancel(actor: RequestUser, id: string, dto: CancelMeetingDto, mamcosIdParam?: string) {
    const m = await this.mine(actor, id, mamcosIdParam);
    if (m.status !== 'SCHEDULED' && m.status !== 'CHECK_IN') throw new ConflictException('Only a meeting that has not started can be cancelled');
    const reason = dto.reason.trim();
    if (reason.length < 3) throw new BadRequestException('Say why the meeting is cancelled');
    const updated = await this.prisma.amcosMeeting.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason } });
    const people = await this.invitees(m.mamcosId, m.kind);
    await this.tellAll(people, (lang) => cancelMessage(lang, { kind: m.kind, title: m.title, agenda: m.agenda, venue: m.venue, at: m.scheduledAt, reason }));
    return this.shape(updated, 0);
  }

  /** Hourly: one reminder to everyone invited, within a day of the meeting. */
  async sendReminders(now = new Date()) {
    const due = await this.prisma.amcosMeeting.findMany({
      where: { status: 'SCHEDULED', reminderSentAt: null, scheduledAt: { gt: now, lte: new Date(now.getTime() + 24 * 3_600_000) } },
    });
    let sent = 0;
    for (const m of due) {
      const claimed = await this.prisma.amcosMeeting.updateMany({ where: { id: m.id, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (!claimed.count) continue;
      const people = await this.invitees(m.mamcosId, m.kind);
      await this.tellAll(people, (lang) => reminderMessage(lang, { kind: m.kind, title: m.title, agenda: m.agenda, venue: m.venue, at: m.scheduledAt }));
      sent++;
    }
    return sent;
  }

  // ───────────────────────── the meeting itself ─────────────────────────

  async openCheckIn(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const m = await this.mine(actor, id, mamcosIdParam);
    const claimed = await this.prisma.amcosMeeting.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'CHECK_IN' } });
    if (!claimed.count) throw new ConflictException('Check-in can only be opened for a scheduled meeting');
    return this.detail(actor, m.id, mamcosIdParam);
  }

  private async checkIn(meetingId: string, farmerId: string, method: 'SELF' | 'OFFICE', recordedById: string | null) {
    try {
      await this.prisma.meetingAttendance.create({ data: { meetingId, farmerId, method, recordedById } });
    } catch (e: any) {
      if (e?.code === 'P2002') return; // already checked in: nothing to do
      throw e;
    }
  }

  /** The office marks a member present (during check-in or the meeting). */
  async markPresent(actor: RequestUser, id: string, dto: AttendanceDto, mamcosIdParam?: string) {
    const m = await this.mine(actor, id, mamcosIdParam);
    if (m.status !== 'CHECK_IN' && m.status !== 'IN_SESSION') throw new ConflictException('Open check-in first');
    if (!(await this.isInvited(m, dto.farmerId))) throw new BadRequestException(m.kind === 'BOARD' ? 'Only board members attend a board meeting' : 'Choose a member of your AMCOS');
    await this.checkIn(id, dto.farmerId, 'OFFICE', actor.id);
    return this.quorum(m);
  }

  /** A member checks themselves in from their phone. */
  async selfCheckIn(actor: RequestUser, id: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true } });
    if (!farmer) throw new ForbiddenException('Only members can check in');
    const m = await this.prisma.amcosMeeting.findUnique({ where: { id } });
    if (!m || !(await this.isInvited(m, farmer.id))) throw new NotFoundException('Meeting not found');
    if (m.status !== 'CHECK_IN' && m.status !== 'IN_SESSION') throw new ConflictException('Check-in is not open yet. Wait for the office to open it');
    await this.checkIn(id, farmer.id, 'SELF', actor.id);
    return { checkedIn: true, ...(await this.quorum(m)) };
  }

  private async quorum(m: { id: string; invitedCount: number; quorumPercent: number }) {
    const present = await this.prisma.meetingAttendance.count({ where: { meetingId: m.id } });
    const needed = quorumNeeded(m.invitedCount, m.quorumPercent);
    return { present, needed, invited: m.invitedCount, met: present >= needed };
  }

  /** The meeting begins only when enough people are in the room. */
  async start(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const m = await this.mine(actor, id, mamcosIdParam);
    if (m.status !== 'CHECK_IN') throw new ConflictException('Open check-in before starting the meeting');
    const q = await this.quorum(m);
    if (!q.met) throw new ConflictException(`There is no quorum yet: ${q.present} of ${q.needed} needed have checked in`);
    await this.prisma.amcosMeeting.update({ where: { id }, data: { status: 'IN_SESSION', startedAt: new Date() } });
    return this.detail(actor, id, mamcosIdParam);
  }

  async addResolution(actor: RequestUser, id: string, dto: ResolutionDto, mamcosIdParam?: string) {
    const m = await this.mine(actor, id, mamcosIdParam);
    if (m.status !== 'IN_SESSION' && m.status !== 'CLOSED') throw new ConflictException('Resolutions are logged once the meeting has started');
    if (dto.outcome && dto.outcome !== 'PASSED' && dto.outcome !== 'REJECTED') throw new BadRequestException('Outcome must be passed or rejected');
    for (let attempt = 0; attempt < 3; attempt++) {
      const last = await this.prisma.meetingResolution.aggregate({ where: { meetingId: id }, _max: { number: true } });
      try {
        return await this.prisma.meetingResolution.create({
          data: { meetingId: id, number: (last._max.number ?? 0) + 1, title: dto.title.trim(), text: dto.text.trim(), outcome: dto.outcome ?? 'PASSED', votesFor: dto.votesFor ?? null, votesAgainst: dto.votesAgainst ?? null, recordedById: actor.id },
        });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e; // two people logging at once: take the next number
      }
    }
    throw new ConflictException('Could not log the resolution. Try again');
  }

  /** Closing locks the minutes. */
  async close(actor: RequestUser, id: string, dto: CloseMeetingDto, mamcosIdParam?: string) {
    await this.mine(actor, id, mamcosIdParam);
    if (dto.minutes.trim().length < 10) throw new BadRequestException('Write the minutes before closing the meeting');
    const claimed = await this.prisma.amcosMeeting.updateMany({ where: { id, status: 'IN_SESSION' }, data: { status: 'CLOSED', closedAt: new Date(), minutes: dto.minutes.trim(), closedById: actor.id } });
    if (!claimed.count) throw new ConflictException('Only a meeting in session can be closed');
    return this.detail(actor, id, mamcosIdParam);
  }

  // ───────────────────────── reading ─────────────────────────

  private shape(m: Prisma.AmcosMeetingGetPayload<object>, present: number) {
    return {
      id: m.id, kind: m.kind, title: m.title, agenda: m.agenda, venue: m.venue, scheduledAt: m.scheduledAt, status: m.status,
      invited: m.invitedCount, quorumPercent: m.quorumPercent, quorumNeeded: quorumNeeded(m.invitedCount, m.quorumPercent), present,
      startedAt: m.startedAt, closedAt: m.closedAt, cancelReason: m.cancelReason,
    };
  }

  async list(actor: RequestUser, q: MeetingQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const now = new Date();
    const open: Prisma.AmcosMeetingWhereInput = { OR: [{ status: { in: ['SCHEDULED', 'CHECK_IN', 'IN_SESSION'] } }] };
    const rows = await this.prisma.amcosMeeting.findMany({
      where: { mamcosId, ...(q.kind ? { kind: q.kind } : {}), ...(q.when === 'past' ? { NOT: open } : q.when === 'all' ? {} : open) },
      orderBy: { scheduledAt: q.when === 'past' ? 'desc' : 'asc' }, take: 100,
      include: { _count: { select: { attendances: true, resolutions: true } } },
    });
    void now;
    return { data: rows.map((m) => ({ ...this.shape(m, m._count.attendances), resolutions: m._count.resolutions })) };
  }

  async detail(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const m = await this.mine(actor, id, mamcosIdParam);
    const [attendances, resolutions, invitees] = await Promise.all([
      this.prisma.meetingAttendance.findMany({ where: { meetingId: id }, orderBy: { checkedInAt: 'asc' }, include: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } } }),
      this.prisma.meetingResolution.findMany({ where: { meetingId: id }, orderBy: { number: 'asc' } }),
      m.kind === 'BOARD'
        ? this.prisma.boardMember.findMany({ where: { mamcosId: m.mamcosId, status: 'ACTIVE' }, include: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } } })
        : Promise.resolve([]),
    ]);
    const here = new Set(attendances.map((a) => a.farmerId));
    return {
      ...this.shape(m, attendances.length),
      minutes: m.minutes, minutesLocked: m.status === 'CLOSED',
      quorum: await this.quorum(m),
      attendance: attendances.map((a) => ({ farmerId: a.farmerId, name: fullName(a.farmer), memberNumber: a.farmer.controlNumber, checkedInAt: a.checkedInAt, method: a.method })),
      // For a board meeting we know exactly who is expected, so the office sees who is still missing.
      expected: invitees.map((b) => ({ farmerId: b.farmerId, name: fullName(b.farmer), memberNumber: b.farmer.controlNumber, post: b.position, present: here.has(b.farmerId) })),
      resolutions: resolutions.map((r) => ({ id: r.id, number: r.number, title: r.title, text: r.text, outcome: r.outcome, votesFor: r.votesFor, votesAgainst: r.votesAgainst, createdAt: r.createdAt })),
    };
  }

  /** Every resolution the AMCOS has passed, newest first: the archive of policy. */
  async resolutions(actor: RequestUser, q: MeetingQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const rows = await this.prisma.meetingResolution.findMany({
      where: { meeting: { mamcosId, ...(q.kind ? { kind: q.kind } : {}) } }, orderBy: { createdAt: 'desc' }, take: 200,
      include: { meeting: { select: { id: true, kind: true, title: true, scheduledAt: true } } },
    });
    return { data: rows.map((r) => ({ id: r.id, number: r.number, title: r.title, text: r.text, outcome: r.outcome, votesFor: r.votesFor, votesAgainst: r.votesAgainst, createdAt: r.createdAt, meeting: r.meeting })) };
  }

  /** The signed-in member's meetings: the ones they are invited to that are still ahead of them. */
  async forMe(actor: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true, mamcosId: true, boardSeats: { where: { status: 'ACTIVE' }, select: { id: true } } } });
    if (!farmer?.mamcosId) return { data: [] };
    const rows = await this.prisma.amcosMeeting.findMany({
      where: {
        mamcosId: farmer.mamcosId, status: { in: ['SCHEDULED', 'CHECK_IN', 'IN_SESSION'] },
        ...(farmer.boardSeats.length ? {} : { kind: 'AGM' }),
      },
      orderBy: { scheduledAt: 'asc' }, take: 20,
      include: { attendances: { where: { farmerId: farmer.id }, select: { id: true } } },
    });
    return { data: rows.map((m) => ({ id: m.id, kind: m.kind, title: m.title, agenda: m.agenda, venue: m.venue, scheduledAt: m.scheduledAt, status: m.status, checkInOpen: m.status === 'CHECK_IN' || m.status === 'IN_SESSION', checkedIn: m.attendances.length > 0 })) };
  }
}
