import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { normalizeMsisdn, SmsService } from '../messaging/sms.service';
import { EmailService } from './email.service';
import { AudienceDto, PageQueryDto, SendCommunicationDto } from './dto/communications.dto';

const SMS_LIMIT = 480; // three standard segments
const BATCH = 200;
const PARALLEL = 5;

type Channel = 'SMS' | 'EMAIL';
type Kind = 'FARMER' | 'BOARD' | 'STAFF';
/** Anyone a message can go to: a farmer, a board member (also a farmer) or a staff user. */
interface Person { key: string; farmerId: string | null; userId: string | null; kind: Kind; name: string; phone: string | null; email: string | null; isActive: boolean }
interface Plan { key: string; farmerId: string | null; userId: string | null; kind: Kind; name: string; channel: Channel; address: string | null; status: 'PENDING' | 'SKIPPED'; error?: string }
interface Audience { people: Person[]; label: string; canalId?: string; blockId?: string }
type FarmerRow = { id: string; firstName: string; lastName: string; email: string | null; user: { phone: string; email: string | null; isActive: boolean } | null };
const firstWord = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** Hello {name} → the farmer's first name. Anything else in braces is left as typed. */
export const personalise = (text: string, firstName: string) => text.replace(/\{name\}/gi, firstName);

