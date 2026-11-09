import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { DisputeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { RaiseRentalDisputeDto } from './dto/amcos-rentals.dto';

/** Shown on the rental record when the owner wrote no terms of their own. Contains no money. */
export function standardTerms(p: { owner: string; tenant: string; place: string; start: Date; end: Date; months: number; seasons?: number | null }): string {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const length = p.seasons ? `${p.seasons} farming season${p.seasons === 1 ? '' : 's'} (${p.months} months)` : `${p.months} months`;
  return [
    `${p.owner} (the owner) lets ${p.place} to ${p.tenant} (the tenant) from ${d(p.start)} to ${d(p.end)}, for ${length}.`,
    'The tenant farms the land during that period and gives it back to the owner when it ends.',
    'The owner stays the registered owner of the land. The cooperative keeps this record and may be asked to witness the arrangement if there is a disagreement.',
  ].join(' ');
}

const RECORD_SELECT = {
  id: true, listingId: true, farmId: true, farmCode: true, hectareId: true, hectareCode: true,
  ownerFarmerId: true, ownerName: true, tenantFarmerId: true, tenantName: true,
  startDate: true, endDate: true, durationMonths: true, seasonCount: true, reason: true, terms: true,
  status: true, terminatedAt: true, witnessNote: true, witnessNoteAt: true, createdAt: true,
  _count: { select: { disputes: { where: { status: { notIn: ['RESOLVED', 'REJECTED'] } } } } },
} satisfies Prisma.AmcosRentalRecordSelect;

type Row = Prisma.AmcosRentalRecordGetPayload<{ select: typeof RECORD_SELECT }>;

/**
 * The cooperative's own record of farms rented through M-LAX. It is written when the rental becomes active and holds
 * who, which hectare, when, for how long, on what terms and why. It never holds the rent, deposit, commission or payout.
 */
@Injectable()
export class AmcosRentalsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AmcosRentalsService.name);

  constructor(private readonly prisma: PrismaService, private readonly ownership: OwnershipService) {}

  /** Rentals that were already active before this record existed get theirs once, at startup. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    void this.backfill().then((n) => n && this.logger.log(`Wrote ${n} AMCOS rental record(s) for earlier rentals`)).catch((e) => this.logger.error(`Backfill failed: ${e instanceof Error ? e.message : e}`));
  }

  private shape(r: Row) {
    const ended = r.status === 'ACTIVE' && r.endDate < new Date();
    const { _count, ...rest } = r;
    return { ...rest, status: ended ? 'ENDED' : r.status, openDisputes: _count.disputes };
  }

  /** The hectare a rental concerns: the one the owner named (it must be theirs), else their only active hectare. */
  async resolveHectareId(ownerId: string, hectareId?: string | null): Promise<string | null> {
    const held = await this.prisma.irrigationHectareAllocation.findMany({
      where: { farmerId: ownerId, status: 'ACTIVE' },
      select: { hectareId: true },
    });
    const guarded = await this.prisma.irrigationHectareGuardian.findMany({
      where: { allocation: { status: 'ACTIVE' }, guardianId: ownerId, endedOn: null },
      select: { allocation: { select: { hectareId: true } } },
    });
    const mine = new Set([...held.map((h) => h.hectareId), ...guarded.map((g) => g.allocation.hectareId)]);
    if (hectareId) {
      if (!mine.has(hectareId)) throw new BadRequestException('That hectare is not held by this farmer');
      return hectareId;
    }
    return mine.size === 1 ? [...mine][0] : null;
  }

  /** Called when a rental turns active. Safe to call again: one record per listing. */
  async recordActivated(listingId: string): Promise<void> {
    try {
      const l = await this.prisma.landListing.findUnique({
        where: { id: listingId },
        include: {
          farm: { select: { id: true, farmCode: true, name: true, mamcosId: true } },
          owner: { select: { id: true, firstName: true, lastName: true, mamcosId: true } },
          renter: { select: { id: true, firstName: true, lastName: true } },
          hectare: { select: { id: true, code: true } },
        },
      });
      if (!l || !l.renter || !l.leaseStartDate || !l.leaseEndDate) return;
      const mamcosId = l.farm.mamcosId ?? l.owner.mamcosId;
      if (!mamcosId) return; // a farm outside any cooperative has no cooperative to keep the record
      let hectare = l.hectare;
      if (!hectare) {
        const id = await this.resolveHectareId(l.ownerId).catch(() => null);
        if (id) hectare = await this.prisma.irrigationHectare.findUnique({ where: { id }, select: { id: true, code: true } });
      }
      const owner = `${l.owner.firstName} ${l.owner.lastName}`.trim();
      const tenant = `${l.renter.firstName} ${l.renter.lastName}`.trim();
      const terms = l.leaseTerms?.trim() || standardTerms({
        owner, tenant, place: hectare ? `hectare ${hectare.code}` : `farm ${l.farm.farmCode}`,
        start: l.leaseStartDate, end: l.leaseEndDate, months: l.leaseDurationMonths, seasons: l.seasonCount,
      });
      const data = {
        mamcosId, farmId: l.farmId, farmCode: l.farm.farmCode, hectareId: hectare?.id ?? null, hectareCode: hectare?.code ?? null,
        ownerFarmerId: l.ownerId, ownerName: owner, tenantFarmerId: l.renter.id, tenantName: tenant,
        startDate: l.leaseStartDate, endDate: l.leaseEndDate, durationMonths: l.leaseDurationMonths, seasonCount: l.seasonCount,
        reason: l.rentOutReason?.trim() || null, terms, status: 'ACTIVE', terminatedAt: null,
      };
      await this.prisma.amcosRentalRecord.upsert({ where: { listingId }, create: { listingId, ...data }, update: data });
    } catch (e) {
      // The rental itself must not fail because the cooperative's copy could not be written; it is retried by the backfill.
      this.logger.error(`Could not write the AMCOS rental record for ${listingId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** The rental ended early (cancelled or terminated). The record stays as evidence. */
  async markTerminated(listingId: string): Promise<void> {
    await this.prisma.amcosRentalRecord.updateMany({ where: { listingId, status: 'ACTIVE' }, data: { status: 'TERMINATED', terminatedAt: new Date() } });
  }

  private scope(actor: RequestUser): Prisma.AmcosRentalRecordWhereInput {
    const tenant = this.ownership.resolveTenantMamcosId(actor);
    return tenant ? { mamcosId: tenant } : {};
  }

  async list(actor: RequestUser, q: { status?: string; q?: string; hectareId?: string }) {
    const text = (q.q ?? '').trim();
    const rows = await this.prisma.amcosRentalRecord.findMany({
      where: {
        ...this.scope(actor),
        ...(q.hectareId ? { hectareId: q.hectareId } : {}),
        ...(text ? { OR: [
          { ownerName: { contains: text, mode: 'insensitive' } }, { tenantName: { contains: text, mode: 'insensitive' } },
          { farmCode: { contains: text, mode: 'insensitive' } }, { hectareCode: { contains: text, mode: 'insensitive' } },
        ] } : {}),
      },
      select: RECORD_SELECT, orderBy: { startDate: 'desc' }, take: 500,
    });
    const shaped = rows.map((r) => this.shape(r));
    const data = q.status ? shaped.filter((r) => r.status === q.status) : shaped;
    const count = (s: string) => shaped.filter((r) => r.status === s).length;
    return { data, summary: { total: shaped.length, active: count('ACTIVE'), ended: count('ENDED'), terminated: count('TERMINATED'), openDisputes: shaped.reduce((n, r) => n + r.openDisputes, 0) } };
  }

  async get(id: string, actor: RequestUser) {
    const r = await this.prisma.amcosRentalRecord.findFirst({ where: { id, ...this.scope(actor) }, select: { ...RECORD_SELECT, disputes: { select: { id: true, type: true, description: true, status: true, resolution: true, createdAt: true }, orderBy: { createdAt: 'desc' } } } });
    if (!r) throw new NotFoundException('Rental record not found');
    const { disputes, ...rest } = r;
    return { ...this.shape(rest as unknown as Row), disputes };
  }

  /** What currently occupies a hectare, for the hectare page. */
  async forHectare(hectareId: string, actor: RequestUser) {
    const rows = await this.prisma.amcosRentalRecord.findMany({
      where: { hectareId, ...this.scope(actor) }, select: RECORD_SELECT, orderBy: { startDate: 'desc' }, take: 20,
    });
    const shaped = rows.map((r) => this.shape(r));
    return { current: shaped.find((r) => r.status === 'ACTIVE') ?? null, history: shaped.filter((r) => r.status !== 'ACTIVE') };
  }

  async addWitnessNote(id: string, note: string, actor: RequestUser) {
    const r = await this.prisma.amcosRentalRecord.findFirst({ where: { id, ...this.scope(actor) }, select: { id: true } });
    if (!r) throw new NotFoundException('Rental record not found');
    await this.prisma.amcosRentalRecord.update({ where: { id }, data: { witnessNote: note.trim(), witnessNoteAt: new Date(), witnessNoteById: actor.id } });
    return { saved: true };
  }

  async raiseDispute(id: string, dto: RaiseRentalDisputeDto, actor: RequestUser) {
    const r = await this.prisma.amcosRentalRecord.findFirst({ where: { id, ...this.scope(actor) }, select: { id: true, farmId: true, ownerFarmerId: true, tenantFarmerId: true } });
    if (!r) throw new NotFoundException('Rental record not found');
    if (actor.role === 'FARMER') throw new ForbiddenException('Ask your cooperative to record the dispute');
    const by = dto.raisedBy ?? 'AMCOS';
    const dispute = await this.prisma.dispute.create({
      data: {
        farmId: r.farmId, rentalRecordId: r.id, type: DisputeType.OTHER,
        description: `[Rental, raised by ${by.toLowerCase()}] ${dto.description.trim()}`,
        claimantIds: by === 'OWNER' ? [r.ownerFarmerId] : by === 'TENANT' ? [r.tenantFarmerId] : [],
        evidenceUrls: [], raisedByUserId: actor.id,
      },
      select: { id: true },
    });
    return dispute;
  }

  /** Writes the record for every active/finished M-LAX rental that has none (rentals activated before this feature). */
  async backfill(): Promise<number> {
    const missing = await this.prisma.landListing.findMany({
      where: { leaseStatus: { in: ['ACTIVE', 'COMPLETED', 'TERMINATED'] }, renterId: { not: null }, rentalRecord: null },
      select: { id: true, leaseStatus: true },
    });
    for (const m of missing) {
      await this.recordActivated(m.id);
      if (m.leaseStatus === 'TERMINATED') await this.markTerminated(m.id);
    }
    return missing.length;
  }
}
