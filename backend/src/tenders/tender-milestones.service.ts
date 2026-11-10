import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { resolveCashAccount } from '../accounting/cash-resolve';
import { SmsService } from '../messaging/sms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { localDate } from '../accounting/tax';
import { ContractorsService } from './contractors.service';
import { TendersService } from './tenders.service';
import { PayMilestoneDto, SubmitMilestoneDto } from './dto/tenders.dto';
import { milestoneReady, paid, reworkAsked, toLang, type Msg } from './tenders.messages';

const num = (v: unknown) => (v == null ? 0 : Number(v));

/**
 * Work on an awarded contract, one milestone at a time: the contractor says it is done, a canal or block chairman inspects and signs
 * off, the Manager approves the payment, and the Accountant pays and books it. Three different people, in that order.
 */
@Injectable()
export class TenderMilestonesService {
  private readonly logger = new Logger(TenderMilestonesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly accounting: AccountingService,
    private readonly sms: SmsService,
    private readonly notifications: NotificationsService,
    private readonly contractors: ContractorsService,
    private readonly tenders: TendersService,
  ) {}

  private async send(phone: string | null | undefined, userId: string | null | undefined, msg: Msg) {
    try {
      if (userId) await this.notifications.create({ userId, type: 'tender', title: msg.title, body: msg.body }).catch(() => undefined);
      if (phone) await this.sms.send(phone, msg.body, 'tender');
    } catch (e) { this.logger.warn(`Could not send a milestone message: ${e instanceof Error ? e.message : e}`); }
  }

  private async load(id: string) {
    const m = await this.prisma.tenderMilestone.findUnique({ where: { id }, include: { tender: true } });
    if (!m) throw new NotFoundException('Milestone not found');
    return m;
  }

  private tenantOf(actor: RequestUser, tender: { mamcosId: string }) {
    const own = this.ownership.resolveTenantMamcosId(actor);
    if (own && own !== tender.mamcosId) throw new NotFoundException('Milestone not found');
    return tender.mamcosId;
  }

  private async contractorMessage(contractorId: string, make: (lang: ReturnType<typeof toLang>) => Msg) {
    const c = await this.prisma.contractor.findUnique({ where: { id: contractorId }, select: { phone: true, userId: true } });
    if (!c) return;
    const u = await this.prisma.user.findUnique({ where: { id: c.userId }, select: { language: true } });
    await this.send(c.phone, c.userId, make(toLang(u?.language)));
  }

  // ───────────────────────── the contractor ─────────────────────────