/** Messages an AMCOS admin sends to its own farmers, by SMS, email or both, with a per-farmer record of what happened. */
@Injectable()
export class CommunicationsService implements OnModuleInit {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
  ) {}

  /** A send that was running when the server stopped cannot resume; say so instead of leaving it "sending" forever. */
  async onModuleInit() {
    await this.prisma.communication.updateMany({ where: { status: 'SENDING' }, data: { status: 'INTERRUPTED', completedAt: new Date() } }).catch(() => undefined);
  }

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only message the farmers of your own cooperative');
    return id;
  }

  channels() {
    return { sms: { configured: this.sms.isConfigured() }, email: { configured: this.email.isConfigured() } };
  }

  /** Farmers of this AMCOS to choose from, with what each can be reached on. */
  async farmers(actor: RequestUser, q: PageQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const pageSize = Math.min(q.pageSize ?? 25, 200);
    const page = q.page ?? 1;
    const text = q.q?.trim();
    const where: Prisma.FarmerWhereInput = {
      mamcosId,
      ...(text ? { OR: [
        { firstName: { contains: text, mode: 'insensitive' } }, { lastName: { contains: text, mode: 'insensitive' } },
        { controlNumber: { contains: text, mode: 'insensitive' } }, { village: { contains: text, mode: 'insensitive' } },
        { user: { phone: { contains: text } } },
      ] } : {}),
    };
    const [total, rows, all, withEmail] = await Promise.all([
      this.prisma.farmer.count({ where }),
      this.prisma.farmer.findMany({
        where, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, firstName: true, lastName: true, controlNumber: true, village: true, email: true, user: { select: { phone: true, email: true } } },
      }),
      this.prisma.farmer.count({ where: { mamcosId } }),
      this.prisma.farmer.count({ where: { mamcosId, OR: [{ email: { not: null } }, { user: { email: { not: null } } }] } }),
    ]);
    return {
      data: rows.map((f) => ({
        id: f.id, name: `${f.firstName} ${f.lastName}`.trim(), memberNumber: f.controlNumber, village: f.village,
        phone: f.user?.phone ?? null, email: f.email ?? f.user?.email ?? null,
      })),
      meta: { total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) },
      totals: { farmers: all, withEmail },
    };
  }

  private farmerPerson(f: FarmerRow, kind: Kind = 'FARMER'): Person {
    return {
      key: `F:${f.id}`, farmerId: f.id, userId: null, kind, name: `${f.firstName} ${f.lastName}`.trim(),
      phone: f.user?.phone ?? null, email: f.email ?? f.user?.email ?? null, isActive: !!f.user?.isActive,
    };
  }

  private static readonly FARMER_SELECT = { id: true, firstName: true, lastName: true, email: true, user: { select: { phone: true, email: true, isActive: true } } } as const;

  /** Farmers who hold, or guard, an active hectare in the given canal or block (always of this AMCOS). */
  private async farmersOnLand(mamcosId: string, hectare: Prisma.IrrigationHectareWhereInput): Promise<FarmerRow[]> {
    const allocation: Prisma.IrrigationHectareAllocationWhereInput = {
      status: 'ACTIVE', hectare: { ...hectare, block: { ...(hectare.block as object | undefined), canal: { scheme: { mamcosId } } } },
    };
    return this.prisma.farmer.findMany({
      where: { mamcosId, OR: [{ irrigationAllocations: { some: allocation } }, { guardianships: { some: { endedOn: null, allocation } } }] },
      select: CommunicationsService.FARMER_SELECT, orderBy: { firstName: 'asc' },
    });
  }

  private async audiencePeople(mamcosId: string, dto: AudienceDto): Promise<Audience> {
    const select = CommunicationsService.FARMER_SELECT;
    switch (dto.audience) {
      case 'ALL': {
        const rows = await this.prisma.farmer.findMany({ where: { mamcosId }, select, orderBy: { createdAt: 'asc' } });
        return { people: rows.map((f) => this.farmerPerson(f)), label: 'All farmers' };
      }
      case 'SELECTED': {
        const ids = [...new Set(dto.farmerIds ?? [])];
        if (!ids.length) throw new BadRequestException('Choose at least one farmer');
        const rows = await this.prisma.farmer.findMany({ where: { id: { in: ids }, mamcosId }, select });
        if (rows.length !== ids.length) throw new BadRequestException('Some of the chosen farmers are not members of your AMCOS');
        return { people: rows.map((f) => this.farmerPerson(f)), label: ids.length === 1 ? 'One farmer' : `${ids.length} chosen farmers` };
      }
      case 'CANAL': {
        if (!dto.canalId) throw new BadRequestException('Choose a canal');
        const canal = await this.prisma.irrigationCanal.findFirst({ where: { id: dto.canalId, scheme: { mamcosId } }, select: { id: true, name: true } });
        if (!canal) throw new BadRequestException('That canal does not belong to your AMCOS');
        const rows = await this.farmersOnLand(mamcosId, { block: { canalId: canal.id } });
        return { people: rows.map((f) => this.farmerPerson(f)), label: `Farmers of ${canal.name}`, canalId: canal.id };
      }
      case 'BLOCK': {
        if (!dto.blockId) throw new BadRequestException('Choose a block');
        const block = await this.prisma.irrigationBlock.findFirst({
          where: { id: dto.blockId, canal: { scheme: { mamcosId }, ...(dto.canalId ? { id: dto.canalId } : {}) } },
          select: { id: true, code: true, name: true, canalId: true, canal: { select: { name: true } } },
        });
        if (!block) throw new BadRequestException('That block does not belong to your AMCOS');
        const rows = await this.farmersOnLand(mamcosId, { blockId: block.id });
        return { people: rows.map((f) => this.farmerPerson(f)), label: `Farmers of ${block.canal.name} · ${block.name ?? `Block ${block.code}`}`, canalId: block.canalId, blockId: block.id };
      }
      case 'BOARD': {
        const rows = await this.prisma.farmer.findMany({
          where: { mamcosId, boardSeats: { some: { status: 'ACTIVE', mamcosId } } },
          select, orderBy: { firstName: 'asc' },
        });
        return { people: rows.map((f) => this.farmerPerson(f, 'BOARD')), label: 'AMCOS board members' };
      }
      case 'STAFF': {
        const users = await this.prisma.user.findMany({
          where: { role: { notIn: ['FARMER', 'SUPER_ADMIN'] }, OR: [{ mamcosId }, { mamcosStaff: { mamcosId } }] },
          select: { id: true, firstName: true, lastName: true, phone: true, email: true, isActive: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        return {
          people: users.map((u) => ({ key: `U:${u.id}`, farmerId: null, userId: u.id, kind: 'STAFF' as const, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone, phone: u.phone, email: u.email, isActive: u.isActive })),
          label: 'AMCOS staff',
        };
      }
    }
  }

  /** Canals, their blocks and how many farmers sit on each, plus the board and staff headcounts: what the audience picker offers. */
  async targets(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const [canals, allocations, board, staff] = await Promise.all([
      this.prisma.irrigationCanal.findMany({
        where: { scheme: { mamcosId }, archivedAt: null }, orderBy: [{ schemeId: 'asc' }, { canalNumber: 'asc' }],
        select: { id: true, name: true, code: true, blocks: { where: { archivedAt: null }, orderBy: { blockNumber: 'asc' }, select: { id: true, name: true, code: true } } },
      }),
      this.prisma.irrigationHectareAllocation.findMany({
        where: { status: 'ACTIVE', hectare: { block: { canal: { scheme: { mamcosId } } } } },
        select: { farmerId: true, hectare: { select: { blockId: true, block: { select: { canalId: true } } } }, guardians: { where: { endedOn: null }, select: { guardianId: true } } },
      }),
      this.audiencePeople(mamcosId, { audience: 'BOARD', channel: 'SMS' }),
      this.audiencePeople(mamcosId, { audience: 'STAFF', channel: 'SMS' }),
    ]);
    const byCanal = new Map<string, Set<string>>();
    const byBlock = new Map<string, Set<string>>();
    const add = (m: Map<string, Set<string>>, k: string, id: string) => { if (!m.has(k)) m.set(k, new Set()); m.get(k)!.add(id); };
    for (const a of allocations) {
      for (const id of [a.farmerId, ...a.guardians.map((g) => g.guardianId)]) { add(byCanal, a.hectare.block.canalId, id); add(byBlock, a.hectare.blockId, id); }
    }
    return {
      canals: canals.map((c) => ({
        id: c.id, name: c.name, farmers: byCanal.get(c.id)?.size ?? 0,
        blocks: c.blocks.map((b) => ({ id: b.id, name: b.name ?? `Block ${b.code}`, farmers: byBlock.get(b.id)?.size ?? 0 })),
      })),
      board: board.people.length, staff: staff.people.length,
    };
  }

  /** Who can actually be reached: one plan row per person and channel, with a reason when they cannot. */
  private plan(people: Person[], channel: 'SMS' | 'EMAIL' | 'BOTH'): Plan[] {
    const channels: Channel[] = channel === 'BOTH' ? ['SMS', 'EMAIL'] : [channel];
    const seen = new Set<string>();
    const out: Plan[] = [];
    for (const p of people) {
      for (const ch of channels) {
        const raw = ch === 'SMS' ? p.phone : p.email;
        const address = raw ? (ch === 'SMS' ? normalizeMsisdn(raw) : raw.trim().toLowerCase()) : null;
        let error: string | undefined;
        if (!p.isActive) error = 'Account is switched off';
        else if (!address) error = ch === 'SMS' ? 'No phone number on file' : 'No email address on file';
        else if (seen.has(`${ch}:${address}`)) error = 'Same address as another recipient';
        if (address && !error) seen.add(`${ch}:${address}`);
        out.push({ key: p.key, farmerId: p.farmerId, userId: p.userId, kind: p.kind, name: p.name, channel: ch, address, status: error ? 'SKIPPED' : 'PENDING', error });
      }
    }
    return out;
  }

  private summarise(plan: Plan[]) {
    const reach = (ch: Channel) => plan.filter((p) => p.channel === ch && p.status === 'PENDING').length;
    return {
      farmers: new Set(plan.map((p) => p.key)).size,
      people: new Set(plan.map((p) => p.key)).size,
      sms: reach('SMS'), email: reach('EMAIL'),
      skipped: plan.filter((p) => p.status === 'SKIPPED').length,
      reasons: Object.entries(plan.filter((p) => p.error).reduce<Record<string, number>>((m, p) => ({ ...m, [`${p.channel === 'SMS' ? 'SMS' : 'Email'}: ${p.error}`]: (m[`${p.channel === 'SMS' ? 'SMS' : 'Email'}: ${p.error}`] ?? 0) + 1 }), {})).map(([reason, count]) => ({ reason, count })),
    };
  }

  /** What a send would do, before anyone commits to it. */
  async preview(actor: RequestUser, dto: AudienceDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const a = await this.audiencePeople(mamcosId, dto);
    return { ...this.summarise(this.plan(a.people, dto.channel)), label: a.label, channels: this.channels() };
  }

  private validate(dto: SendCommunicationDto) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Write the message first');
    if (dto.channel !== 'EMAIL' && body.length > SMS_LIMIT) throw new BadRequestException(`An SMS can be at most ${SMS_LIMIT} characters`);
    if (dto.channel !== 'SMS' && !dto.subject?.trim()) throw new BadRequestException('An email needs a subject');
    return body;
  }

  async send(actor: RequestUser, dto: SendCommunicationDto, mamcosIdParam?: string, options: { inline?: boolean } = {}) {
    return this.dispatch(this.tenant(actor, mamcosIdParam), dto, actor.id, options);
  }

  /** A message the system sends on its own (for example when a farm is put on M-LAX), recorded like any other with no human sender. */
  sendSystem(mamcosId: string, body: string, options: { inline?: boolean } = {}) {
    return this.dispatch(mamcosId, { audience: 'ALL', channel: 'SMS', body }, null, options);
  }

  private async dispatch(mamcosId: string, dto: SendCommunicationDto, sentById: string | null, options: { inline?: boolean }) {
    const body = this.validate(dto);
    const audience = await this.audiencePeople(mamcosId, dto);
    const plan = this.plan(audience.people, dto.channel);
    if (!plan.some((p) => p.status === 'PENDING')) throw new BadRequestException('None of the chosen recipients can be reached on that channel');

    const record = await this.prisma.$transaction(async (tx) => {
      const c = await tx.communication.create({
        data: {
          mamcosId, channel: dto.channel, audience: dto.audience, canalId: audience.canalId ?? null, blockId: audience.blockId ?? null, audienceLabel: audience.label, subject: dto.channel === 'SMS' ? null : dto.subject!.trim(), body,
          totalRecipients: plan.length, skippedCount: plan.filter((p) => p.status === 'SKIPPED').length, sentById,
        },
      });
      await tx.communicationRecipient.createMany({
        data: plan.map((p) => ({ communicationId: c.id, farmerId: p.farmerId, userId: p.userId, recipientName: p.name, recipientKind: p.kind, channel: p.channel, address: p.address, status: p.status, error: p.error ?? null })),
      });
      return c;
    });
    // Thousands of SMS take minutes: answer now, deliver in the background, and let the history page show progress.
    if (options.inline) await this.deliver(record.id);
    else setImmediate(() => { this.deliver(record.id).catch((e) => this.logger.error(`Delivery of ${record.id} failed: ${e instanceof Error ? e.message : e}`)); });
    return { ...record, summary: this.summarise(plan) };
  }

  /** Works through the pending recipients a few at a time, recording each outcome as it goes. */
  async deliver(id: string) {
    const c = await this.prisma.communication.findUniqueOrThrow({ where: { id } });
    const smsOn = this.sms.isConfigured();
    const emailOn = this.email.isConfigured();
    for (;;) {
      const batch = await this.prisma.communicationRecipient.findMany({
        where: { communicationId: id, status: 'PENDING' }, take: BATCH,
      });
      if (!batch.length) break;
      for (let i = 0; i < batch.length; i += PARALLEL) {
        await Promise.all(batch.slice(i, i + PARALLEL).map(async (r) => {
          const first = firstWord(r.recipientName ?? '');
          const text = personalise(c.body, first);
          let status: 'SENT' | 'SIMULATED' | 'FAILED' = 'SENT';
          let error: string | null = null;
          try {
            if (r.channel === 'SMS') {
              if (!smsOn) status = 'SIMULATED';
              else if (!(await this.sms.sendTransactional(r.address!, text, 'amcos_message'))) { status = 'FAILED'; error = 'The SMS provider did not accept the message'; }
            } else if (!emailOn) status = 'SIMULATED';
            else await this.email.send(r.address!, personalise(c.subject ?? '', first), text);
          } catch (e) { status = 'FAILED'; error = (e instanceof Error ? e.message : String(e)).slice(0, 200); }
          await this.prisma.communicationRecipient.update({ where: { id: r.id }, data: { status, error, sentAt: status === 'FAILED' ? null : new Date() } });
        }));
      }
      await this.refreshCounts(id);
    }
    await this.refreshCounts(id);
    await this.prisma.communication.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  }

  private async refreshCounts(id: string) {
    const rows = await this.prisma.communicationRecipient.groupBy({ by: ['status'], where: { communicationId: id }, _count: { _all: true } });
    const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
    await this.prisma.communication.update({ where: { id }, data: { sentCount: n('SENT'), simulatedCount: n('SIMULATED'), failedCount: n('FAILED'), skippedCount: n('SKIPPED') } });
  }

  async list(actor: RequestUser, q: PageQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const pageSize = Math.min(q.pageSize ?? 15, 100);
    const page = q.page ?? 1;
    const where = { mamcosId };
    const [total, rows] = await Promise.all([
      this.prisma.communication.count({ where }),
      this.prisma.communication.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const senders = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.sentById).filter((x): x is string => !!x) } }, select: { id: true, firstName: true, lastName: true, phone: true } });
    const name = new Map(senders.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.phone]));
    return { data: rows.map((r) => ({ ...r, sentBy: name.get(r.sentById ?? '') ?? null })), meta: { total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) } };
  }

  async get(actor: RequestUser, id: string, q: PageQueryDto) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const c = await this.prisma.communication.findFirst({ where: { id, mamcosId } });
    if (!c) throw new NotFoundException('Message not found');
    const pageSize = Math.min(q.pageSize ?? 50, 200);
    const page = q.page ?? 1;
    const where: Prisma.CommunicationRecipientWhereInput = { communicationId: id, ...(q.status ? { status: q.status as never } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.communicationRecipient.count({ where }),
      this.prisma.communicationRecipient.findMany({
        where, orderBy: [{ status: 'asc' }, { recipientName: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
        include: { farmer: { select: { firstName: true, lastName: true, controlNumber: true } } },
      }),
    ]);
    return {
      communication: c,
      recipients: rows.map((r) => ({ id: r.id, channel: r.channel, address: r.address, status: r.status, error: r.error, sentAt: r.sentAt, kind: r.recipientKind, farmer: { name: r.recipientName ?? (r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName}`.trim() : '—'), memberNumber: r.farmer?.controlNumber ?? null } })),
      meta: { total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) },
    };
  }
}
