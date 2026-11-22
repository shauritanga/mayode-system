import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { farmIdDisplay } from '../irrigation/irrigation-codes';
import type { FarmSplit } from './farm-split';

const num = (v: unknown) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const day = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

export type EntryKind = 'CHARGE' | 'PAYMENT' | 'WAIVER' | 'COMBINE' | 'INPUTS';
export interface AccountEntry {
  id: string;
  date: Date;
  kind: EntryKind;
  title: string;
  detail: string | null;
  reference: string | null;
  /** Adds to what the farmer owes. */
  charged: number;
  /** Brings what the farmer owes down (a receipt or a waiver). */
  paid: number;
  /** Shown for information only (combine and inputs handed over): it does not move the balance. */
  info: number | null;
  status: string;
  voided: boolean;
  /** The farm (Farm ID) this belongs to, or null when it is on the farmer's account as a whole. */
  farmId: string | null;
  farmerName: string | null;
  dueId: string | null;
}

/** A charge's shares across farms; one without a split is not tied to any farm. */
const sharesOf = (split: unknown): FarmSplit | null => (Array.isArray(split) && split.length ? (split as FarmSplit) : null);

/**
 * One account for a farmer, or for a farm (hectare): everything charged, every receipt, what was paid to a combine and the
 * inputs handed over, with what is still owed. It only reads; dues, receipts and the ledger are untouched, and a farm's figures
 * are its stored share of each charge and receipt.
 */
