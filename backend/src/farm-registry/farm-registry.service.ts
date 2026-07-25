import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FarmGrade,
  FarmRegistryStatus,
  OwnershipSource,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService, normalizeMsisdn } from '../messaging/sms.service';
import { RequestUser } from '../common/ownership.service';
import { PreRegisterFarmDto } from './dto/farm-registry.dto';

@Injectable()
export class FarmRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
  ) {}

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
    const ownerPhone = normalizeMsisdn(dto.ownerPhone);

    if (dto.plotNumber && dto.block) {
      const existing = await this.prisma.farmRegistryRecord.findFirst({
        where: {
          plotNumber: dto.plotNumber,
          block: dto.block,
          scheme: dto.scheme ?? null,
          status: { notIn: [FarmRegistryStatus.ARCHIVED, FarmRegistryStatus.INACTIVE] },
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
        ownerName: dto.ownerName,
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
        status: FarmRegistryStatus.OWNER_CONFIRMATION_PENDING,
        notes: dto.notes,
      },
    });

    // Notify the owner (in-app if they already have an account) + SMS.
    const account = await this.prisma.user.findUnique({
      where: { phone: ownerPhone },
      select: { id: true },
    });
    if (account) {
      await this.notifications.create({
        userId: account.id,
        type: 'registry.owner_confirmation',
        title: 'Confirm your farm',
        body: `A cooperative registered ${record.name} under your name. Open MAYOData to confirm it belongs to you.`,
        data: { registryId: record.id },
      });
    }
    await this.sms.send(
      ownerPhone,
      `MAYOData: AMCOS has registered farm "${record.name}" under your name. Open the app to confirm it is yours, or reply for help.`,
      'registry_owner_confirmation',
    );

    return record;
  }

  listAll(status?: FarmRegistryStatus, mamcosId?: string) {
    const where: Prisma.FarmRegistryRecordWhereInput = {};
    if (status) where.status = status;
    if (mamcosId) where.sourceMamcosId = mamcosId;
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
      throw new BadRequestException('Complete your farmer profile before claiming a farm');
    }
    return farmer;
  }

  private async assertOwnerByPhone(record: { ownerPhone: string }, user: RequestUser) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });
    if (!account?.phone || normalizeMsisdn(account.phone) !== record.ownerPhone) {
      throw new ForbiddenException('This farm was not registered under your phone number');
    }
  }

  /**
   * Owner confirms & claims a pre-registered farm: materialize a real Farm under
   * their Farmer, record a VERIFIED FarmOwnership (source AMCOS), and mark the
   * registry record CLAIMED. The AMCOS-provided details become the farm data —
   * the owner didn't have to re-enter them (prompt2 §13.8).
   */
  async claim(id: string, user: RequestUser) {
    const record = await this.prisma.farmRegistryRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Registry record ${id} not found`);
    if (record.status === FarmRegistryStatus.CLAIMED || record.farmId) {
      throw new BadRequestException('This farm has already been claimed');
    }
    await this.assertOwnerByPhone(record, user);
    const farmer = await this.farmerForUserOrFail(user.id);

    // Generate the farm code from the farmer's control number (matches FarmsService).
    const count = await this.prisma.farm.count({ where: { farmerId: farmer.id } });
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

  /** Owner says the farm is not theirs → mark disputed and alert the officer. */
  async reject(id: string, user: RequestUser) {
    const record = await this.prisma.farmRegistryRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Registry record ${id} not found`);
    await this.assertOwnerByPhone(record, user);

    const updated = await this.prisma.farmRegistryRecord.update({
      where: { id },
      data: { status: FarmRegistryStatus.DISPUTED },
    });
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
}
