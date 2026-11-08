import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { localDate } from '../accounting/tax';
import { UpdateChargeDto } from './dto/charges.dto';

type Db = Prisma.TransactionClient | PrismaService;

/** The charges every AMCOS gets on its Settings page. They start switched off at zero, so nothing is charged until the admin decides. */
export const STANDARD_CHARGES = [
  { code: 'MILLING_FEE', name: 'Milling service fee', category: 'WAREHOUSE', basis: 'PER_KG', graceDays: 0 },
  { code: 'STORAGE_FEE', name: 'Storage fee (per month)', category: 'WAREHOUSE', basis: 'PER_KG', graceDays: 0 },
  { code: 'DELIVERY_FEE', name: 'Delivery fee', category: 'WAREHOUSE', basis: 'FLAT', graceDays: 0 },
  { code: 'LATE_PENALTY', name: 'Late payment penalty (per month)', category: 'PENALTY', basis: 'PERCENT', graceDays: 30 },
  /** Charged once when a farmer's debt stays unpaid past the grace period; switching it on also starts the overdue-debt handling of their farms. */
  { code: 'DEFAULT_PENALTY', name: 'Overdue-debt penalty (one-off)', category: 'PENALTY', basis: 'FLAT', graceDays: 30, amount: 50000 },
] as const;
export type ChargeCode = (typeof STANDARD_CHARGES)[number]['code'];

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));
const cents = (n: number) => Math.round(n * 100) / 100;
const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  private tenant(actor: RequestUser, requested?: string): string {
    const own = this.ownership.resolveTenantMamcosId(actor);
    const id = own ?? requested ?? null;
    if (!id) throw new BadRequestException('Choose a cooperative');
    if (own && requested && requested !== own) throw new ForbiddenException('You can only manage the charges of your own cooperative');
    return id;
  }

  /** Makes sure the standard charges exist for a cooperative. Safe to call any time. */
  async ensure(mamcosId: string, db: Db = this.prisma) {
    await db.amcosCharge.createMany({
      data: STANDARD_CHARGES.map((c) => ({ mamcosId, code: c.code, name: c.name, category: c.category, basis: c.basis, graceDays: c.graceDays, amount: 'amount' in c ? c.amount : 0 })),
      skipDuplicates: true,
    });
  }

  async list(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    await this.ensure(mamcosId);
    const rows = await this.prisma.amcosCharge.findMany({ where: { mamcosId } });
    const order = STANDARD_CHARGES.map((c) => c.code as string);
    return rows.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code)).map((r) => ({ ...r, amount: num(r.amount) }));
  }

  async update(actor: RequestUser, code: string, dto: UpdateChargeDto, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    await this.ensure(mamcosId);
    const current = await this.prisma.amcosCharge.findUnique({ where: { mamcosId_code: { mamcosId, code } } });
    if (!current) throw new NotFoundException('Charge not found');
    const amount = dto.amount ?? num(current.amount);
    if (current.basis === 'PERCENT' && amount > 100) throw new BadRequestException('A percentage cannot be more than 100');
    const active = dto.isActive ?? current.isActive;
    if (active && amount <= 0) throw new BadRequestException('Enter an amount above zero before switching this charge on');
    if (dto.graceDays != null && current.category !== 'PENALTY') throw new BadRequestException('Only the penalties have grace days');
    if (dto.graceDays != null && code === 'DEFAULT_PENALTY' && (dto.graceDays < 1 || dto.graceDays > 30)) throw new BadRequestException('The grace period must be 1 to 30 days');
    const saved = await this.prisma.amcosCharge.update({
      where: { id: current.id },
      data: { amount, isActive: active, ...(dto.graceDays != null ? { graceDays: dto.graceDays } : {}), updatedById: actor.id },
    });
    return { ...saved, amount: num(saved.amount) };
  }

  /** The amount in force for a charge, or null when it is off (so callers charge nothing). */
  async rate(mamcosId: string | null, code: ChargeCode, db: Db = this.prisma): Promise<{ amount: number; graceDays: number } | null> {
    if (!mamcosId) return null;
    const row = await db.amcosCharge.findUnique({ where: { mamcosId_code: { mamcosId, code } } });
    if (!row || !row.isActive || num(row.amount) <= 0) return null;
    return { amount: num(row.amount), graceDays: row.graceDays };
  }

  /**
   * Charges a farmer a fee that came from Settings (milling, storage, penalty). The description is the fee's identity: asking
   * twice for the same one does not charge twice.
   */
  async chargeFarmer(db: Db, p: { mamcosId: string; farmerId: string; description: string; amount: number; createdById: string | null }) {
    const description = p.description.slice(0, 200);
    const amount = cents(p.amount);
    if (amount <= 0) return null;
    const existing = await db.farmerDue.findFirst({ where: { mamcosId: p.mamcosId, farmerId: p.farmerId, description, status: 'ACTIVE' }, select: { id: true } });
    if (existing) return null;
    return db.farmerDue.create({
      data: { mamcosId: p.mamcosId, farmerId: p.farmerId, category: 'OTHER', description, amount, issuedOn: dateOf(localDate(new Date())), createdById: p.createdById },
    });
  }

  // ───────────────────────── late payment penalty ─────────────────────────

  private async penaltyPlan(mamcosId: string) {
    const rate = await this.rate(mamcosId, 'LATE_PENALTY');
    if (!rate) throw new BadRequestException('Switch on the late payment penalty in Settings first');
    const todayYmd = localDate(new Date());
    const month = todayYmd.slice(0, 7);
    const cutoff = dateOf(todayYmd);
    cutoff.setUTCDate(cutoff.getUTCDate() - rate.graceDays);
    const dues = await this.prisma.farmerDue.findMany({
      where: { mamcosId, status: 'ACTIVE', dueDate: { not: null, lt: cutoff }, NOT: { description: { startsWith: 'Late penalty' } } },
      include: { farmer: { select: { id: true, firstName: true, lastName: true } }, payments: { where: { voidedAt: null }, select: { amount: true } } },
    });
    const rows: { dueId: string; farmerId: string; farmer: string; description: string; balance: number; amount: number; label: string }[] = [];
    for (const d of dues) {
      const balance = cents(num(d.amount) - num(d.waivedAmount) - d.payments.reduce((t, p) => t + num(p.amount), 0));
      if (balance <= 0) continue;
      const amount = cents((balance * rate.amount) / 100);
      if (amount <= 0) continue;
      rows.push({ dueId: d.id, farmerId: d.farmerId, farmer: `${d.farmer.firstName} ${d.farmer.lastName}`, description: d.description, balance, amount, label: `Late penalty · ${d.description} · ${month}` });
    }
    const labels = new Set((await this.prisma.farmerDue.findMany({ where: { mamcosId, description: { in: rows.map((r) => r.label.slice(0, 200)) }, status: 'ACTIVE' }, select: { description: true } })).map((d) => d.description));
    const fresh = rows.filter((r) => !labels.has(r.label.slice(0, 200)));
    return { month, percent: rate.amount, graceDays: rate.graceDays, rows: fresh, alreadyCharged: rows.length - fresh.length, total: cents(fresh.reduce((t, r) => t + r.amount, 0)) };
  }

  async previewPenalties(actor: RequestUser, mamcosIdParam?: string) {
    return this.penaltyPlan(this.tenant(actor, mamcosIdParam));
  }

  async applyPenalties(actor: RequestUser, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const plan = await this.penaltyPlan(mamcosId);
    if (!plan.rows.length) throw new ConflictException(plan.alreadyCharged ? 'This month’s penalties have already been charged' : 'Nothing is late beyond the grace days');
    let charged = 0;
    for (const r of plan.rows) if (await this.chargeFarmer(this.prisma, { mamcosId, farmerId: r.farmerId, description: r.label, amount: r.amount, createdById: actor.id })) charged++;
    return { charged, total: plan.total, month: plan.month };
  }

  // ───────────────────────── storage fee ─────────────────────────

  private async storagePlan(mamcosId: string, month: string) {
    const rate = await this.rate(mamcosId, 'STORAGE_FEE');
    if (!rate) throw new BadRequestException('Switch on the storage fee in Settings first');
    if (month > localDate(new Date()).slice(0, 7)) throw new BadRequestException('You cannot charge storage for a month that has not started');
    const batches = await this.prisma.stockBatch.findMany({ where: { mamcosId, ownerType: 'FARMER', ownerFarmerId: { not: null } }, select: { id: true, ownerFarmerId: true } });
    const sums = await this.prisma.stockLedgerEntry.groupBy({ by: ['batchId'], where: { batchId: { in: batches.map((b) => b.id) } }, _sum: { quantityKg: true } });
    const kgByFarmer = new Map<string, number>();
    for (const b of batches) {
      const kg = sums.find((s) => s.batchId === b.id)?._sum.quantityKg ?? 0;
      if (kg > 0) kgByFarmer.set(b.ownerFarmerId!, (kgByFarmer.get(b.ownerFarmerId!) ?? 0) + kg);
    }
    const farmers = await this.prisma.farmer.findMany({ where: { id: { in: [...kgByFarmer.keys()] } }, select: { id: true, firstName: true, lastName: true } });
    const label = `Storage · ${month}`;
    const taken = new Set((await this.prisma.farmerDue.findMany({ where: { mamcosId, description: label, status: 'ACTIVE' }, select: { farmerId: true } })).map((d) => d.farmerId));
    const rows = farmers.filter((f) => !taken.has(f.id)).map((f) => {
      const kg = Math.round((kgByFarmer.get(f.id) ?? 0) * 1000) / 1000;
      return { farmerId: f.id, farmer: `${f.firstName} ${f.lastName}`, kg, amount: cents(kg * rate.amount) };
    }).filter((r) => r.amount > 0);
    return { month, perKg: rate.amount, label, rows, alreadyCharged: taken.size, total: cents(rows.reduce((t, r) => t + r.amount, 0)) };
  }

  async previewStorage(actor: RequestUser, month: string, mamcosIdParam?: string) {
    return this.storagePlan(this.tenant(actor, mamcosIdParam), month);
  }

  async applyStorage(actor: RequestUser, month: string, mamcosIdParam?: string) {
    const mamcosId = this.tenant(actor, mamcosIdParam);
    const plan = await this.storagePlan(mamcosId, month);
    if (!plan.rows.length) throw new ConflictException(plan.alreadyCharged ? 'Storage for this month has already been charged' : 'No farmer has stock stored with the cooperative');
    let charged = 0;
    for (const r of plan.rows) if (await this.chargeFarmer(this.prisma, { mamcosId, farmerId: r.farmerId, description: plan.label, amount: r.amount, createdById: actor.id })) charged++;
    return { charged, total: plan.total, month };
  }
}
