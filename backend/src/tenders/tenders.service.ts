import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TenderStatus } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ContractorsService } from './contractors.service';
import { scoreBids, type Scored } from './tender-scoring';
import { BidDto, CreateTenderDto, RecommendDto } from './dto/tenders.dto';
import { awarded, bidReceived, cancelled, newTender, notSelected, toLang, type Msg } from './tenders.messages';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const bidCode = () => `B-${Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')}`;
const DEFAULTS = { wPrice: 60, wEquipment: 15, wExperience: 10, wPerformance: 15 };
/** What the public portal shows: open for bids, being evaluated, awarded, and finished (the record of who won what stays visible). */
const LIVE: TenderStatus[] = ['OPEN', 'EVALUATION', 'AWARDED', 'COMPLETED'];

/**
 * Infrastructure tenders. The AMCOS publishes; registered contractors bid with sealed offers; the system opens the bids on the
 * closing day and ranks them without names; the Procurement Officer recommends and the Manager signs off, so no single person
 * awards a contract. Every step goes into an append-only record.
 */
@Injectable()
export class TendersService {
  private readonly logger = new Logger(TendersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
    private readonly contractors: ContractorsService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only work with the tenders of your own cooperative');
    return id;
  }

  async event(db: Prisma.TransactionClient | PrismaService, tenderId: string, kind: string, actorId: string | null, detail?: string | null) {
    await db.tenderEvent.create({ data: { tenderId, kind, actorId, detail: detail ?? null } });
  }

  private async tell(people: { phone: string | null; userId?: string | null; language?: string | null }[], make: (lang: ReturnType<typeof toLang>) => Msg) {
    for (const p of people) {
      try {
        const m = make(toLang(p.language));
        if (p.userId) await this.notifications.create({ userId: p.userId, type: 'tender', title: m.title, body: m.body }).catch(() => undefined);
        if (p.phone) await this.sms.send(p.phone, m.body, 'tender');
      } catch (e) { this.logger.warn(`Could not send a tender message: ${e instanceof Error ? e.message : e}`); }
    }
  }

