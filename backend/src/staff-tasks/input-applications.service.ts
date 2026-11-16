import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { farmIdDisplay } from '../irrigation/irrigation-codes';
import { CreditInterestService } from '../credit-interest/credit-interest.service';
import { InputDistributionService } from './input-distribution.service';
import { ApplyForInputsDto } from './dto/staff-tasks.dto';
import { cents, num, tenantOf, tzs } from './common';

export const TERMS_VERSION = 'v1';
const TERMS = {
  en: [
    'I am applying for the inputs listed for the hectares I have chosen, and I confirm they are the hectares I farm.',
    'The inputs are given on credit. Their cost, at the price on the day they are given, is charged to my account with the AMCOS and I must pay it by the due date the AMCOS sets.',
    'The AMCOS may approve, change or decline my application, depending on the stock it has. An application is not a promise that inputs will be given.',
    'I will use the inputs only on my own hectares, and I will collect them at the AMCOS and confirm receiving them with the code sent to my phone.',
    'If I do not pay what I owe, the AMCOS may follow its normal rules for unpaid member debts.',
  ],
  sw: [
    'Naomba pembejeo zilizoorodheshwa kwa hekta nilizozichagua, na nathibitisha ni hekta ninazolima.',
    'Pembejeo hutolewa kwa mkopo. Gharama yake, kwa bei ya siku zinapotolewa, itaandikwa kwenye akaunti yangu ya AMCOS nami nitalipa kabla ya tarehe AMCOS itakayoweka.',
    'AMCOS inaweza kukubali, kubadilisha au kukataa ombi langu kulingana na akiba iliyopo. Ombi si ahadi kwamba pembejeo zitatolewa.',
    'Nitatumia pembejeo kwenye hekta zangu tu, nitazichukua AMCOS na kuthibitisha kuzipokea kwa namba itakayotumwa kwenye simu yangu.',
    'Nisipolipa deni langu, AMCOS inaweza kutumia taratibu zake za kawaida za madeni ya wanachama.',
  ],
};
const termsFor = (language?: string | null) => (language === 'en' ? TERMS.en : TERMS.sw);

/**
 * Farmers apply for inputs in the mobile app; the office reviews and approves. Approving gives the inputs out through the normal
 * Input Distribution flow, so the stock, the charge to the farmer and the confirmation code work exactly as they do at the office.
 */
@Injectable()
export class InputApplicationsService {
  private readonly logger = new Logger(InputApplicationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly sms: SmsService,
    private readonly distribution: InputDistributionService,
    private readonly interest: CreditInterestService,
  ) {}

  /** The fixed terms, plus the AMCOS's own interest terms when it charges interest, so the farmer consents to them too. */
  private async termsLines(mamcosId: string, language?: string | null) {
    const lang = language === 'en' ? 'en' : 'sw';
    const lines = [...termsFor(language)];
    const i = await this.interest.describe(mamcosId, lang);
    if (i.enabled) lines.splice(2, 0, i.text);
    return lines;
  }

  // ───────────────────────── the farmer's side ─────────────────────────

  private async me(actor: RequestUser) {
    if (actor.role !== UserRole.FARMER) throw new ForbiddenException('Only a farmer can apply for inputs here');
    const f = await this.prisma.farmer.findUnique({ where: { userId: actor.id }, select: { id: true, mamcosId: true, isBlacklisted: true, user: { select: { language: true } } } });
    if (!f || !f.mamcosId) throw new ForbiddenException('Your account is not linked to an AMCOS yet');
    return { ...f, mamcosId: f.mamcosId };
  }

  private async hectaresOf(farmerId: string) {
    const held = await this.prisma.irrigationHectareAllocation.findMany({ where: { farmerId, status: 'ACTIVE' }, select: { hectare: { select: { code: true, areaHectares: true } } }, orderBy: { hectare: { code: 'asc' } } });
    return held.map((h) => ({ farmId: farmIdDisplay(h.hectare.code), areaHectares: num(h.hectare.areaHectares) }));
  }

  /** What the application form needs: the farmer's hectares, the inputs the AMCOS has, and the terms to accept. */
  async options(actor: RequestUser) {
    const f = await this.me(actor);
    const [hectares, items] = await Promise.all([this.hectaresOf(f.id), this.availableItems(f.mamcosId)]);
    return { hectares, items, terms: { version: TERMS_VERSION, lines: await this.termsLines(f.mamcosId, f.user?.language) }, blocked: f.isBlacklisted ? 'You cannot apply for inputs on credit right now. Please visit the AMCOS office.' : null };
  }