  async submit(actor: RequestUser, id: string, dto: SubmitMilestoneDto) {
    const contractor = await this.contractors.forUser(actor.id);
    const m = await this.load(id);
    if (m.tender.contractorId !== contractor.id || m.tender.status !== 'AWARDED') throw new NotFoundException('Milestone not found');
    if (contractor.status !== 'VETTED') throw new ForbiddenException('Your registration does not allow this');
    if (m.status !== 'PENDING') throw new ConflictException(m.status === 'SUBMITTED' ? 'This milestone is already waiting for inspection' : 'This milestone is already done');
    if (m.number > 1) {
      const before = await this.prisma.tenderMilestone.findUnique({ where: { tenderId_number: { tenderId: m.tenderId, number: m.number - 1 } } });
      if (before && before.status === 'PENDING') throw new ConflictException('Finish and submit the earlier milestone first');
      if (before && before.status === 'SUBMITTED') throw new ConflictException('The earlier milestone is still waiting for inspection');
    }
    const claimed = await this.prisma.tenderMilestone.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'SUBMITTED', submittedAt: new Date(), submitNote: dto.note.trim(), evidenceUrls: dto.evidenceUrls ?? [], reworkNote: null } });
    if (!claimed.count) throw new ConflictException('This milestone has changed. Reload and try again');
    await this.tenders.event(this.prisma, m.tenderId, 'MILESTONE_SUBMITTED', actor.id, `Milestone ${m.number}: ${m.title}`);
    for (const l of await this.tenders.relevantLeaders(m.tender)) await this.send(l.phone, l.userId, milestoneReady(toLang(l.language), { reference: m.tender.reference, title: m.tender.title, milestone: m.title, contractor: contractor.name }));
    return { id, status: 'SUBMITTED' };
  }

  // ───────────────────────── the chairman ─────────────────────────

  /** Only a canal or block leader of the place the work is on may inspect it. Being a Manager or Admin is not enough. */
  private async assertChairman(actor: RequestUser, tender: { canalId: string | null; blockIds: string[] }) {
    const leaders = await this.tenders.relevantLeaders(tender);
    if (!leaders.some((l) => l.userId === actor.id)) throw new ForbiddenException('Only the canal or block chairman of the place this work is on can inspect and sign off');
  }

  /** Milestones waiting for the signed-in chairman. */
  async forChairman(actor: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true, mamcosId: true } });
    if (!farmer?.mamcosId) return { data: [] };
    const tenders = await this.prisma.tender.findMany({ where: { mamcosId: farmer.mamcosId, status: 'AWARDED' }, include: { milestones: true, contractor: { select: { name: true } } } });
    const out: any[] = [];
    for (const t of tenders) {
      if (!(await this.tenders.relevantLeaders(t)).some((l) => l.farmerId === farmer.id)) continue;
      for (const m of t.milestones.filter((x) => x.status === 'SUBMITTED').sort((a, b) => a.number - b.number)) {
        out.push({ id: m.id, tenderId: t.id, reference: t.reference, title: t.title, milestone: m.title, number: m.number, amount: m.amount == null ? null : num(m.amount), contractor: t.contractor?.name ?? null, submittedAt: m.submittedAt, submitNote: m.submitNote, evidenceUrls: m.evidenceUrls });
      }
    }
    return { data: out };
  }

  async signOff(actor: RequestUser, id: string, note: string) {
    const m = await this.load(id);
    this.tenantOf(actor, m.tender);
    await this.assertChairman(actor, m.tender);
    if (m.status !== 'SUBMITTED') throw new ConflictException('Only a milestone the contractor has submitted can be signed off');
    const claimed = await this.prisma.tenderMilestone.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'SIGNED_OFF', signedOffById: actor.id, signedOffAt: new Date(), signOffNote: note.trim() } });
    if (!claimed.count) throw new ConflictException('This milestone has changed. Reload and try again');
    await this.tenders.event(this.prisma, m.tenderId, 'MILESTONE_SIGNED_OFF', actor.id, `Milestone ${m.number}: ${note.trim()}`);
    return { id, status: 'SIGNED_OFF' };
  }

  async requestRework(actor: RequestUser, id: string, note: string) {
    const m = await this.load(id);
    this.tenantOf(actor, m.tender);
    await this.assertChairman(actor, m.tender);
    if (m.status !== 'SUBMITTED') throw new ConflictException('Only a submitted milestone can be sent back');
    if (note.trim().length < 5) throw new BadRequestException('Say what must be fixed');
    const claimed = await this.prisma.tenderMilestone.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'PENDING', reworkNote: note.trim() } });
    if (!claimed.count) throw new ConflictException('This milestone has changed. Reload and try again');
    await this.tenders.event(this.prisma, m.tenderId, 'MILESTONE_REWORK', actor.id, `Milestone ${m.number}: ${note.trim()}`);
    if (m.tender.contractorId) await this.contractorMessage(m.tender.contractorId, (lang) => reworkAsked(lang, { reference: m.tender.reference, title: m.tender.title, milestone: m.title, note: note.trim() }));
    return { id, status: 'PENDING' };
  }

  // ───────────────────────── the Manager and the Accountant ─────────────────────────

  async approvePayment(actor: RequestUser, id: string) {
    const m = await this.load(id);
    this.tenantOf(actor, m.tender);
    if (m.status !== 'SIGNED_OFF') throw new ConflictException('Only a milestone a chairman has signed off can be approved for payment');
    const claimed = await this.prisma.tenderMilestone.updateMany({ where: { id, status: 'SIGNED_OFF' }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() } });
    if (!claimed.count) throw new ConflictException('This milestone has changed. Reload and try again');
    await this.tenders.event(this.prisma, m.tenderId, 'PAYMENT_APPROVED', actor.id, `Milestone ${m.number}: ${num(m.amount)}`);
    return { id, status: 'APPROVED' };
  }

  /** The Accountant pays it (outside MAYOData: bank or mobile money) and records it here; this books the expense. Not the Manager who approved. */
  async pay(actor: RequestUser, id: string, dto: PayMilestoneDto) {
    const m = await this.load(id);
    const mamcosId = this.tenantOf(actor, m.tender);
    if (m.status !== 'APPROVED') throw new ConflictException('Only a milestone the Manager approved can be paid');
    if (m.approvedById === actor.id) throw new ConflictException('The payment must be made by someone other than the Manager who approved it');
    const amount = num(m.amount);
    if (amount <= 0) throw new ConflictException('This milestone has no amount');
    const wallet = await resolveCashAccount(this.prisma, mamcosId, { cashAccountId: dto.cashAccountId, method: dto.method });
    const claimed = await this.prisma.tenderMilestone.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'PAID', paidById: actor.id, paidAt: new Date(), paidMethod: dto.method, paidReference: dto.reference.trim() } });
    if (!claimed.count) throw new ConflictException('This milestone has changed. Reload and try again');
    try {
      await this.accounting.postToLedger('TenderMilestone', id, new Date(`${localDate(new Date())}T00:00:00.000Z`), `Tender ${m.tender.reference} · milestone ${m.number}: ${m.title} (${dto.reference.trim()})`,
        [{ code: '5420', debit: amount }, { code: '1000', credit: amount, cashAccountId: wallet }], mamcosId, actor.id);
    } catch (e) {
      await this.prisma.tenderMilestone.update({ where: { id }, data: { status: 'APPROVED', paidById: null, paidAt: null, paidMethod: null, paidReference: null } }); // no payment without its entry
      throw e;
    }
    await this.tenders.event(this.prisma, m.tenderId, 'MILESTONE_PAID', actor.id, `Milestone ${m.number}: ${amount} by ${dto.method}, ref ${dto.reference.trim()}`);
    const remaining = await this.prisma.tenderMilestone.count({ where: { tenderId: m.tenderId, status: { not: 'PAID' } } });
    if (remaining === 0) {
      await this.prisma.tender.update({ where: { id: m.tenderId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await this.tenders.event(this.prisma, m.tenderId, 'COMPLETED', actor.id, 'Every milestone is paid');
    }
    if (m.tender.contractorId) await this.contractorMessage(m.tender.contractorId, (lang) => paid(lang, { reference: m.tender.reference, title: m.tender.title, milestone: m.title, amount, method: dto.method }));
    return { id, status: 'PAID', completed: remaining === 0 };
  }
}