  private async contractorPeople(contractorIds: string[]) {
    const rows = await this.prisma.contractor.findMany({ where: { id: { in: contractorIds } }, select: { phone: true, userId: true } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, language: true } });
    const lang = new Map(users.map((u) => [u.id, u.language]));
    return rows.map((r) => ({ phone: r.phone, userId: r.userId, language: lang.get(r.userId) ?? 'sw' }));
  }

  /** The canals and blocks a tender can be about: no irrigation permission needed, so a Procurement Officer can pick them. */
  async structure(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const canals = await this.prisma.irrigationCanal.findMany({ where: { scheme: { mamcosId }, archivedAt: null }, orderBy: { canalNumber: 'asc' }, select: { id: true, code: true, name: true } });
    const blocks = await this.prisma.irrigationBlock.findMany({ where: { canal: { scheme: { mamcosId } }, archivedAt: null }, orderBy: [{ canal: { canalNumber: 'asc' } }, { blockNumber: 'asc' }], select: { id: true, code: true, canalId: true } });
    return { canals, blocks };
  }

  // ───────────────────────── creating and publishing ─────────────────────────

  async create(actor: RequestUser, dto: CreateTenderDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const w = { wPrice: dto.wPrice ?? DEFAULTS.wPrice, wEquipment: dto.wEquipment ?? DEFAULTS.wEquipment, wExperience: dto.wExperience ?? DEFAULTS.wExperience, wPerformance: dto.wPerformance ?? DEFAULTS.wPerformance };
    const given = [dto.wPrice, dto.wEquipment, dto.wExperience, dto.wPerformance].filter((x) => x != null).length;
    if (given > 0 && given < 4) throw new BadRequestException('Give all four evaluation weights, or none to use the defaults');
    if (w.wPrice + w.wEquipment + w.wExperience + w.wPerformance !== 100) throw new BadRequestException('The evaluation weights must add up to 100');
    if (dto.milestones.reduce((n, m) => n + m.percent, 0) !== 100) throw new BadRequestException('The payment milestones must add up to 100%');
    const opensAt = new Date(dto.opensAt); const closesAt = new Date(dto.closesAt);
    if (Number.isNaN(+opensAt) || Number.isNaN(+closesAt)) throw new BadRequestException('Choose valid opening and closing dates');
    if (closesAt <= opensAt) throw new BadRequestException('Bids must close after they open');
    if (closesAt.getTime() < Date.now() + 3_600_000) throw new BadRequestException('Bids must stay open for at least an hour from now');
    const blockIds = [...new Set(dto.blockIds ?? [])];
    if (!dto.canalId && !blockIds.length) throw new BadRequestException('Choose the canal or the blocks the work is on, so their chairmen can inspect it');
    if (dto.canalId && !(await this.prisma.irrigationCanal.findFirst({ where: { id: dto.canalId, scheme: { mamcosId } }, select: { id: true } }))) throw new NotFoundException('Canal not found');
    if (blockIds.length) {
      const blocks = await this.prisma.irrigationBlock.findMany({ where: { id: { in: blockIds }, canal: { scheme: { mamcosId }, ...(dto.canalId ? { id: dto.canalId } : {}) } }, select: { id: true } });
      if (blocks.length !== blockIds.length) throw new BadRequestException('Some blocks do not belong to this canal or AMCOS');
    }
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < 4; attempt++) {
      const count = await this.prisma.tender.count({ where: { mamcosId, reference: { startsWith: `TND-${year}-` } } });
      const reference = `TND-${year}-${String(count + 1 + attempt).padStart(3, '0')}`;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const t = await tx.tender.create({
            data: {
              mamcosId, reference, title: dto.title.trim(), scope: dto.scope.trim(), category: dto.category, canalId: dto.canalId ?? null, blockIds,
              budgetCeiling: dto.budgetCeiling, opensAt, closesAt, requiredEquipment: dto.requiredEquipment ?? 1, ...w, createdById: actor.id,
              milestones: { create: dto.milestones.map((m, i) => ({ number: i + 1, title: m.title.trim(), percent: m.percent })) },
            },
          });
          await this.event(tx, t.id, 'CREATED', actor.id, `Budget ceiling ${cents(dto.budgetCeiling)}; closes ${closesAt.toISOString()}`);
          return { id: t.id, reference: t.reference, status: t.status };
        });
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    throw new ConflictException('Could not number the tender. Try again');
  }

  private async mine(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const t = await this.prisma.tender.findFirst({ where: { id, mamcosId } });
    if (!t) throw new NotFoundException('Tender not found');
    return t;
  }

  /** Who must be able to inspect this work: the leaders of its blocks, and of its canal. */
  async relevantLeaders(t: { canalId: string | null; blockIds: string[] }) {
    const blocks = t.blockIds.length ? await this.prisma.irrigationBlock.findMany({ where: { id: { in: t.blockIds } }, select: { canalId: true } }) : [];
    const canalIds = [...new Set([...(t.canalId ? [t.canalId] : []), ...blocks.map((b) => b.canalId)])];
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const rows = await this.prisma.irrigationLeadership.findMany({
      where: {
        status: 'ACTIVE', AND: [{ OR: [{ termEnd: null }, { termEnd: { gte: today } }] },
          { OR: [...(t.blockIds.length ? [{ position: 'BLOCK_LEADER' as const, blockId: { in: t.blockIds } }] : []), { position: 'CANAL_LEADER' as const, canalId: { in: canalIds } }] }],
      },
      select: { farmerId: true, position: true, farmer: { select: { user: { select: { id: true, phone: true, language: true } } } } },
    });
    return rows.map((r) => ({ farmerId: r.farmerId, position: r.position, userId: r.farmer.user?.id ?? null, phone: r.farmer.user?.phone ?? null, language: r.farmer.user?.language ?? 'sw' }));
  }

  async publish(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    if (t.status !== 'DRAFT') throw new ConflictException('Only a draft can be published');
    if (t.closesAt.getTime() < Date.now() + 3_600_000) throw new ConflictException('The closing time is too close or has passed: create the tender again with new dates');
    if (!(await this.relevantLeaders(t)).length) throw new ConflictException('Appoint a canal or block leader for this work first: they inspect it and sign off each milestone');
    const claimed = await this.prisma.tender.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'OPEN', publishedAt: new Date() } });
    if (!claimed.count) throw new ConflictException('Only a draft can be published');
    await this.event(this.prisma, id, 'PUBLISHED', actor.id, `Opens ${t.opensAt.toISOString()}, closes ${t.closesAt.toISOString()}`);
    const mamcos = await this.prisma.mamcos.findUnique({ where: { id: t.mamcosId }, select: { name: true } });
    const vettedContractors = await this.prisma.contractor.findMany({ where: { status: 'VETTED' }, select: { id: true } });
    await this.tell(await this.contractorPeople(vettedContractors.map((c) => c.id)), (lang) => newTender(lang, { reference: t.reference, title: t.title, ceiling: num(t.budgetCeiling), closesAt: t.closesAt, amcos: mamcos?.name ?? '' }));
    return { id, status: 'OPEN' };
  }

  async cancel(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    if (!['DRAFT', 'OPEN', 'EVALUATION'].includes(t.status)) throw new ConflictException(t.status === 'CANCELLED' ? 'This tender is already cancelled' : 'A contract is already in force: it cannot be cancelled here');
    if (reason.trim().length < 3) throw new BadRequestException('Say why the tender is cancelled');
    const claimed = await this.prisma.tender.updateMany({ where: { id, status: { in: ['DRAFT', 'OPEN', 'EVALUATION'] } }, data: { status: 'CANCELLED', cancelReason: reason.trim() } });
    if (!claimed.count) throw new ConflictException('This tender can no longer be cancelled');
    await this.event(this.prisma, id, 'CANCELLED', actor.id, reason.trim());
    const bids = await this.prisma.tenderBid.findMany({ where: { tenderId: id, status: 'SUBMITTED' }, select: { contractorId: true } });
    await this.tell(await this.contractorPeople(bids.map((b) => b.contractorId)), (lang) => cancelled(lang, { reference: t.reference, title: t.title, reason: reason.trim() }));
    return { id, status: 'CANCELLED' };
  }

  // ───────────────────────── bidding (the contractor's side) ─────────────────────────

  async submitBid(actor: RequestUser, tenderId: string, dto: BidDto) {
    const contractor = await this.contractors.forUser(actor.id);
    if (contractor.status !== 'VETTED') throw new ForbiddenException(contractor.status === 'PENDING' ? 'Your registration is still being checked. You can bid once it is approved' : 'Your registration does not allow bidding');
    const t = await this.prisma.tender.findUnique({ where: { id: tenderId } });
    if (!t || t.status !== 'OPEN') throw new NotFoundException('This tender is not open for bids');
    const now = Date.now();
    if (now < +t.opensAt) throw new ConflictException('Bids are not open yet');
    if (now >= +t.closesAt) throw new ConflictException('Bids have closed');
    if (dto.price > num(t.budgetCeiling)) throw new BadRequestException('Your price is above the budget ceiling, so it cannot be accepted');
    const existing = await this.prisma.tenderBid.findUnique({ where: { tenderId_contractorId: { tenderId, contractorId: contractor.id } } });
    const data = { price: cents(dto.price), technicalProposal: dto.technicalProposal.trim(), equipmentOffered: dto.equipmentOffered, completionDays: dto.completionDays, documentUrls: dto.documentUrls ?? [], status: 'SUBMITTED' as const };
    let bid;
    if (existing) {
      bid = await this.prisma.tenderBid.update({ where: { id: existing.id }, data });
      await this.event(this.prisma, tenderId, 'BID_CHANGED', null, `Bid ${bid.code} was changed`);
    } else {
      for (let attempt = 0; ; attempt++) {
        try { bid = await this.prisma.tenderBid.create({ data: { tenderId, contractorId: contractor.id, code: bidCode(), ...data } }); break; }
        catch (e: any) { if (e?.code !== 'P2002' || attempt > 5) throw e; }
      }
      await this.event(this.prisma, tenderId, 'BID_RECEIVED', null, `Bid ${bid.code} received`); // no name: the bids are sealed
    }
    await this.tell(await this.contractorPeople([contractor.id]), (lang) => bidReceived(lang, { reference: t.reference, title: t.title, code: bid!.code }));
    return { id: bid.id, code: bid.code, status: bid.status };
  }

  async withdrawBid(actor: RequestUser, tenderId: string) {
    const contractor = await this.contractors.forUser(actor.id);
    const t = await this.prisma.tender.findUnique({ where: { id: tenderId } });
    if (!t || t.status !== 'OPEN' || Date.now() >= +t.closesAt) throw new ConflictException('Bids can only be withdrawn while the tender is open');
    const bid = await this.prisma.tenderBid.findUnique({ where: { tenderId_contractorId: { tenderId, contractorId: contractor.id } } });
    if (!bid || bid.status !== 'SUBMITTED') throw new NotFoundException('You have no bid on this tender');
    await this.prisma.tenderBid.update({ where: { id: bid.id }, data: { status: 'WITHDRAWN' } });
    await this.event(this.prisma, tenderId, 'BID_WITHDRAWN', null, `Bid ${bid.code} was withdrawn`);
    return { withdrawn: true };
  }

  private tenderCard(t: Prisma.TenderGetPayload<{ include: { milestones: true; mamcos: { select: { name: true } } } }>) {
    return {
      id: t.id, reference: t.reference, title: t.title, scope: t.scope, category: t.category, status: t.status, amcos: t.mamcos.name,
      budgetCeiling: num(t.budgetCeiling), opensAt: t.opensAt, closesAt: t.closesAt, requiredEquipment: t.requiredEquipment,
      criteria: { price: t.wPrice, equipment: t.wEquipment, experience: t.wExperience, performance: t.wPerformance },
      milestones: t.milestones.sort((a, b) => a.number - b.number).map((m) => ({ number: m.number, title: m.title, percent: m.percent })),
    };
  }

  /** Open tenders for contractors, from every AMCOS, with the contractor's own bid on each. */
  async openForContractor(actor: RequestUser) {
    const c = await this.contractors.forUser(actor.id);
    const rows = await this.prisma.tender.findMany({ where: { status: 'OPEN', closesAt: { gt: new Date() } }, orderBy: { closesAt: 'asc' }, include: { milestones: true, mamcos: { select: { name: true } } }, take: 100 });
    const mine = await this.prisma.tenderBid.findMany({ where: { contractorId: c.id, tenderId: { in: rows.map((r) => r.id) } } });
    const bidOf = new Map(mine.map((b) => [b.tenderId, b]));
    return { contractor: { status: c.status }, data: rows.map((t) => ({ ...this.tenderCard(t), myBid: bidOf.get(t.id) ? this.ownBid(bidOf.get(t.id)!) : null })) };
  }

  private ownBid(b: Prisma.TenderBidGetPayload<object>) {
    return { id: b.id, code: b.code, status: b.status, price: num(b.price), technicalProposal: b.technicalProposal, equipmentOffered: b.equipmentOffered, completionDays: b.completionDays, documentUrls: b.documentUrls, submittedAt: b.submittedAt };
  }

  async myBids(actor: RequestUser) {
    const c = await this.contractors.forUser(actor.id);
    const bids = await this.prisma.tenderBid.findMany({ where: { contractorId: c.id }, orderBy: { submittedAt: 'desc' }, include: { tender: { select: { id: true, reference: true, title: true, status: true, closesAt: true, awardedBidId: true } } }, take: 100 });
    return { data: bids.map((b) => ({ ...this.ownBid(b), tender: { id: b.tender.id, reference: b.tender.reference, title: b.tender.title, status: b.tender.status, closesAt: b.tender.closesAt }, won: b.tender.awardedBidId === b.id, lost: !!b.tender.awardedBidId && b.tender.awardedBidId !== b.id })) };
  }

  async myContracts(actor: RequestUser) {
    const c = await this.contractors.forUser(actor.id);
    const rows = await this.prisma.tender.findMany({ where: { contractorId: c.id }, orderBy: { approvedAt: 'desc' }, include: { milestones: true, mamcos: { select: { name: true } } } });
    return { data: rows.map((t) => ({ ...this.tenderCard(t), contractPrice: num(t.contractPrice), completedAt: t.completedAt, rating: t.rating,
      milestones: t.milestones.sort((a, b) => a.number - b.number).map((m) => ({ id: m.id, number: m.number, title: m.title, percent: m.percent, amount: m.amount == null ? null : num(m.amount), status: m.status, reworkNote: m.reworkNote, signOffNote: m.signOffNote, paidAt: m.paidAt, paidReference: m.paidReference })) })) };
  }

  // ───────────────────────── the office ─────────────────────────

  async list(actor: RequestUser, q: { status?: string; mamcosId?: string }) {
    const mamcosId = this.tenant(actor, q.mamcosId);
    const rows = await this.prisma.tender.findMany({
      where: { mamcosId, ...(q.status && q.status !== 'ALL' ? { status: q.status as TenderStatus } : {}) }, orderBy: { createdAt: 'desc' }, take: 100,
      include: { _count: { select: { bids: { where: { status: 'SUBMITTED' } } } }, milestones: { select: { status: true } } },
    });
    return { data: rows.map((t) => ({
      id: t.id, reference: t.reference, title: t.title, category: t.category, status: t.status, budgetCeiling: num(t.budgetCeiling), opensAt: t.opensAt, closesAt: t.closesAt,
      bids: t._count.bids, sealed: !t.bidsOpenedAt, contractPrice: t.contractPrice == null ? null : num(t.contractPrice),
      milestonesPaid: t.milestones.filter((m) => m.status === 'PAID').length, milestones: t.milestones.length,
    })) };
  }

  /**
   * Everything about one tender. While the bids are sealed the office sees only how many arrived; once opened, bids appear
   * ranked and anonymous (B-XXXX) until one is recommended.
   */
  async detail(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    const full = await this.prisma.tender.findUniqueOrThrow({ where: { id }, include: { milestones: true, mamcos: { select: { name: true } }, contractor: { select: { id: true, name: true, phone: true, kind: true, payoutMethod: true, payoutAccount: true, payoutName: true } } } });
    const events = await this.prisma.tenderEvent.findMany({ where: { tenderId: id }, orderBy: { createdAt: 'asc' } });
    const submitted = await this.prisma.tenderBid.count({ where: { tenderId: id, status: 'SUBMITTED' } });
    const revealed = !!t.recommendedBidId || ['AWARDED', 'COMPLETED'].includes(t.status);
    const ranking = t.bidsOpenedAt ? await this.ranking(t, revealed) : null;
    return {
      ...this.tenderCard(full), createdAt: t.createdAt, publishedAt: t.publishedAt, bidsOpenedAt: t.bidsOpenedAt, sealed: !t.bidsOpenedAt, bidCount: submitted,
      closed: Date.now() >= +t.closesAt, canalId: t.canalId, blockIds: t.blockIds, cancelReason: t.cancelReason,
      recommended: t.recommendedBidId ? { bidId: t.recommendedBidId, by: t.recommendedById, at: t.recommendedAt, note: t.recommendNote } : null,
      approvedAt: t.approvedAt, approvedById: t.approvedById, createdById: t.createdById, contractPrice: t.contractPrice == null ? null : num(t.contractPrice), rating: t.rating, completedAt: t.completedAt,
      contractor: revealed || ['AWARDED', 'COMPLETED'].includes(t.status) ? full.contractor : null,
      bids: ranking, 
      milestones: full.milestones.sort((a, b) => a.number - b.number).map((m) => ({
        id: m.id, number: m.number, title: m.title, percent: m.percent, amount: m.amount == null ? null : num(m.amount), status: m.status, submittedAt: m.submittedAt, submitNote: m.submitNote, evidenceUrls: m.evidenceUrls,
        reworkNote: m.reworkNote, signedOffAt: m.signedOffAt, signOffNote: m.signOffNote, approvedAt: m.approvedAt, paidAt: m.paidAt, paidMethod: m.paidMethod, paidReference: m.paidReference,
      })),
      events: events.map((e) => ({ id: e.id, kind: e.kind, detail: e.detail, actorId: e.actorId, at: e.createdAt })),
    };
  }

  /** Scored bids, best first. Names appear only when `revealed`. */
  private async ranking(t: Prisma.TenderGetPayload<object>, revealed: boolean) {
    const bids = await this.prisma.tenderBid.findMany({ where: { tenderId: t.id, status: 'SUBMITTED' }, include: { contractor: { select: { id: true, name: true, kind: true, yearsExperience: true, phone: true } } } });
    const history = await this.prisma.tender.groupBy({ by: ['contractorId'], where: { contractorId: { in: bids.map((b) => b.contractorId) }, status: 'COMPLETED' }, _count: true, _avg: { rating: true } });
    const past = new Map(history.map((h) => [h.contractorId, h]));
    const scored = scoreBids(bids.map((b) => ({ id: b.id, price: num(b.price), equipmentOffered: b.equipmentOffered, yearsExperience: b.contractor.yearsExperience, pastRating: past.get(b.contractorId)?._avg.rating ?? null, submittedAt: b.submittedAt })), t);
    const byId = new Map(bids.map((b) => [b.id, b]));
    return scored.map((s: Scored) => {
      const b = byId.get(s.id)!;
      return {
        id: b.id, code: b.code, rank: s.rank, total: s.total, parts: s.parts, price: num(b.price), completionDays: b.completionDays, equipmentOffered: b.equipmentOffered, yearsExperience: s.yearsExperience,
        completedContracts: past.get(b.contractorId)?._count ?? 0, pastRating: s.pastRating == null ? null : Math.round(s.pastRating * 10) / 10,
        technicalProposal: b.technicalProposal, documentUrls: b.documentUrls, submittedAt: b.submittedAt,
        contractor: revealed ? { id: b.contractor.id, name: b.contractor.name, kind: b.contractor.kind, phone: b.contractor.phone } : null,
      };
    });
  }

  /** After the closing time the office opens the sealed bids, once, and the tender moves to evaluation. */
  async openBids(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    if (t.status !== 'OPEN') throw new ConflictException('Only an open tender has sealed bids to open');
    if (Date.now() < +t.closesAt) throw new ConflictException(`The bids stay sealed until the closing time (${t.closesAt.toISOString().slice(0, 16).replace('T', ' ')} UTC)`);
    const claimed = await this.prisma.tender.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'EVALUATION', bidsOpenedAt: new Date(), bidsOpenedById: actor.id } });
    if (!claimed.count) throw new ConflictException('The bids are already open');
    const n = await this.prisma.tenderBid.count({ where: { tenderId: id, status: 'SUBMITTED' } });
    await this.event(this.prisma, id, 'BIDS_OPENED', actor.id, `${n} bid(s) opened and ranked`);
    return this.detail(actor, id, mamcosIdParam);
  }

  /** The Procurement Officer proposes the winner. Picking anyone but the top-ranked bid needs a written reason. */
  async recommend(actor: RequestUser, id: string, dto: RecommendDto, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    if (t.status !== 'EVALUATION') throw new ConflictException('Open the bids first');
    if (t.recommendedBidId) throw new ConflictException('A bid is already recommended and waiting for the Manager');
    const ranked = await this.ranking(t, false);
    const chosen = ranked.find((b) => b.id === dto.bidId);
    if (!chosen) throw new NotFoundException('Bid not found');
    if (chosen.rank !== 1 && (dto.note?.trim().length ?? 0) < 20) throw new BadRequestException('This is not the top-ranked bid. Write the reason for choosing it (at least 20 characters)');
    await this.prisma.tender.update({ where: { id }, data: { recommendedBidId: chosen.id, recommendedById: actor.id, recommendedAt: new Date(), recommendNote: dto.note?.trim() || null } });
    await this.event(this.prisma, id, 'RECOMMENDED', actor.id, `Bid ${chosen.code}, rank ${chosen.rank} of ${ranked.length}, score ${chosen.total}${dto.note?.trim() ? `. Reason: ${dto.note.trim()}` : ''}`);
    return this.detail(actor, id, mamcosIdParam);
  }

  /** The Manager sends the recommendation back (with a reason); the Procurement Officer must choose again. */
  async returnRecommendation(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    if (t.status !== 'EVALUATION' || !t.recommendedBidId) throw new ConflictException('There is no recommendation to send back');
    if (reason.trim().length < 5) throw new BadRequestException('Say why it is sent back');
    await this.prisma.tender.update({ where: { id }, data: { recommendedBidId: null, recommendedById: null, recommendedAt: null, recommendNote: null } });
    await this.event(this.prisma, id, 'RECOMMENDATION_RETURNED', actor.id, reason.trim());
    return this.detail(actor, id, mamcosIdParam);
  }

  /** The Manager's sign-off: the contract is awarded, the milestone amounts are fixed, and every bidder is told. Not the person who recommended. */
  async approve(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    if (t.status !== 'EVALUATION' || !t.recommendedBidId) throw new ConflictException('There is no recommended bid to approve');
    if (t.recommendedById === actor.id) throw new ConflictException('The award must be signed off by someone other than the person who recommended it');
    const bid = await this.prisma.tenderBid.findUniqueOrThrow({ where: { id: t.recommendedBidId }, include: { contractor: { select: { id: true, status: true } } } });
    if (bid.contractor.status !== 'VETTED') throw new ConflictException('This contractor is no longer approved to take contracts');
    const price = num(bid.price);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tender.updateMany({ where: { id, status: 'EVALUATION', recommendedBidId: bid.id }, data: { status: 'AWARDED', approvedById: actor.id, approvedAt: new Date(), awardedBidId: bid.id, contractorId: bid.contractorId, contractPrice: price } });
      if (!claimed.count) throw new ConflictException('This tender has changed. Reload and try again');
      const milestones = await tx.tenderMilestone.findMany({ where: { tenderId: id }, orderBy: { number: 'asc' } });
      let given = 0;
      for (const [i, m] of milestones.entries()) {
        const amount = i === milestones.length - 1 ? cents(price - given) : cents((price * m.percent) / 100); // the last one absorbs the rounding
        given = cents(given + amount);
        await tx.tenderMilestone.update({ where: { id: m.id }, data: { amount } });
      }
      await this.event(tx, id, 'AWARDED', actor.id, `Bid ${bid.code} awarded at ${price}`);
    });
    const losers = await this.prisma.tenderBid.findMany({ where: { tenderId: id, status: 'SUBMITTED', id: { not: bid.id } }, select: { contractorId: true } });
    await this.tell(await this.contractorPeople([bid.contractorId]), (lang) => awarded(lang, { reference: t.reference, title: t.title, price }));
    await this.tell(await this.contractorPeople(losers.map((l) => l.contractorId)), (lang) => notSelected(lang, { reference: t.reference, title: t.title }));
    return this.detail(actor, id, mamcosIdParam);
  }

  /** When the work is done the Manager rates the contractor 1 to 5; the rating counts in their future bids. */
  async rate(actor: RequestUser, id: string, rating: number, mamcosIdParam?: string) {
    const t = await this.mine(actor, id, mamcosIdParam);
    if (t.status !== 'COMPLETED') throw new ConflictException('Rate the contractor once every milestone is paid');
    if (t.rating != null) throw new ConflictException('This contract has already been rated');
    await this.prisma.tender.update({ where: { id }, data: { rating } });
    await this.event(this.prisma, id, 'RATED', actor.id, `${rating} out of 5`);
    return { id, rating };
  }

  // ───────────────────────── the public portal ─────────────────────────

  /** Open tenders for anyone to read, with no sign-in: what is wanted, the ceiling, the dates, the criteria and the payment plan. */
  async publicList() {
    const rows = await this.prisma.tender.findMany({ where: { status: { in: LIVE as TenderStatus[] } }, orderBy: { publishedAt: 'desc' }, take: 100, include: { milestones: true, mamcos: { select: { name: true } } } });
    return { data: rows.map((t) => ({ ...this.tenderCard(t), awarded: t.status === 'AWARDED' || t.status === 'COMPLETED', open: t.status === 'OPEN' && t.closesAt > new Date() })) };
  }

  async publicOne(id: string) {
    const t = await this.prisma.tender.findFirst({ where: { id, status: { in: LIVE as TenderStatus[] } }, include: { milestones: true, mamcos: { select: { name: true } } } });
    if (!t) throw new NotFoundException('Tender not found');
    return { ...this.tenderCard(t), awarded: t.status === 'AWARDED' || t.status === 'COMPLETED', open: t.status === 'OPEN' && t.closesAt > new Date() };
  }
}
