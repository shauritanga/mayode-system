import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { AccountingService } from '../accounting/accounting.service';
import { SmsService } from '../messaging/sms.service';
import { farmIdDisplay } from '../irrigation/irrigation-codes';
import { IssueInputDto } from './dto/staff-tasks.dto';
import { cents, day, num, tenantOf, today, tzs } from './common';

const hash = (id: string, code: string) => createHash('sha256').update(`${id}:${code}`).digest('hex');
const MAX_ATTEMPTS = 5;

/**
 * Inputs (fertilizer, seed, chemicals) handed to farmers by the Procurement Officer. Stock goes out, the cost is charged to the farmer
 * and booked, and the farmer confirms receipt with a code texted to their own phone: their digital signature.
 */
@Injectable()
export class InputDistributionService {
  private readonly logger = new Logger(InputDistributionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly accounting: AccountingService,
    private readonly sms: SmsService,
  ) {}

  /** The inputs in stock, with what is left. */
  async items(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const items = await this.prisma.farmInputItem.findMany({ where: { mamcosId, isActive: true }, include: { inputType: { select: { name: true } } }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    const sums = await this.prisma.farmInputMovement.groupBy({ by: ['itemId'], where: { itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
    return { data: items.map((i) => ({ id: i.id, name: i.name, type: i.type, typeName: i.inputType?.name ?? i.type.charAt(0) + i.type.slice(1).toLowerCase(), unit: i.unit, unitCost: i.unitCost, balance: Math.round((sums.find((s) => s.itemId === i.id)?._sum.quantity ?? 0) * 1000) / 1000 })) };
  }

  private async farmIdsOf(farmerId: string) {
    const held = await this.prisma.irrigationHectareAllocation.findMany({ where: { farmerId, status: 'ACTIVE' }, select: { hectare: { select: { code: true } } } });
    return held.map((h) => farmIdDisplay(h.hectare.code));
  }

  private async nextReference(mamcosId: string) {
    const year = new Date().getUTCFullYear();
    const count = await this.prisma.inputIssue.count({ where: { mamcosId, reference: { startsWith: `ISS-${year}-` } } });
    return `ISS-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private async text(phone: string | null | undefined, language: string | null | undefined, p: { reference: string; item: string; qty: number; unit: string; amount: number; plots: string[]; due: Date | null; code: string }) {
    if (!phone) return false;
    const plots = p.plots.length ? ` (Farm ID ${p.plots.slice(0, 3).join(', ')}${p.plots.length > 3 ? '…' : ''})` : '';
    const en = language === 'en';
    const due = p.due ? (en ? `, due ${p.due.toISOString().slice(0, 10)}` : `, malipo kabla ya ${p.due.toISOString().slice(0, 10)}`) : '';
    const body = en
      ? `MAYODE ${p.reference}: you received ${p.qty} ${p.unit} of ${p.item}${plots}, ${tzs(p.amount)} on credit${due}. To confirm you received it, give this code to the officer: ${p.code}. Do not share it with anyone else.`
      : `MAYODE ${p.reference}: umepokea ${p.item} ${p.qty} ${p.unit}${plots}, ${tzs(p.amount)} kwa mkopo${due}. Kuthibitisha umepokea, mpe afisa namba hii: ${p.code}. Usimpe mtu mwingine.`;
    try { await this.sms.send(phone, body, 'input_issue'); return true; } catch (e) { this.logger.warn(`Could not text an input code: ${e instanceof Error ? e.message : e}`); return false; }
  }

  async issue(actor: RequestUser, dto: IssueInputDto, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const farmer = await this.prisma.farmer.findFirst({ where: { id: dto.farmerId, mamcosId }, select: { id: true, firstName: true, lastName: true, isBlacklisted: true, user: { select: { phone: true, language: true } } } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    if (farmer.isBlacklisted) throw new BadRequestException('This farmer is blacklisted and cannot be given inputs on credit');
    const item = await this.prisma.farmInputItem.findFirst({ where: { id: dto.itemId, mamcosId, isActive: true } });
    if (!item) throw new NotFoundException('Input not found');
    const unitPrice = dto.unitPrice ?? item.unitCost ?? 0;
    if (!(unitPrice > 0)) throw new BadRequestException('This input has no price: enter the price per unit');
    const dueDate = dto.dueDate ? day(dto.dueDate) : null;
    if (dueDate && dueDate < today()) throw new BadRequestException('The due date cannot be in the past');
    if (!farmer.user?.phone) throw new BadRequestException('This farmer has no phone number to send the confirmation code to');
    const amount = cents(dto.quantity * unitPrice);
    const plots = await this.farmIdsOf(farmer.id);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    const issue = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM farm_input_items WHERE id = ${item.id} FOR UPDATE`;
      const bal = (await tx.farmInputMovement.aggregate({ where: { itemId: item.id }, _sum: { quantity: true } }))._sum.quantity ?? 0;
      if (dto.quantity > bal + 0.0005) throw new ConflictException(`Only ${Math.round(bal * 1000) / 1000} ${item.unit} of ${item.name} is in stock`);
      const reference = await this.nextReference(mamcosId);
      const issued = await tx.inputIssue.create({
        data: { mamcosId, reference, farmerId: farmer.id, itemId: item.id, itemName: item.name, quantity: dto.quantity, unit: item.unit, unitPrice, amount, farmIds: plots, dueDate, ackCodeHash: 'pending', note: dto.note?.trim() || null, issuedById: actor.id },
      });
      await tx.inputIssue.update({ where: { id: issued.id }, data: { ackCodeHash: hash(issued.id, code) } });
      await tx.farmInputMovement.create({ data: { itemId: item.id, type: 'OUT', quantity: -dto.quantity, note: `Issued to ${farmer.firstName} ${farmer.lastName} (${reference})`, createdByUserId: actor.id } });
      const due = await tx.farmerDue.create({
        data: { mamcosId, farmerId: farmer.id, category: 'FERTILISER', description: `${item.name} · ${dto.quantity} ${item.unit} (${reference})`, itemName: item.name, quantity: dto.quantity, unit: item.unit, unitPrice, amount, issuedOn: today(), dueDate, createdById: actor.id },
      });
      await tx.inputIssue.update({ where: { id: issued.id }, data: { dueId: due.id } });
      return { ...issued, dueId: due.id };
    });
    try {
      await this.accounting.postToLedger('InputIssue', issue.id, today(), `Inputs on credit: ${item.name} ${dto.quantity} ${item.unit} (${issue.reference})`, [{ code: '1310', debit: amount }, { code: '4230', credit: amount }], mamcosId, actor.id);
      await this.prisma.farmerDue.update({ where: { id: issue.dueId }, data: { postedIssue: true } });
    } catch (e) {
      // no issue without its entry: put the stock back and remove the charge
      await this.prisma.$transaction([
        this.prisma.farmInputMovement.create({ data: { itemId: item.id, type: 'ADJUSTMENT', quantity: dto.quantity, note: `Reversed ${issue.reference}: could not be booked`, createdByUserId: actor.id } }),
        this.prisma.farmerDue.delete({ where: { id: issue.dueId } }),
        this.prisma.inputIssue.delete({ where: { id: issue.id } }),
      ]);
      throw e;
    }
    const texted = await this.text(farmer.user.phone, farmer.user.language, { reference: issue.reference, item: item.name, qty: dto.quantity, unit: item.unit, amount, plots, due: dueDate, code });
    return { id: issue.id, reference: issue.reference, amount, farmIds: plots, ackStatus: 'PENDING', codeSent: texted };
  }

  async list(actor: RequestUser, q: { status?: string; farmerId?: string }, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const rows = await this.prisma.inputIssue.findMany({
      where: { mamcosId, ...(q.status && q.status !== 'ALL' ? { ackStatus: q.status } : {}), ...(q.farmerId ? { farmerId: q.farmerId } : {}) }, orderBy: { issuedAt: 'desc' }, take: 150,
    });
    const farmers = await this.prisma.farmer.findMany({ where: { id: { in: rows.map((r) => r.farmerId) } }, select: { id: true, firstName: true, lastName: true, controlNumber: true } });
    const f = new Map(farmers.map((x) => [x.id, x]));
    return {
      data: rows.map((r) => ({
        id: r.id, reference: r.reference, issuedAt: r.issuedAt, item: r.itemName, quantity: r.quantity, unit: r.unit, amount: num(r.amount), farmIds: r.farmIds, dueDate: r.dueDate,
        farmer: f.get(r.farmerId) ? { id: r.farmerId, name: `${f.get(r.farmerId)!.firstName} ${f.get(r.farmerId)!.lastName}`, memberNumber: f.get(r.farmerId)!.controlNumber } : null,
        ackStatus: r.ackStatus, ackAt: r.ackAt, locked: r.ackStatus === 'PENDING' && r.ackAttempts >= MAX_ATTEMPTS,
        daysWaiting: r.ackStatus === 'PENDING' ? Math.floor((Date.now() - +r.issuedAt) / 86_400_000) : null,
      })),
    };
  }

  /** The farmer gave the officer their code: the issue is signed for. Five wrong tries lock it until a new code is sent. */
  async acknowledge(actor: RequestUser, id: string, code: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const r = await this.prisma.inputIssue.findFirst({ where: { id, mamcosId } });
    if (!r) throw new NotFoundException('Input issue not found');
    if (r.ackStatus === 'ACKNOWLEDGED') throw new ConflictException('The farmer has already confirmed this issue');
    if (r.ackAttempts >= MAX_ATTEMPTS) throw new ConflictException('Too many wrong codes. Send the farmer a new code');
    const ok = timingSafeEqual(Buffer.from(hash(r.id, code)), Buffer.from(r.ackCodeHash));
    if (!ok) {
      await this.prisma.inputIssue.update({ where: { id }, data: { ackAttempts: { increment: 1 } } });
      throw new BadRequestException(`That code is not right (${MAX_ATTEMPTS - r.ackAttempts - 1} tries left)`);
    }
    const claimed = await this.prisma.inputIssue.updateMany({ where: { id, ackStatus: 'PENDING' }, data: { ackStatus: 'ACKNOWLEDGED', ackAt: new Date(), ackById: actor.id } });
    if (!claimed.count) throw new ConflictException('The farmer has already confirmed this issue');
    return { id, ackStatus: 'ACKNOWLEDGED' };
  }

  /** A new code to the farmer's phone, when the first was lost or locked. */
  async resend(actor: RequestUser, id: string, mamcosIdParam?: string) {
    const mamcosId = tenantOf(this.ownership, actor, mamcosIdParam);
    const r = await this.prisma.inputIssue.findFirst({ where: { id, mamcosId } });
    if (!r) throw new NotFoundException('Input issue not found');
    if (r.ackStatus === 'ACKNOWLEDGED') throw new ConflictException('The farmer has already confirmed this issue');
    const farmer = await this.prisma.farmer.findUnique({ where: { id: r.farmerId }, select: { user: { select: { phone: true, language: true } } } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.inputIssue.update({ where: { id }, data: { ackCodeHash: hash(r.id, code), ackAttempts: 0 } });
    const sent = await this.text(farmer?.user?.phone, farmer?.user?.language, { reference: r.reference, item: r.itemName, qty: r.quantity, unit: r.unit, amount: num(r.amount), plots: r.farmIds, due: r.dueDate, code });
    return { id, codeSent: sent };
  }
}
