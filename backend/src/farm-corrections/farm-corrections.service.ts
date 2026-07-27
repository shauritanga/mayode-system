import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FarmDataSource,
  SuggestedUpdateStatus,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestUser } from '../common/ownership.service';
import {
  EDITABLE_FARM_FIELDS,
  RecordFarmDataValueDto,
  ReviewFarmUpdateDto,
  SubmitFarmUpdateDto,
} from './dto/farm-corrections.dto';

/** Farm columns stored as a number rather than a string. */
const NUMERIC_FARM_FIELDS = new Set(['socialHectares']);

@Injectable()
export class FarmCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------ suggested updates

  /**
   * A farmer/renter/officer proposes a correction (prompt2 §19). Never applied
   * immediately — held for review so it can't silently overwrite verified data.
   */
  async submitUpdate(
    farmId: string,
    dto: SubmitFarmUpdateDto,
    user: RequestUser,
  ) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) throw new NotFoundException(`Farm ${farmId} not found`);

    const currentValue = (
      farm as unknown as Record<string, string | number | boolean | null>
    )[dto.fieldName];
    const update = await this.prisma.suggestedFarmUpdate.create({
      data: {
        farmId,
        submittedByUserId: user.id,
        fieldName: dto.fieldName,
        currentValue: currentValue == null ? null : String(currentValue),
        suggestedValue: dto.suggestedValue,
        evidenceUrls: dto.evidenceUrls ?? [],
      },
    });

    // Notify staff who manage this farm's cooperative — fall back to the farm owner's officer chain later; for now surface in the review queue only.
    return update;
  }

  listForFarm(farmId: string, status?: SuggestedUpdateStatus) {
    return this.prisma.suggestedFarmUpdate.findMany({
      where: { farmId, reviewStatus: status },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAll(status?: SuggestedUpdateStatus) {
    return this.prisma.suggestedFarmUpdate.findMany({
      where: status ? { reviewStatus: status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { farm: { select: { id: true, farmCode: true, name: true } } },
    });
  }

  /**
   * Officer/admin review. APPROVED/MERGED writes the field on Farm (whitelist
   * enforced by the DTO at submission time) and records a verified
   * FarmDataValue so the change stays source-tracked and auditable.
   */
  async review(id: string, dto: ReviewFarmUpdateDto, user: RequestUser) {
    const update = await this.prisma.suggestedFarmUpdate.findUnique({
      where: { id },
    });
    if (!update)
      throw new NotFoundException(`Suggested update ${id} not found`);
    if (update.reviewStatus !== SuggestedUpdateStatus.PENDING) {
      throw new BadRequestException(
        'This suggestion has already been reviewed',
      );
    }
    if (
      !EDITABLE_FARM_FIELDS.includes(
        update.fieldName as (typeof EDITABLE_FARM_FIELDS)[number],
      )
    ) {
      throw new BadRequestException(
        `Field "${update.fieldName}" cannot be applied automatically`,
      );
    }

    const status = SuggestedUpdateStatus[dto.decision];
    const applying =
      status === SuggestedUpdateStatus.APPROVED ||
      status === SuggestedUpdateStatus.MERGED;

    const result = await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.suggestedFarmUpdate.update({
        where: { id },
        data: {
          reviewStatus: status,
          reviewedByUserId: user.id,
          reviewNotes: dto.reviewNotes,
          reviewedAt: new Date(),
        },
      });

      if (applying) {
        const value: string | number = NUMERIC_FARM_FIELDS.has(update.fieldName)
          ? Number(update.suggestedValue)
          : update.suggestedValue;
        await tx.farm.update({
          where: { id: update.farmId },
          data: { [update.fieldName]: value },
        });
        await tx.farmDataValue.create({
          data: {
            farmId: update.farmId,
            fieldName: update.fieldName,
            value: update.suggestedValue,
            sourceType: FarmDataSource.OWNER,
            sourceId: update.submittedByUserId,
            verificationStatus: VerificationStatus.VERIFIED,
            verifiedAt: new Date(),
          },
        });
      }
      return reviewed;
    });

    if (update.submittedByUserId) {
      await this.notifications.create({
        userId: update.submittedByUserId,
        type: 'farm.correction_reviewed',
        title: applying
          ? 'Your farm correction was approved'
          : 'Your farm correction was rejected',
        body: `Your suggested update to "${update.fieldName}" was ${status.toLowerCase()}.`,
        data: { farmId: update.farmId, suggestedUpdateId: id },
      });
    }
    return result;
  }

  // ------------------------------------------------------------ data values

  /**
   * Record a source-tracked value for a farm attribute (prompt2 §16). If a
   * different, unresolved value already exists for the same field from
   * another source, both are flagged as conflicting rather than one silently
   * overwriting the other (data-integrity rule #12).
   */
  async recordValue(farmId: string, dto: RecordFarmDataValueDto) {
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { id: true },
    });
    if (!farm) throw new NotFoundException(`Farm ${farmId} not found`);

    return this.prisma.$transaction(async (tx) => {
      const conflicting = await tx.farmDataValue.findMany({
        where: {
          farmId,
          fieldName: dto.fieldName,
          supersededById: null,
          value: { not: dto.value },
        },
      });

      const created = await tx.farmDataValue.create({
        data: {
          farmId,
          fieldName: dto.fieldName,
          value: dto.value,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          confidenceLevel: dto.confidenceLevel,
          hasConflict: conflicting.length > 0,
        },
      });

      if (conflicting.length > 0) {
        await tx.farmDataValue.updateMany({
          where: { id: { in: conflicting.map((c) => c.id) } },
          data: { hasConflict: true },
        });
      }
      return created;
    });
  }

  listValuesForFarm(farmId: string) {
    return this.prisma.farmDataValue.findMany({
      where: { farmId },
      orderBy: [{ fieldName: 'asc' }, { recordedAt: 'desc' }],
    });
  }

  listConflicts() {
    return this.prisma.farmDataValue.findMany({
      where: { hasConflict: true, supersededById: null },
      orderBy: { recordedAt: 'desc' },
      include: { farm: { select: { id: true, farmCode: true, name: true } } },
    });
  }

  /**
   * Officer picks the correct value among conflicting sources for a field.
   * The chosen value is marked VERIFIED; every other unresolved value for
   * that farm+field is superseded by it and its conflict flag cleared.
   */
  async resolveConflict(
    farmId: string,
    fieldName: string,
    approvedValueId: string,
  ) {
    const approved = await this.prisma.farmDataValue.findUnique({
      where: { id: approvedValueId },
    });
    if (
      !approved ||
      approved.farmId !== farmId ||
      approved.fieldName !== fieldName
    ) {
      throw new BadRequestException(
        'approvedValueId does not match this farm/field',
      );
    }

    const others = await this.prisma.farmDataValue.findMany({
      where: {
        farmId,
        fieldName,
        id: { not: approvedValueId },
        supersededById: null,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.farmDataValue.update({
        where: { id: approvedValueId },
        data: {
          verificationStatus: VerificationStatus.VERIFIED,
          verifiedAt: new Date(),
          hasConflict: false,
        },
      });
      for (const other of others) {
        await tx.farmDataValue.update({
          where: { id: other.id },
          data: { supersededById: approvedValueId, hasConflict: false },
        });
      }
      return resolved;
    });
  }
}