@Injectable()
export class FarmAccountService {
  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only see your own cooperative');
    return id;
  }

  private async codes(hectareIds: string[]) {
    const rows = await this.prisma.irrigationHectare.findMany({ where: { id: { in: hectareIds } }, select: { id: true, code: true } });
    return new Map(rows.map((r) => [r.id, farmIdDisplay(r.code)]));
  }

  /** Dues -> entries. `only` limits to one farm and scales every figure to that farm's share. */
  private dueEntries(dues: any[], farmCode: Map<string, string>, only?: string): AccountEntry[] {
    const out: AccountEntry[] = [];
    const today = day();
    for (const d of dues) {
      const split = sharesOf(d.farmSplit);
      const parts: { hectareId: string | null; share: number }[] = split ?? [{ hectareId: null, share: 1 }];
      for (const part of parts) {
        if (only && part.hectareId !== only) continue;
        const farmId = part.hectareId ? farmCode.get(part.hectareId) ?? null : null;
        const farmerName = d.farmer ? `${d.farmer.firstName} ${d.farmer.lastName}`.trim() : null;
        const cancelled = d.status === 'CANCELLED';
        const scale = (n: number) => cents(n * part.share);
        const base = { farmId, farmerName, dueId: d.id as string };
        out.push({
          ...base, id: `due:${d.id}:${part.hectareId ?? ''}`, date: d.issuedOn, kind: 'CHARGE', title: d.description, detail: d.category.replace(/_/g, ' ').toLowerCase(),
          reference: null, charged: cancelled ? 0 : scale(num(d.amount)), paid: 0, info: cancelled ? scale(num(d.amount)) : null,
          status: cancelled ? 'CANCELLED' : d.dueDate ? (d.dueDate < today ? 'OVERDUE ' : 'DUE ') + d.dueDate.toISOString().slice(0, 10) : 'OPEN', voided: cancelled,
        });
        if (!cancelled && num(d.waivedAmount) > 0) {
          out.push({ ...base, id: `waive:${d.id}:${part.hectareId ?? ''}`, date: d.updatedAt, kind: 'WAIVER', title: `Waived: ${d.description}`, detail: d.waivedReason ?? null, reference: null, charged: 0, paid: scale(num(d.waivedAmount)), info: null, status: 'WAIVED', voided: false });
        }
        for (const p of d.payments) {
          out.push({
            ...base, id: `pay:${p.id}:${part.hectareId ?? ''}`, date: p.paidOn, kind: 'PAYMENT', title: `Payment: ${d.description}`, detail: [String(p.method).replace(/_/g, ' ').toLowerCase(), p.reference].filter(Boolean).join(' · ') || null,
            reference: p.receiptNo, charged: 0, paid: p.voidedAt || cancelled ? 0 : scale(num(p.amount)), info: p.voidedAt ? scale(num(p.amount)) : null,
            status: p.voidedAt ? 'VOIDED' : 'RECEIVED', voided: !!p.voidedAt,
          });
        }
      }
    }
    return out;
  }

  private totals(entries: AccountEntry[], dues: any[], only?: string) {
    const charged = cents(entries.reduce((n, e) => n + e.charged, 0));
    const paid = cents(entries.reduce((n, e) => n + e.paid, 0));
    const today = day();
    let overdue = 0;
    for (const d of dues) {
      if (d.status !== 'ACTIVE' || !d.dueDate || d.dueDate >= today) continue;
      const split = sharesOf(d.farmSplit) ?? [{ hectareId: null, share: 1 }];
      const part = only ? split.find((p) => p.hectareId === only) : null;
      const share = only ? part?.share ?? 0 : 1;
      const paidOnDue = d.payments.filter((p: any) => !p.voidedAt).reduce((n: number, p: any) => n + num(p.amount), 0);
      const left = num(d.amount) - num(d.waivedAmount) - paidOnDue;
      if (left > 0) overdue += left * share;
    }
    return { charged, paid, outstanding: cents(charged - paid), overdue: cents(overdue) };
  }

  private async sideEntries(mamcosId: string, where: { farmerId?: string; hectareId?: string; farmCode?: string }, farmCode: Map<string, string>): Promise<AccountEntry[]> {
    const out: AccountEntry[] = [];
    const combines = await this.prisma.harvestCollection.findMany({
      where: { mamcosId, ...(where.farmerId ? { farmerId: where.farmerId } : {}), ...(where.hectareId ? { hectareId: where.hectareId } : {}) },
      include: { combine: { select: { registrationNumber: true } } }, orderBy: { harvestedOn: 'desc' },
    });
    const missing = [...new Set(combines.map((c) => c.hectareId))].filter((h) => !farmCode.has(h));
    for (const [k, v] of await this.codes(missing)) farmCode.set(k, v);
    for (const c of combines) {
      out.push({
        id: `combine:${c.id}`, date: c.harvestedOn, kind: 'COMBINE', title: `Combine harvest · ${c.combine.registrationNumber}`,
        detail: [`${num(c.totalBags)} bags`, c.riceVarietyName].filter(Boolean).join(' · '), reference: c.receiptNo, charged: 0, paid: 0, info: num(c.amount),
        status: c.voidedAt ? 'VOIDED' : c.status === 'COLLECTED' ? 'COLLECTED' : 'PENDING', voided: !!c.voidedAt, farmId: farmCode.get(c.hectareId) ?? null, farmerName: null, dueId: null,
      });
    }
    const issues = await this.prisma.inputIssue.findMany({
      where: { mamcosId, ...(where.farmerId ? { farmerId: where.farmerId } : {}), ...(where.farmCode ? { farmIds: { has: where.farmCode } } : {}) },
      orderBy: { issuedAt: 'desc' },
    });
    for (const i of issues) {
      out.push({
        id: `inputs:${i.id}`, date: i.issuedAt, kind: 'INPUTS', title: `Inputs given · ${i.itemName}`, detail: `${i.quantity} ${i.unit}`, reference: i.reference, charged: 0, paid: 0, info: num(i.amount),
        status: i.ackStatus === 'ACKNOWLEDGED' ? 'CONFIRMED' : 'AWAITING CODE', voided: false, farmId: where.farmCode ?? (i.farmIds.length === 1 ? i.farmIds[0] : null), farmerName: null, dueId: i.dueId,
      });
    }
    return out;
  }

  private sort(entries: AccountEntry[]) {
    return entries.sort((a, b) => +new Date(b.date) - +new Date(a.date) || a.id.localeCompare(b.id));
  }

  /** A farmer's whole account, with the balance of each of their farms. */
  async forFarmer(actor: RequestUser, farmerId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const farmer = await this.prisma.farmer.findFirst({ where: { id: farmerId, mamcosId }, select: { id: true, firstName: true, lastName: true, controlNumber: true } });
    if (!farmer) throw new NotFoundException('Farmer not found');
    const dues = await this.prisma.farmerDue.findMany({ where: { mamcosId, farmerId }, include: { farmer: { select: { firstName: true, lastName: true } }, payments: true } });
    const hectareIds = new Set<string>();
    for (const d of dues) for (const p of sharesOf(d.farmSplit) ?? []) hectareIds.add(p.hectareId);
    const farmCode = await this.codes([...hectareIds]);
    const entries = this.sort([...this.dueEntries(dues, farmCode), ...(await this.sideEntries(mamcosId, { farmerId }, farmCode))]);

    const byFarm = new Map<string, { farmId: string | null; hectareId: string | null; charged: number; paid: number }>();
    for (const e of entries) {
      if (e.kind === 'COMBINE' || e.kind === 'INPUTS') continue;
      const key = e.farmId ?? '';
      const row = byFarm.get(key) ?? { farmId: e.farmId, hectareId: null, charged: 0, paid: 0 };
      row.charged = cents(row.charged + e.charged); row.paid = cents(row.paid + e.paid);
      byFarm.set(key, row);
    }
    for (const [id, code] of farmCode) { const r = byFarm.get(code); if (r) r.hectareId = id; }
    return {
      farmer: { id: farmer.id, name: `${farmer.firstName} ${farmer.lastName}`.trim(), memberNumber: farmer.controlNumber },
      totals: this.totals(entries, dues),
      farms: [...byFarm.values()].map((r) => ({ ...r, outstanding: cents(r.charged - r.paid) })).sort((a, b) => (a.farmId ?? '~').localeCompare(b.farmId ?? '~')),
      entries,
    };
  }

  /** One farm's account: its share of every charge and receipt, the combine harvests on it and the inputs given for it. */
  async forFarm(actor: RequestUser, hectareId: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const hectare = await this.prisma.irrigationHectare.findFirst({
      where: { id: hectareId, block: { canal: { scheme: { mamcosId } } } },
      select: { id: true, code: true, areaHectares: true, allocations: { where: { status: 'ACTIVE' }, select: { farmer: { select: { id: true, firstName: true, lastName: true, controlNumber: true } } } } },
    });
    if (!hectare) throw new NotFoundException('Farm not found');
    const farmId = farmIdDisplay(hectare.code);
    const ids = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM farmer_dues WHERE mamcos_id = ${mamcosId} AND farm_split @> ${JSON.stringify([{ hectareId }])}::jsonb`;
    const dues = ids.length
      ? await this.prisma.farmerDue.findMany({ where: { id: { in: ids.map((i) => i.id) } }, include: { farmer: { select: { firstName: true, lastName: true } }, payments: true } })
      : [];
    const farmCode = new Map([[hectareId, farmId]]);
    const entries = this.sort([...this.dueEntries(dues, farmCode, hectareId), ...(await this.sideEntries(mamcosId, { hectareId, farmCode: farmId }, farmCode))]);
    const holder = hectare.allocations[0]?.farmer;
    return {
      farm: { id: hectare.id, farmId, areaHectares: num(hectare.areaHectares), farmer: holder ? { id: holder.id, name: `${holder.firstName} ${holder.lastName}`.trim(), memberNumber: holder.controlNumber } : null },
      totals: this.totals(entries, dues, hectareId),
      entries,
    };
  }
}
