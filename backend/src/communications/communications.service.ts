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
interface Plan { farmerId: string; channel: Channel; address: string | null; status: 'PENDING' | 'SKIPPED'; error?: string }
interface FarmerRow {
  id: string; firstName: string; lastName: string; email: string | null;
  user: { phone: string; email: string | null; isActive: boolean } | null;
}

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

  private async audienceFarmers(mamcosId: string, dto: AudienceDto): Promise<FarmerRow[]> {
    const select = { id: true, firstName: true, lastName: true, email: true, user: { select: { phone: true, email: true, isActive: true } } } as const;
    if (dto.audience === 'ALL') return this.prisma.farmer.findMany({ where: { mamcosId }, select, orderBy: { createdAt: 'asc' } });
    const ids = [...new Set(dto.farmerIds ?? [])];
    if (!ids.length) throw new BadRequestException('Choose at least one farmer');
    const rows = await this.prisma.farmer.findMany({ where: { id: { in: ids }, mamcosId }, select });
    if (rows.length !== ids.length) throw new BadRequestException('Some of the chosen farmers are not members of your AMCOS');
    return rows;
  }

  /** Who can actually be reached: one plan row per farmer and channel, with a reason when they cannot. */
  private plan(farmers: FarmerRow[], channel: 'SMS' | 'EMAIL' | 'BOTH'): Plan[] {
    const channels: Channel[] = channel === 'BOTH' ? ['SMS', 'EMAIL'] : [channel];
    const seen = new Set<string>();
    const out: Plan[] = [];
    for (const f of farmers) {
      for (const ch of channels) {
        const raw = ch === 'SMS' ? f.user?.phone : f.email ?? f.user?.email;
        const address = raw ? (ch === 'SMS' ? normalizeMsisdn(raw) : raw.trim().toLowerCase()) : null;
        let error: string | undefined;
        if (!f.user?.isActive) error = 'Account is switched off';
        else if (!address) error = ch === 'SMS' ? 'No phone number on file' : 'No email address on file';
        else if (seen.has(`${ch}:${address}`)) error = 'Same address as another recipient';
        if (address && !error) seen.add(`${ch}:${address}`);
        out.push({ farmerId: f.id, channel: ch, address, status: error ? 'SKIPPED' : 'PENDING', error });
      }
    }
    return out;
  }

  private summarise(plan: Plan[]) {
    const reach = (ch: Channel) => plan.filter((p) => p.channel === ch && p.status === 'PENDING').length;
    return {
      farmers: new Set(plan.map((p) => p.farmerId)).size,
      sms: reach('SMS'), email: reach('EMAIL'),
      skipped: plan.filter((p) => p.status === 'SKIPPED').length,
      reasons: Object.entries(plan.filter((p) => p.error).reduce<Record<string, number>>((m, p) => ({ ...m, [`${p.channel === 'SMS' ? 'SMS' : 'Email'}: ${p.error}`]: (m[`${p.channel === 'SMS' ? 'SMS' : 'Email'}: ${p.error}`] ?? 0) + 1 }), {})).map(([reason, count]) => ({ reason, count })),
    };
  }

  /** What a send would do, before anyone commits to it. */
  async preview(actor: RequestUser, dto: AudienceDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    return { ...this.summarise(this.plan(await this.audienceFarmers(mamcosId, dto), dto.channel)), channels: this.channels() };
  }

  private validate(dto: SendCommunicationDto) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Write the message first');
    if (dto.channel !== 'EMAIL' && body.length > SMS_LIMIT) throw new BadRequestException(`An SMS can be at most ${SMS_LIMIT} characters`);
    if (dto.channel !== 'SMS' && !dto.subject?.trim()) throw new BadRequestException('An email needs a subject');
    return body;
  }

  async send(actor: RequestUser, dto: SendCommunicationDto, mamcosIdParam?: string, options: { inline?: boolean } = {}) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const body = this.validate(dto);
    const plan = this.plan(await this.audienceFarmers(mamcosId, dto), dto.channel);
    if (!plan.some((p) => p.status === 'PENDING')) throw new BadRequestException('None of the chosen farmers can be reached on that channel');

    const record = await this.prisma.$transaction(async (tx) => {
      const c = await tx.communication.create({
        data: {
          mamcosId, channel: dto.channel, audience: dto.audience, subject: dto.channel === 'SMS' ? null : dto.subject!.trim(), body,
          totalRecipients: plan.length, skippedCount: plan.filter((p) => p.status === 'SKIPPED').length, sentById: actor.id,
        },
      });
      await tx.communicationRecipient.createMany({
        data: plan.map((p) => ({ communicationId: c.id, farmerId: p.farmerId, channel: p.channel, address: p.address, status: p.status, error: p.error ?? null })),
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
        include: { farmer: { select: { firstName: true } } },
      });
      if (!batch.length) break;
      for (let i = 0; i < batch.length; i += PARALLEL) {
        await Promise.all(batch.slice(i, i + PARALLEL).map(async (r) => {
          const text = personalise(c.body, r.farmer.firstName);
          let status: 'SENT' | 'SIMULATED' | 'FAILED' = 'SENT';
          let error: string | null = null;
          try {
            if (r.channel === 'SMS') {
              if (!smsOn) status = 'SIMULATED';
              else if (!(await this.sms.sendTransactional(r.address!, text, 'amcos_message'))) { status = 'FAILED'; error = 'The SMS provider did not accept the message'; }
            } else if (!emailOn) status = 'SIMULATED';
            else await this.email.send(r.address!, personalise(c.subject ?? '', r.farmer.firstName), text);
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
        where, orderBy: [{ status: 'asc' }, { farmer: { firstName: 'asc' } }], skip: (page - 1) * pageSize, take: pageSize,
        include: { farmer: { select: { firstName: true, lastName: true, controlNumber: true } } },
      }),
    ]);
    return {
      communication: c,
      recipients: rows.map((r) => ({ id: r.id, channel: r.channel, address: r.address, status: r.status, error: r.error, sentAt: r.sentAt, farmer: { name: `${r.farmer.firstName} ${r.farmer.lastName}`.trim(), memberNumber: r.farmer.controlNumber } })),
      meta: { total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) },
    };
  }
}