  private async availableItems(mamcosId: string) {
    const items = await this.prisma.farmInputItem.findMany({ where: { mamcosId, isActive: true, stockClass: 'INPUT' }, include: { inputType: { select: { name: true } } }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    const sums = await this.prisma.farmInputMovement.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
    return items
      .map((i) => ({ id: i.id, name: i.name, typeName: i.inputType?.name ?? i.type.charAt(0) + i.type.slice(1).toLowerCase(), unit: i.unit, unitPrice: i.unitCost ?? 0, inStock: Math.round((sums.find((s) => s.itemId === i.id)?._sum.quantity ?? 0) * 1000) / 1000 }))
      .filter((i) => i.unitPrice > 0 && i.inStock > 0);
  }

  private async nextReference(mamcosId: string) {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.inputApplication.count({ where: { mamcosId, reference: { startsWith: `APP-${year}-` } } });
    return `APP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async apply(actor: RequestUser, dto: ApplyForInputsDto) {
    const f = await this.me(actor);
    if (f.isBlacklisted) throw new BadRequestException('You cannot apply for inputs on credit right now. Please visit the AMCOS office.');
    if (!dto.acceptTerms) throw new BadRequestException('You must accept the terms and conditions to apply');
    if (dto.termsVersion !== TERMS_VERSION) throw new BadRequestException('The terms have changed. Please read and accept them again');
    const hectares = await this.hectaresOf(f.id);
    const mine = new Set(hectares.map((h) => h.farmId));
    const farmIds = [...new Set(dto.farmIds)];
    if (farmIds.some((id) => !mine.has(id))) throw new BadRequestException('Choose only hectares that you farm');
    const merged = new Map<string, number>();
    for (const l of dto.lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);
    const items = await this.availableItems(f.mamcosId);
    const lines = [...merged].map(([itemId, quantity]) => {
      const it = items.find((i) => i.id === itemId);
      if (!it) throw new BadRequestException('One of the inputs you chose is not available now');
      return { itemId, itemName: it.name, unit: it.unit, quantity: Math.round(quantity * 1000) / 1000, unitPrice: it.unitPrice };
    });
    const open = await this.prisma.inputApplication.count({ where: { farmerId: f.id, status: { in: ['SUBMITTED', 'PARTLY_ISSUED'] } } });
    if (open >= 3) throw new ConflictException('You already have applications waiting. Wait for the AMCOS to answer them first');
    const text = (await this.termsLines(f.mamcosId, f.user?.language)).map((t, i) => `${i + 1}. ${t}`).join('\n');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const row = await this.prisma.inputApplication.create({
          data: { mamcosId: f.mamcosId, reference: await this.nextReference(f.mamcosId), farmerId: f.id, farmIds, note: dto.note?.trim() || null, termsVersion: TERMS_VERSION, termsText: text, consentAt: new Date(), lines: { create: lines } },
          include: { lines: true },
        });
        return this.shape(row, true);
      } catch (e: any) { if (e?.code !== 'P2002') throw e; }
    }
    throw new ConflictException('Could not number the application. Try again');
  }

  async mine(actor: RequestUser) {
    const f = await this.me(actor);
    const rows = await this.prisma.inputApplication.findMany({ where: { farmerId: f.id }, include: { lines: true }, orderBy: { submittedAt: 'desc' }, take: 50 });
    return { data: rows.map((r) => this.shape(r, false)) };
  }

  async withdraw(actor: RequestUser, id: string) {
    const f = await this.me(actor);
    const claimed = await this.prisma.inputApplication.updateMany({ where: { id, farmerId: f.id, status: 'SUBMITTED' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
    if (!claimed.count) {
      const exists = await this.prisma.inputApplication.findFirst({ where: { id, farmerId: f.id }, select: { status: true } });
      if (!exists) throw new NotFoundException('Application not found');
      throw new ConflictException('This application is already being handled and cannot be withdrawn');
    }
    return { id, status: 'WITHDRAWN' };
  }

  // ───────────────────────── the office's side ─────────────────────────

  async list(actor: RequestUser, q: { status?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const rows = await this.prisma.inputApplication.findMany({
      where: { mamcosId, ...(q.status && q.status !== 'ALL' ? { status: q.status === 'OPEN' ? { in: ['SUBMITTED', 'PARTLY_ISSUED'] } : q.status } : {}) },
      include: { lines: true }, orderBy: { submittedAt: 'desc' }, take: 200,
    });
    const farmers = await this.prisma.farmer.findMany({ where: { id: { in: rows.map((r) => r.farmerId) } }, select: { id: true, firstName: true, lastName: true, controlNumber: true, user: { select: { phone: true } } } });
    const by = new Map(farmers.map((x) => [x.id, x]));
    return { data: rows.map((r) => { const fa = by.get(r.farmerId); return { ...this.shape(r, true), farmer: fa ? { id: fa.id, name: `${fa.firstName} ${fa.lastName}`, memberNumber: fa.controlNumber, phone: fa.user?.phone ?? null } : null }; }) };
  }

  /** The counts for the badge on the tab. */
  async openCount(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    return { open: await this.prisma.inputApplication.count({ where: { mamcosId, status: { in: ['SUBMITTED', 'PARTLY_ISSUED'] } } }) };
  }

  /** Approve: give each requested input out through Input Distribution. Lines already given are skipped, so a retry after a shortage is safe. */
  async approve(actor: RequestUser, id: string, warehouseId: string | undefined, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const app = await this.prisma.inputApplication.findFirst({ where: { id, mamcosId }, include: { lines: true } });
    if (!app) throw new NotFoundException('Application not found');
    if (!['SUBMITTED', 'PARTLY_ISSUED'].includes(app.status)) throw new ConflictException('This application has already been dealt with');
    const claimed = await this.prisma.inputApplication.updateMany({ where: { id, status: { in: ['SUBMITTED', 'PARTLY_ISSUED'] } }, data: { status: 'PROCESSING', decidedById: actor.id, decidedAt: new Date() } }); // one approval at a time
    if (!claimed.count) throw new ConflictException('This application has already been dealt with');
    let failure: string | null = null;
    for (const line of app.lines.filter((l) => !l.issueId)) {
      try {
        const r = await this.distribution.issue(actor, { farmerId: app.farmerId, itemId: line.itemId, quantity: line.quantity, warehouseId, note: `Application ${app.reference}` } as any, mamcosId);
        await this.prisma.inputIssue.update({ where: { id: r.id }, data: { channel: 'APP', applicationId: app.id } });
        await this.prisma.inputApplicationLine.update({ where: { id: line.id }, data: { issueId: r.id } });
      } catch (e: any) {
        failure = `${line.itemName}: ${e?.response?.message ?? e?.message ?? 'could not be given'}`;
        break;
      }
    }
    const left = await this.prisma.inputApplicationLine.count({ where: { applicationId: id, issueId: null } });
    const status = left === 0 ? 'APPROVED' : left === app.lines.length ? 'SUBMITTED' : 'PARTLY_ISSUED';
    await this.prisma.inputApplication.update({ where: { id }, data: { status } });
    if (failure) throw new ConflictException(`${left === app.lines.length ? 'Nothing was given. ' : 'Some inputs were given. '}${failure}. Fix this and approve again to give the rest`);
    return { id, status };
  }

  async reject(actor: RequestUser, id: string, reason: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const app = await this.prisma.inputApplication.findFirst({ where: { id, mamcosId } });
    if (!app) throw new NotFoundException('Application not found');
    const claimed = await this.prisma.inputApplication.updateMany({ where: { id, status: 'SUBMITTED' }, data: { status: 'REJECTED', rejectReason: reason.trim(), decidedById: actor.id, decidedAt: new Date() } });
    if (!claimed.count) throw new ConflictException('This application has already been dealt with');
    const farmer = await this.prisma.farmer.findUnique({ where: { id: app.farmerId }, select: { user: { select: { phone: true, language: true } } } });
    if (farmer?.user?.phone) {
      const en = farmer.user.language === 'en';
      const body = en ? `MAYODE ${app.reference}: your input application was not approved. Reason: ${reason.trim()}. Please visit the AMCOS office.` : `MAYODE ${app.reference}: ombi lako la pembejeo halijakubaliwa. Sababu: ${reason.trim()}. Tafadhali tembelea ofisi ya AMCOS.`;
      await this.sms.send(farmer.user.phone, body, 'input_application').catch((e) => this.logger.warn(`Could not text a rejection: ${e instanceof Error ? e.message : e}`));
    }
    return { id, status: 'REJECTED' };
  }

  private shape(r: { id: string; reference: string; status: string; farmIds: string[]; note: string | null; submittedAt: Date; decidedAt: Date | null; rejectReason: string | null; consentAt: Date; termsVersion: string; lines: { id: string; itemId: string; itemName: string; unit: string; quantity: number; unitPrice: unknown; issueId: string | null }[] }, _office: boolean) {
    const lines = r.lines.map((l) => ({ id: l.id, itemId: l.itemId, item: l.itemName, unit: l.unit, quantity: l.quantity, unitPrice: num(l.unitPrice), amount: cents(l.quantity * num(l.unitPrice)), given: !!l.issueId }));
    return { id: r.id, reference: r.reference, status: r.status, channel: 'APP', farmIds: r.farmIds, note: r.note, submittedAt: r.submittedAt, decidedAt: r.decidedAt, rejectReason: r.rejectReason, consentAt: r.consentAt, termsVersion: r.termsVersion, lines, estimatedTotal: cents(lines.reduce((s, l) => s + l.amount, 0)), estimatedTotalText: tzs(lines.reduce((s, l) => s + l.amount, 0)) };
  }
}
