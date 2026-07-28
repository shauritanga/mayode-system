import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfirmationChannel,
  ConfirmationRequestStatus,
  FarmGrade,
  FarmRegistryRecord,
  FarmRegistryStatus,
  MamcosStaffRole,
  OwnershipSource,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService, normalizeMsisdn } from '../messaging/sms.service';
import { RequestUser } from '../common/ownership.service';
import { DisputesService } from '../disputes/disputes.service';
import { PreRegisterFarmDto } from './dto/farm-registry.dto';

const REQUEST_TTL_HOURS = 72;
const RESEND_COOLDOWN_MINUTES = 15;
const MAX_RESENDS = 3;

@Injectable()
export class FarmRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
    private readonly disputes: DisputesService,
  ) {}

  // ------------------------------------------------- confirmation requests

  /**
   * Send (or resend) an expiring owner-confirmation request (prompt2 §5 /
   * prompt.md §10). Rate-limited so a stale request can't be replayed
   * indefinitely and an owner can't be spammed with resends.
   */
  private async sendConfirmationRequest(
    record: {
      id: string;
      ownerName: string;
      ownerPhone: string;
      name: string | null;
    },
    channel: ConfirmationChannel = ConfirmationChannel.SMS,
  ) {
    const active = await this.prisma.ownerConfirmationRequest.findFirst({
      where: {
        registryRecordId: record.id,
        status: ConfirmationRequestStatus.SENT,
      },
      orderBy: { sentAt: 'desc' },
    });

    const now = new Date();
    if (active) {
      if (active.expiresAt > now) {
        const cooldownUntil = new Date(
          active.sentAt.getTime() + RESEND_COOLDOWN_MINUTES * 60_000,
        );
        if (now < cooldownUntil) {
          throw new BadRequestException(
            `Please wait before resending — try again after ${cooldownUntil.toISOString()}`,
          );
        }
        if (active.resendCount >= MAX_RESENDS) {
          throw new BadRequestException(
            'Maximum resend attempts reached for this confirmation request',
          );
        }
      } else {
        await this.prisma.ownerConfirmationRequest.update({
          where: { id: active.id },
          data: { status: ConfirmationRequestStatus.EXPIRED },
        });
      }
    }

    const message = `MAYOData: AMCOS registered farm "${record.name || 'a farm'}" under your name. Reply 1 for YES or 2 for NO, or open the app to confirm.`;

    const request = await this.prisma.ownerConfirmationRequest.create({
      data: {
        registryRecordId: record.id,
        phone: record.ownerPhone,
        channel,
        message,
        status: ConfirmationRequestStatus.SENT,
        resendCount:
          active && active.expiresAt > now ? active.resendCount + 1 : 0,
        expiresAt: new Date(now.getTime() + REQUEST_TTL_HOURS * 60 * 60_000),
      },
    });

    if (channel === ConfirmationChannel.SMS) {
      await this.sms.send(
        record.ownerPhone,
        message,
        'registry_owner_confirmation',
      );
    }
    return request;
  }

  /** Staff-triggered resend for an owner who hasn't responded yet. */
  async resendConfirmation(registryRecordId: string) {
    const record = await this.prisma.farmRegistryRecord.findUnique({
      where: { id: registryRecordId },
    });
    if (!record)
      throw new NotFoundException(
        `Registry record ${registryRecordId} not found`,
      );
    return this.sendConfirmationRequest(record);
  }

  listConfirmationRequests(registryRecordId: string) {
    return this.prisma.ownerConfirmationRequest.findMany({
      where: { registryRecordId },
      orderBy: { sentAt: 'desc' },
    });
  }

  /** Marks the active request answered; a no-op if it already expired (rule: don't reuse expired requests). */
  private async respondToActiveRequest(
    registryRecordId: string,
    response: 'YES' | 'NO',
  ) {
    const active = await this.prisma.ownerConfirmationRequest.findFirst({
      where: { registryRecordId, status: ConfirmationRequestStatus.SENT },
      orderBy: { sentAt: 'desc' },
    });
    if (!active) return null;
    if (active.expiresAt < new Date()) {
      await this.prisma.ownerConfirmationRequest.update({
        where: { id: active.id },
        data: { status: ConfirmationRequestStatus.EXPIRED },
      });
      return null;
    }
    return this.prisma.ownerConfirmationRequest.update({
      where: { id: active.id },
      data: {
        status:
          response === 'YES'
            ? ConfirmationRequestStatus.CONFIRMED
            : ConfirmationRequestStatus.REJECTED,
        response,
        respondedAt: new Date(),
      },
    });
  }

  private buildName(dto: PreRegisterFarmDto): string {
    if (dto.name?.trim()) return dto.name.trim();
    const parts = [
      dto.plotNumber ? `Plot No. ${dto.plotNumber}` : null,
      dto.block ? `Block ${dto.block}` : null,
      dto.section ? `${dto.section} Section` : null,
      dto.village,
    ].filter(Boolean);
    return parts.join(', ') || 'Pre-registered farm';
  }

  /**
   * A cooperative pre-registers a farm under a known owner (prompt2 §2). The
   * owner is SMS-notified to confirm & complete their profile. Deduped by
   * (scheme, block, plotNumber) where those are provided.
   */
  async preRegister(dto: PreRegisterFarmDto, user: RequestUser) {
    const ownerPhone = dto.ownerPhone ? normalizeMsisdn(dto.ownerPhone) : '';

    if (dto.plotNumber && dto.block) {
      const existing = await this.prisma.farmRegistryRecord.findFirst({
        where: {
          plotNumber: dto.plotNumber,
          block: dto.block,
          scheme: dto.scheme ?? null,
          status: {
            notIn: [FarmRegistryStatus.ARCHIVED, FarmRegistryStatus.INACTIVE],
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'A farm with this plot and block is already registered in this scheme',
        );
      }
    }

    const record = await this.prisma.farmRegistryRecord.create({
      data: {
        sourceMamcosId: dto.sourceMamcosId,
        sourceOfficerId: user.id,
        ownerName: dto.ownerName || 'AMCOS',
        ownerPhone,
        ownerNationalId: dto.ownerNationalId,
        name: this.buildName(dto),
        plotNumber: dto.plotNumber,
        block: dto.block,
        canal: dto.canal,
        scheme: dto.scheme,
        section: dto.section,
        village: dto.village,
        ward: dto.ward,
        district: dto.district,
        region: dto.region,
        farmSizeHectares: dto.farmSizeHectares,
        status: FarmRegistryStatus.PRE_REGISTERED,
        notes: dto.notes,
      },
    });

    // Create the official AMCOS farm immediately. Mapping happens before a
    // renter is assigned, so there is intentionally no farmerId here.
    const farm = await this.prisma.farm.create({
      data: {
        farmCode: `AMCOS-${record.id.slice(0, 8).toUpperCase()}`,
        mamcosId: record.sourceMamcosId,
        name: record.name || this.buildName(dto),
        plotNumber: record.plotNumber,
        blockNumber: record.block,
        section: record.section,
        village: record.village,
        ward: record.ward,
        district: record.district,
        region: record.region,
        socialHectares: record.farmSizeHectares || 0.1,
        grade: FarmGrade.C,
        ownershipType: 'LEASED',
        ownerName: 'AMCOS',
        photoUrls: [],
      },
    });
    const updated = await this.prisma.farmRegistryRecord.update({
      where: { id: record.id },
      data: { farmId: farm.id },
      include: { mamcos: { select: { id: true, name: true } } },
    });
    return { ...updated, farm };
  }

  async listAll(status?: FarmRegistryStatus, mamcosId?: string, user?: RequestUser) {
    const where: Prisma.FarmRegistryRecordWhereInput = {};
    if (status) where.status = status;
    if (user?.role === 'MAMCOS_SECRETARY') {
      const secretary = await this.prisma.mamcosStaff.findFirst({
        where: { userId: user.id, role: MamcosStaffRole.SECRETARY }, select: { mamcosId: true },
      });
      if (!secretary) throw new ForbiddenException('AMCOS officer profile is missing');
      // AMCOS officers may never widen their own registry scope via a query parameter.
      where.sourceMamcosId = secretary.mamcosId;
    } else if (mamcosId) where.sourceMamcosId = mamcosId;
    return this.prisma.farmRegistryRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { mamcos: { select: { id: true, name: true } } },
      take: 200,
    });
  }

  /** Pre-registered farms awaiting confirmation from the current user (by phone). */
  async mine(user: RequestUser) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });
    if (!account?.phone) return [];
    return this.prisma.farmRegistryRecord.findMany({
      where: {
        ownerPhone: normalizeMsisdn(account.phone),
        status: {
          in: [
            FarmRegistryStatus.OWNER_CONFIRMATION_PENDING,
            FarmRegistryStatus.OWNER_CONFIRMED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      include: { mamcos: { select: { id: true, name: true } } },
    });
  }

  private async farmerForUserOrFail(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      select: { id: true, controlNumber: true },
    });
    if (!farmer) {
      throw new BadRequestException(
        'Complete your farmer profile before claiming a farm',
      );
    }
    return farmer;
  }

  private async assertOwnerByPhone(
    record: { ownerPhone: string },
    user: RequestUser,
  ) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });
    if (
      !account?.phone ||
      normalizeMsisdn(account.phone) !== record.ownerPhone
    ) {
      throw new ForbiddenException(
        'This farm was not registered under your phone number',
      );
    }
  }

  /**
   * Owner confirms & claims a pre-registered farm: materialize a real Farm under
   * their Farmer, record a VERIFIED FarmOwnership (source AMCOS), and mark the
   * registry record CLAIMED. The AMCOS-provided details become the farm data —
   * the owner didn't have to re-enter them (prompt2 §13.8).
   */
  async claim(id: string, user: RequestUser) {
    const record = await this.prisma.farmRegistryRecord.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException(`Registry record ${id} not found`);
    if (record.status === FarmRegistryStatus.CLAIMED || record.farmId) {
      throw new BadRequestException('This farm has already been claimed');
    }
    await this.assertOwnerByPhone(record, user);
    const farmer = await this.farmerForUserOrFail(user.id);

    const result = await this.materializeClaim(record, farmer);
    await this.respondToActiveRequest(id, 'YES');
    return result;
  }

  /** Core materialization, shared by the in-app claim and the phone/USSD confirm path once an account exists. */
  private async materializeClaim(
    record: FarmRegistryRecord,
    farmer: { id: string; controlNumber: string },
  ) {
    const id = record.id;
    // Generate the farm code from the farmer's control number (matches FarmsService).
    const count = await this.prisma.farm.count({
      where: { farmerId: farmer.id },
    });
    const farmCode = `${farmer.controlNumber}-${(count + 1).toString().padStart(2, '0')}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const farm = await tx.farm.create({
        data: {
          farmCode,
          farmerId: farmer.id,
          mamcosId: record.sourceMamcosId,
          name: record.name ?? farmCode,
          plotNumber: record.plotNumber,
          blockNumber: record.block,
          section: record.section,
          village: record.village,
          ward: record.ward,
          district: record.district,
          region: record.region,
          socialHectares: record.farmSizeHectares ?? 0.1,
          grade: FarmGrade.C,
          ownershipType: 'OWNED',
        },
      });

      await tx.farmOwnership.create({
        data: {
          farmId: farm.id,
          ownerFarmerId: farmer.id,
          ownerName: record.ownerName,
          ownerPhone: record.ownerPhone,
          source: OwnershipSource.AMCOS,
          confirmationStatus: VerificationStatus.VERIFIED,
          confirmedAt: new Date(),
        },
      });

      const updatedRecord = await tx.farmRegistryRecord.update({
        where: { id },
        data: {
          status: FarmRegistryStatus.CLAIMED,
          farmId: farm.id,
          claimedByFarmerId: farmer.id,
        },
      });

      return { farm, record: updatedRecord };
    });

    // Notify the AMCOS officer who registered it, if any.
    if (record.sourceOfficerId) {
      await this.notifications.create({
        userId: record.sourceOfficerId,
        type: 'registry.claimed',
        title: 'Owner confirmed a pre-registered farm',
        body: `${record.ownerName} confirmed and claimed ${record.name}.`,
        data: { registryId: record.id, farmId: result.farm.id },
      });
    }
    return result;
  }

  /** Owner says the farm is not theirs → mark disputed, open a Dispute, and alert the officer. */
  async reject(id: string, user: RequestUser) {
    const record = await this.prisma.farmRegistryRecord.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException(`Registry record ${id} not found`);
    await this.assertOwnerByPhone(record, user);

    const updated = await this.finalizeRejection(record, user);
    await this.respondToActiveRequest(id, 'NO');
    return updated;
  }

  private async finalizeRejection(
    record: FarmRegistryRecord,
    user?: RequestUser,
  ) {
    const updated = await this.prisma.farmRegistryRecord.update({
      where: { id: record.id },
      data: { status: FarmRegistryStatus.DISPUTED },
    });
    await this.disputes.create(
      {
        farmId: record.farmId ?? undefined,
        type: 'UNKNOWN_OWNER',
        description: `${record.ownerName} says pre-registered farm "${record.name}" (registry record ${record.id}) does not belong to them.`,
        assignedOfficerId: record.sourceOfficerId ?? undefined,
      },
      user,
    );
    if (record.sourceOfficerId) {
      await this.notifications.create({
        userId: record.sourceOfficerId,
        type: 'registry.disputed',
        title: 'Ownership rejected',
        body: `${record.ownerName} says ${record.name} is not theirs. Please review.`,
        data: { registryId: record.id },
      });
    }
    return updated;
  }

  // ---------------------------------------------- feature-phone (SMS / USSD)

  /** Pre-registered farms awaiting confirmation from a given owner phone number. */
  async pendingByPhone(phone: string) {
    const p = normalizeMsisdn(phone);
    return this.prisma.farmRegistryRecord.findMany({
      where: {
        ownerPhone: p,
        status: FarmRegistryStatus.OWNER_CONFIRMATION_PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Confirm the caller's most recent pending registry record by phone (SMS
   * reply / USSD). If the caller already has a farmer account, the farm is
   * fully materialized; otherwise the confirmation is recorded and the claim
   * happens once they register (mirrors FarmLeasesService.confirmLeaseByPhone).
   */
  async confirmByPhone(phone: string) {
    const p = normalizeMsisdn(phone);
    const record = await this.prisma.farmRegistryRecord.findFirst({
      where: {
        ownerPhone: p,
        status: FarmRegistryStatus.OWNER_CONFIRMATION_PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record)
      return {
        ok: false as const,
        message: 'No pending farm confirmation found for this number.',
      };

    const account = await this.prisma.user.findUnique({
      where: { phone: p },
      select: { farmer: { select: { id: true, controlNumber: true } } },
    });

    if (account?.farmer) {
      await this.materializeClaim(record, account.farmer);
      await this.respondToActiveRequest(record.id, 'YES');
      return { ok: true as const, name: record.name, claimed: true };
    }

    await this.prisma.farmRegistryRecord.update({
      where: { id: record.id },
      data: { status: FarmRegistryStatus.OWNER_CONFIRMED },
    });
    await this.respondToActiveRequest(record.id, 'YES');
    return { ok: true as const, name: record.name, claimed: false };
  }

  /** Reject the caller's most recent pending registry record by phone (SMS reply / USSD). */
  async rejectByPhone(phone: string) {
    const p = normalizeMsisdn(phone);
    const record = await this.prisma.farmRegistryRecord.findFirst({
      where: {
        ownerPhone: p,
        status: FarmRegistryStatus.OWNER_CONFIRMATION_PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record)
      return {
        ok: false as const,
        message: 'No pending farm confirmation found for this number.',
      };
    await this.finalizeRejection(record);
    await this.respondToActiveRequest(record.id, 'NO');
    return { ok: true as const, name: record.name };
  }
}
