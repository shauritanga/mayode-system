import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentType,
  LeaseStatus,
  OwnershipSource,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../messaging/sms.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import {
  ConfirmOwnershipDto,
  CreateFarmLeaseDto,
  OfficerVerifyLeaseDto,
  SelfOperateDto,
} from './dto/farm-leases.dto';

/** Normalize Tanzanian phone numbers for matching (+255..., 0..., 255...). */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('255')) return `+${digits}`;
  if (digits.startsWith('0')) return `+255${digits.slice(1)}`;
  return `+${digits}`;
}

// Shared include so the owner-notify helpers have farm, season and owner (with
// phone) on every lease they operate on.
const LEASE_INCLUDE = {
  farm: { select: { id: true, farmCode: true, name: true, farmerId: true } },
  farmingSeason: { select: { id: true, name: true } },
  ownerFarmer: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      user: { select: { phone: true } },
    },
  },
} satisfies Prisma.FarmLeaseInclude;

type LeaseFull = Prisma.FarmLeaseGetPayload<{ include: typeof LEASE_INCLUDE }>;

@Injectable()
export class FarmLeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
  ) {}

  private async farmerForUser(userId: string) {
    return this.prisma.farmer.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true, userId: true },
    });
  }

  // --------------------------------------------------------------- leases

  /**
   * Owner-initiated lease (owner comment §13.3): the owner names the renter;
   * the renter is notified and must confirm before becoming the active
   * seasonal user. Owner confirmation is implicit (they created the lease).
   */
  async create(dto: CreateFarmLeaseDto, user: RequestUser) {
    const farm = await this.prisma.farm.findUnique({
      where: { id: dto.farmId },
      select: { id: true, farmCode: true, name: true, farmerId: true },
    });
    if (!farm) throw new NotFoundException(`Farm ${dto.farmId} not found`);

    // Only the farm's legal owner (or staff) may lease it out.
    await this.ownership.assertFarmAccess(user, dto.farmId);

    const season = await this.prisma.farmingSeason.findUnique({
      where: { id: dto.farmingSeasonId },
      select: { id: true, name: true },
    });
    if (!season) throw new NotFoundException('Farming season not found');

    const start = new Date(dto.leaseStartDate);
    const end = new Date(dto.leaseEndDate);
    if (end <= start) {
      throw new BadRequestException('leaseEndDate must be after leaseStartDate');
    }

    const renterPhone = normalizePhone(dto.renterPhone);

    // Prevent duplicate open leases for the same farm and season.
    const existing = await this.prisma.farmLease.findFirst({
      where: {
        farmId: dto.farmId,
        farmingSeasonId: dto.farmingSeasonId,
        status: { in: [LeaseStatus.PENDING_VERIFICATION, LeaseStatus.ACTIVE] },
      },
    });
    if (existing) {
      throw new ConflictException(
        'This farm already has a pending or active lease for the selected season',
      );
    }

    // Match the renter to an existing account by phone, when possible.
    const renterUser = await this.prisma.user.findUnique({
      where: { phone: renterPhone },
      select: { id: true, farmer: { select: { id: true } } },
    });

    const lease = await this.prisma.farmLease.create({
      data: {
        farmId: dto.farmId,
        ownerFarmerId: farm.farmerId,
        renterFarmerId: renterUser?.farmer?.id,
        renterName: dto.renterName,
        renterPhone,
        farmingSeasonId: dto.farmingSeasonId,
        leaseStartDate: start,
        leaseEndDate: end,
        ownerConfirmationStatus: VerificationStatus.VERIFIED,
        notes: dto.notes,
      },
      include: { farm: { select: { farmCode: true, name: true } }, farmingSeason: true },
    });

    if (renterUser) {
      await this.notifications.create({
        userId: renterUser.id,
        type: 'lease.assigned',
        title: 'Farm lease confirmation needed',
        body: `You have been identified as the renter of farm ${farm.name} (${farm.farmCode}) for ${season.name}. Please confirm the lease.`,
        data: { leaseId: lease.id, farmId: farm.id },
      });
    }
    // Always SMS the renter too, so feature-phone users can confirm without the app.
    await this.sms.send(
      renterPhone,
      `MAYOData: You have been registered as the renter of farm ${farm.farmCode} for ${season.name}. Reply 1 to confirm or 2 to reject.`,
      'lease_invite',
    );

    return lease;
  }

  /** Leases where the user is the owner or the (matched) renter. */
  async findMine(user: RequestUser) {
    const [farmer, account] = await Promise.all([
      this.farmerForUser(user.id),
      this.prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } }),
    ]);
    const or: Prisma.FarmLeaseWhereInput[] = [];
    if (farmer) {
      or.push({ ownerFarmerId: farmer.id }, { renterFarmerId: farmer.id });
    }
    if (account?.phone) or.push({ renterPhone: normalizePhone(account.phone) });
    if (or.length === 0) return [];

    return this.prisma.farmLease.findMany({
      where: { OR: or },
      orderBy: { createdAt: 'desc' },
      include: {
        farm: { select: { id: true, farmCode: true, name: true } },
        farmingSeason: { select: { id: true, name: true } },
        ownerFarmer: { select: { id: true, firstName: true, lastName: true } },
        renterFarmer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  findForFarm(farmId: string) {
    return this.prisma.farmLease.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      include: {
        farmingSeason: { select: { id: true, name: true } },
        renterFarmer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  private async findLeaseOrFail(id: string) {
    const lease = await this.prisma.farmLease.findUnique({
      where: { id },
      include: LEASE_INCLUDE,
    });
    if (!lease) throw new NotFoundException(`Lease ${id} not found`);
    return lease;
  }

  /** Assert that the requesting user is this lease's renter (by farmer id or phone). */
  private async assertRenter(
    lease: { renterFarmerId: string | null; renterPhone: string },
    user: RequestUser,
  ) {
    const [farmer, account] = await Promise.all([
      this.farmerForUser(user.id),
      this.prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } }),
    ]);
    const isRenterFarmer = farmer && lease.renterFarmerId === farmer.id;
    const isRenterPhone =
      account?.phone && normalizePhone(account.phone) === lease.renterPhone;
    if (!isRenterFarmer && !isRenterPhone) {
      throw new ForbiddenException('Only the named renter can respond to this lease');
    }
    return farmer;
  }

  /**
   * Renter confirms the lease (in-app). When confirmed, the renter becomes the
   * active seasonal user (SeasonalFarmAssignment) — the legal owner is never
   * replaced on the farm record.
   */
  async renterConfirm(id: string, user: RequestUser) {
    const lease = await this.findLeaseOrFail(id);
    if (lease.status !== LeaseStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(`Lease is ${lease.status.toLowerCase()}, not awaiting confirmation`);
    }
    const renterFarmer = await this.assertRenter(lease, user);
    if (!renterFarmer) {
      throw new BadRequestException(
        'Complete your farmer profile before confirming a lease',
      );
    }
    return this.applyRenterConfirm(lease, renterFarmer.id);
  }

  /** Renter rejects the lease (in-app); the owner is notified and it is closed. */
  async renterReject(id: string, user: RequestUser) {
    const lease = await this.findLeaseOrFail(id);
    if (lease.status !== LeaseStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(`Lease is ${lease.status.toLowerCase()}, not awaiting confirmation`);
    }
    await this.assertRenter(lease, user);
    return this.applyRenterReject(lease);
  }

  /**
   * Core confirmation. `renterFarmerId` is null for a feature-phone renter who
   * has no account yet: we record their confirmation but defer the seasonal
   * assignment until they register (there is no farmer to make active). The
   * owner is always notified in-app (if they have an account) and by SMS.
   */
  private async applyRenterConfirm(lease: LeaseFull, renterFarmerId: string | null) {
    let updated;
    if (renterFarmerId) {
      try {
        updated = await this.prisma.$transaction(async (tx) => {
          const u = await tx.farmLease.update({
            where: { id: lease.id },
            data: {
              renterFarmerId,
              renterConfirmationStatus: VerificationStatus.VERIFIED,
              status: LeaseStatus.ACTIVE,
            },
          });
          await tx.seasonalFarmAssignment.create({
            data: {
              farmId: lease.farmId,
              farmingSeasonId: lease.farmingSeasonId,
              activeFarmerId: renterFarmerId,
              leaseId: lease.id,
              assignmentType: AssignmentType.RENTED,
              status: VerificationStatus.VERIFIED,
            },
          });
          await tx.farm.update({
            where: { id: lease.farmId },
            data: { isLeased: true, leaseLockedUntil: u.leaseEndDate },
          });
          return u;
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(
            'This farm already has an active seasonal operator for the selected season',
          );
        }
        throw e;
      }
    } else {
      updated = await this.prisma.farmLease.update({
        where: { id: lease.id },
        data: { renterConfirmationStatus: VerificationStatus.VERIFIED },
      });
    }

    if (lease.ownerFarmer?.userId) {
      await this.notifications.create({
        userId: lease.ownerFarmer.userId,
        type: 'lease.renter_confirmed',
        title: 'Renter confirmed your lease',
        body: `The renter confirmed the lease for farm ${lease.farm.name} (${lease.farm.farmCode}) for ${lease.farmingSeason.name}.`,
        data: { leaseId: lease.id, farmId: lease.farmId },
      });
    }
    const ownerPhone = lease.ownerFarmer?.user?.phone;
    if (ownerPhone) {
      await this.sms.send(
        ownerPhone,
        `MAYOData: The renter confirmed the lease for farm ${lease.farm.farmCode} (${lease.farmingSeason.name}).`,
        'lease_outcome',
      );
    }
    return updated;
  }

  /** Core rejection: close the lease and notify the owner (in-app + SMS). */
  private async applyRenterReject(lease: LeaseFull) {
    const updated = await this.prisma.farmLease.update({
      where: { id: lease.id },
      data: {
        renterConfirmationStatus: VerificationStatus.REJECTED,
        status: LeaseStatus.TERMINATED,
      },
    });

    if (lease.ownerFarmer?.userId) {
      await this.notifications.create({
        userId: lease.ownerFarmer.userId,
        type: 'lease.renter_rejected',
        title: 'Renter rejected your lease',
        body: `The named renter rejected the lease for farm ${lease.farm.name} (${lease.farm.farmCode}).`,
        data: { leaseId: lease.id, farmId: lease.farmId },
      });
    }
    const ownerPhone = lease.ownerFarmer?.user?.phone;
    if (ownerPhone) {
      await this.sms.send(
        ownerPhone,
        `MAYOData: The renter rejected the lease for farm ${lease.farm.farmCode}.`,
        'lease_outcome',
      );
    }
    return updated;
  }

  // ---------------------------------------------- feature-phone (SMS / USSD)

  /** Pending leases awaiting confirmation from a given renter phone number. */
  async pendingLeasesByPhone(phone: string) {
    return this.prisma.farmLease.findMany({
      where: { renterPhone: normalizePhone(phone), status: LeaseStatus.PENDING_VERIFICATION },
      orderBy: { createdAt: 'desc' },
      include: LEASE_INCLUDE,
    });
  }

  /**
   * Confirm the caller's most recent pending lease by phone (SMS reply / USSD).
   * If a farmer account exists for the phone, it is fully activated; otherwise
   * the confirmation is recorded and activation happens at registration.
   */
  async confirmLeaseByPhone(phone: string) {
    const p = normalizePhone(phone);
    const lease = await this.prisma.farmLease.findFirst({
      where: { renterPhone: p, status: LeaseStatus.PENDING_VERIFICATION },
      orderBy: { createdAt: 'desc' },
      include: LEASE_INCLUDE,
    });
    if (!lease) return { ok: false as const, message: 'No pending lease found for this number.' };

    const account = await this.prisma.user.findUnique({
      where: { phone: p },
      select: { farmer: { select: { id: true } } },
    });
    await this.applyRenterConfirm(lease, account?.farmer?.id ?? null);
    return {
      ok: true as const,
      farmCode: lease.farm.farmCode,
      season: lease.farmingSeason.name,
      activated: Boolean(account?.farmer),
    };
  }

  /** Reject the caller's most recent pending lease by phone (SMS reply / USSD). */
  async rejectLeaseByPhone(phone: string) {
    const p = normalizePhone(phone);
    const lease = await this.prisma.farmLease.findFirst({
      where: { renterPhone: p, status: LeaseStatus.PENDING_VERIFICATION },
      orderBy: { createdAt: 'desc' },
      include: LEASE_INCLUDE,
    });
    if (!lease) return { ok: false as const, message: 'No pending lease found for this number.' };
    await this.applyRenterReject(lease);
    return { ok: true as const, farmCode: lease.farm.farmCode };
  }

  /** Officer-assisted verification (owner comment §8): final staff sign-off. */
  async officerVerify(id: string, user: RequestUser, dto: OfficerVerifyLeaseDto) {
    const lease = await this.findLeaseOrFail(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.farmLease.update({
        where: { id },
        data: {
          officerConfirmationStatus: VerificationStatus.VERIFIED,
          notes: dto.notes ?? lease.notes,
        },
      });
      await tx.seasonalFarmAssignment.updateMany({
        where: { leaseId: id },
        data: { status: VerificationStatus.VERIFIED },
      });
      return result;
    });
    return updated;
  }

  // -------------------------------------------------- seasonal assignments

  /**
   * Owner declares self-farming for a season (owner comment §12): creates an
   * OWNER_OPERATED assignment for the owner's own farm.
   */
  async selfOperate(dto: SelfOperateDto, user: RequestUser) {
    await this.ownership.assertFarmAccess(user, dto.farmId);
    const farm = await this.prisma.farm.findUnique({
      where: { id: dto.farmId },
      select: { farmerId: true },
    });
    if (!farm) throw new NotFoundException(`Farm ${dto.farmId} not found`);
    const season = await this.prisma.farmingSeason.findUnique({
      where: { id: dto.farmingSeasonId },
      select: { id: true },
    });
    if (!season) throw new NotFoundException('Farming season not found');

    try {
      return await this.prisma.seasonalFarmAssignment.create({
        data: {
          farmId: dto.farmId,
          farmingSeasonId: dto.farmingSeasonId,
          activeFarmerId: farm.farmerId,
          assignmentType: AssignmentType.OWNER_OPERATED,
          status: VerificationStatus.VERIFIED,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'This farm already has a seasonal operator for the selected season',
        );
      }
      throw e;
    }
  }

  /** Seasonal assignments where the user is the active farmer. */
  async myAssignments(user: RequestUser) {
    const farmer = await this.farmerForUser(user.id);
    if (!farmer) return [];
    return this.prisma.seasonalFarmAssignment.findMany({
      where: { activeFarmerId: farmer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        farm: { select: { id: true, farmCode: true, name: true } },
        farmingSeason: { select: { id: true, name: true, startDate: true, endDate: true } },
        lease: { select: { id: true, leaseStartDate: true, leaseEndDate: true } },
      },
    });
  }

  findAssignmentsForFarm(farmId: string) {
    return this.prisma.seasonalFarmAssignment.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      include: {
        farmingSeason: { select: { id: true, name: true } },
        activeFarmer: { select: { id: true, firstName: true, lastName: true } },
        lease: { select: { id: true } },
      },
    });
  }

  // ------------------------------------------------------------ ownership

  /**
   * Owner confirms that a farm registered under their profile really belongs
   * to them (owner comment §13.2). Creates/updates the FarmOwnership record.
   */
  async confirmOwnership(farmId: string, user: RequestUser, dto: ConfirmOwnershipDto) {
    await this.ownership.assertFarmAccess(user, farmId);
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true, farmerId: true, ownerName: true, ownerPhone: true },
    });
    if (!farm) throw new NotFoundException(`Farm ${farmId} not found`);

    const existing = await this.prisma.farmOwnership.findFirst({
      where: { farmId, ownerFarmerId: farm.farmerId },
    });

    if (existing) {
      return this.prisma.farmOwnership.update({
        where: { id: existing.id },
        data: {
          confirmationStatus: VerificationStatus.VERIFIED,
          confirmedAt: new Date(),
          notes: dto.notes ?? existing.notes,
        },
      });
    }

    return this.prisma.farmOwnership.create({
      data: {
        farmId,
        ownerFarmerId: farm.farmerId,
        source: OwnershipSource.OWNER,
        confirmationStatus: VerificationStatus.VERIFIED,
        confirmedAt: new Date(),
        notes: dto.notes,
      },
    });
  }

  findOwnershipForFarm(farmId: string) {
    return this.prisma.farmOwnership.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      include: {
        ownerFarmer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
