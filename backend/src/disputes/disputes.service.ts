import { Injectable, NotFoundException } from '@nestjs/common';
import { DisputeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestUser } from '../common/ownership.service';
import { CreateDisputeDto, ResolveDisputeDto } from './dto/disputes.dto';

const DISPUTE_INCLUDE = {
  farm: { select: { id: true, farmCode: true, name: true, farmerId: true } },
  lease: { select: { id: true, renterPhone: true, renterName: true } },
  farmingSeason: { select: { id: true, name: true } },
} satisfies Prisma.DisputeInclude;

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Whether a farm currently has an unresolved dispute (data-integrity rule
   * #12: conflicting claims must be flagged and access restricted for review,
   * not silently resolved).
   */
  async hasOpenDispute(farmId: string): Promise<boolean> {
    const count = await this.prisma.dispute.count({
      where: {
        farmId,
        status: {
          in: [
            DisputeStatus.OPEN,
            DisputeStatus.UNDER_REVIEW,
            DisputeStatus.FIELD_VERIFICATION_REQUIRED,
          ],
        },
      },
    });
    return count > 0;
  }

  /** `user` is omitted for system/phone-triggered disputes (e.g. a USSD rejection with no logged-in account). */
  async create(dto: CreateDisputeDto, user?: RequestUser) {
    const dispute = await this.prisma.dispute.create({
      data: {
        farmId: dto.farmId,
        leaseId: dto.leaseId,
        farmingSeasonId: dto.farmingSeasonId,
        type: dto.type,
        description: dto.description,
        claimantIds: dto.claimantIds ?? [],
        evidenceUrls: dto.evidenceUrls ?? [],
        raisedByUserId: user?.id,
        assignedOfficerId: dto.assignedOfficerId,
        status: DisputeStatus.OPEN,
      },
      include: DISPUTE_INCLUDE,
    });

    if (dispute.assignedOfficerId) {
      await this.notifications.create({
        userId: dispute.assignedOfficerId,
        type: 'dispute.assigned',
        title: 'Dispute assigned to you',
        body: `A ${dispute.type.replace(/_/g, ' ').toLowerCase()} dispute needs review${dispute.farm ? ` for farm ${dispute.farm.farmCode}` : ''}.`,
        data: { disputeId: dispute.id, farmId: dispute.farmId },
      });
    }
    return dispute;
  }

  findAll(status?: DisputeStatus) {
    return this.prisma.dispute.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: DISPUTE_INCLUDE,
    });
  }

  findForFarm(farmId: string) {
    return this.prisma.dispute.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      include: DISPUTE_INCLUDE,
    });
  }

  async resolve(id: string, dto: ResolveDisputeDto, user: RequestUser) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: DISPUTE_INCLUDE,
    });
    if (!dispute) throw new NotFoundException(`Dispute ${id} not found`);

    const status = dto.status as DisputeStatus;
    const closing =
      status === DisputeStatus.RESOLVED || status === DisputeStatus.REJECTED;

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        status,
        resolution: dto.resolution,
        resolvedByUserId: closing ? user.id : undefined,
        resolvedAt: closing ? new Date() : undefined,
      },
      include: DISPUTE_INCLUDE,
    });

    if (closing && dispute.farm?.farmerId) {
      const owner = await this.prisma.farmer.findUnique({
        where: { id: dispute.farm.farmerId },
        select: { userId: true },
      });
      if (owner) {
        await this.notifications.create({
          userId: owner.userId,
          type: 'dispute.resolved',
          title: `Dispute ${status.toLowerCase()}`,
          body: `The dispute on farm ${dispute.farm.farmCode} has been ${status.toLowerCase()}.${dto.resolution ? ` ${dto.resolution}` : ''}`,
          data: { disputeId: id, farmId: dispute.farmId },
        });
      }
    }
    return updated;
  }

  /** Raise an OWNER_REJECTS_RENTER dispute from a lease rejection or officer decision. */
  async createForLease(
    leaseId: string,
    farmId: string,
    type: Prisma.DisputeCreateInput['type'],
    description: string,
    user?: RequestUser,
  ) {
    return this.prisma.dispute.create({
      data: {
        farmId,
        leaseId,
        type,
        description,
        raisedByUserId: user?.id,
        status: DisputeStatus.OPEN,
      },
    });
  }
}
