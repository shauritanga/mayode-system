import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  RewardCampaignStatus,
  RewardWinnerStatus,
  SelectionMethod,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../messaging/sms.service';
import { RequestUser } from '../common/ownership.service';
import { CreateRewardCampaignDto } from './dto/rewards.dto';

const SELECTION_ALGORITHM_VERSION = 'random-v1';

/** Deterministic PRNG (mulberry32) so a stored seed reproduces the same draw. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher–Yates shuffle — reproducible from the seed. */
function seededShuffle<T>(items: T[], seedHex: string): T[] {
  const seedInt = parseInt(createHash('sha256').update(seedHex).digest('hex').slice(0, 8), 16);
  const rand = mulberry32(seedInt);
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
  ) {}

  // ------------------------------------------------------------- campaigns

  createCampaign(dto: CreateRewardCampaignDto, user: RequestUser) {
    return this.prisma.rewardCampaign.create({
      data: {
        name: dto.name,
        description: dto.description,
        sponsor: dto.sponsor,
        rewardType: dto.rewardType,
        rewardQuantity: dto.rewardQuantity ?? 1,
        numberOfWinners: dto.numberOfWinners,
        farmingSeasonId: dto.farmingSeasonId,
        eligibleCooperatives: dto.eligibleCooperatives ?? [],
        eligibilityStartDate: dto.eligibilityStartDate ? new Date(dto.eligibilityStartDate) : undefined,
        eligibilityEndDate: dto.eligibilityEndDate ? new Date(dto.eligibilityEndDate) : undefined,
        selectionMethod: dto.selectionMethod ?? SelectionMethod.RANDOM,
        status: RewardCampaignStatus.ACTIVE,
        createdByUserId: user.id,
      },
    });
  }

  listCampaigns() {
    return this.prisma.rewardCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { winners: true } } },
    });
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.rewardCampaign.findUnique({
      where: { id },
      include: {
        winners: {
          include: { farmer: { select: { id: true, controlNumber: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);
    return campaign;
  }

  // ---------------------------------------------------------- eligibility

  /**
   * Eligible farmers (prompt §16): verified profile, at least one registered
   * farm, a valid phone, not blacklisted, and — when the campaign targets a
   * season/cooperatives — an active seasonal assignment / matching AMCOS.
   * Returns the farmer ids that make up the draw pool.
   */
  async computeEligible(campaignId: string): Promise<string[]> {
    const campaign = await this.getCampaign(campaignId);

    const farmers = await this.prisma.farmer.findMany({
      where: {
        verificationStatus: VerificationStatus.VERIFIED,
        isBlacklisted: false,
        farms: { some: {} }, // at least one registered farm
        user: { phone: { not: '' } },
        ...(campaign.eligibleCooperatives.length
          ? { mamcosId: { in: campaign.eligibleCooperatives } }
          : {}),
        ...(campaign.farmingSeasonId
          ? { seasonalAssignments: { some: { farmingSeasonId: campaign.farmingSeasonId } } }
          : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' }, // stable base order for reproducibility
    });
    return farmers.map((f) => f.id);
  }

  // ------------------------------------------------------------ selection

  /**
   * Run an auditable random selection: snapshot the eligible pool, store the
   * seed + algorithm version, deterministically shuffle and take N winners.
   * Reproducible — the same seed + snapshot yields the same winners.
   */
  async runSelection(campaignId: string) {
    const campaign = await this.getCampaign(campaignId);
    if (campaign.status === RewardCampaignStatus.ANNOUNCED || campaign.status === RewardCampaignStatus.FULFILLED) {
      throw new BadRequestException('Winners have already been announced for this campaign');
    }
    if (campaign.selectionMethod !== SelectionMethod.RANDOM) {
      throw new BadRequestException('Only RANDOM selection is automated; others are manual');
    }

    const eligible = await this.computeEligible(campaignId);
    if (eligible.length === 0) {
      throw new BadRequestException('No eligible farmers for this campaign');
    }

    const seed = randomBytes(16).toString('hex');
    const winners = seededShuffle(eligible, seed).slice(0, campaign.numberOfWinners);

    // Pick a representative farm per winner for the award record.
    const created = await this.prisma.$transaction(async (tx) => {
      // Clear any prior un-announced selection so re-runs are clean.
      await tx.rewardWinner.deleteMany({
        where: { campaignId, status: RewardWinnerStatus.SELECTED },
      });

      for (const farmerId of winners) {
        const farm = await tx.farm.findFirst({
          where: { farmerId },
          select: { id: true },
        });
        await tx.rewardWinner.create({
          data: {
            campaignId,
            farmerId,
            farmId: farm?.id,
            rewardType: campaign.rewardType,
            quantity: campaign.rewardQuantity,
            status: RewardWinnerStatus.SELECTED,
          },
        });
      }

      return tx.rewardCampaign.update({
        where: { id: campaignId },
        data: {
          status: RewardCampaignStatus.WINNERS_SELECTED,
          selectionSeed: seed,
          selectionAlgorithmVersion: SELECTION_ALGORITHM_VERSION,
          eligibleSnapshot: eligible,
          selectedAt: new Date(),
        },
      });
    });

    return {
      campaignId,
      eligibleCount: eligible.length,
      winnersSelected: winners.length,
      seed,
      algorithmVersion: SELECTION_ALGORITHM_VERSION,
      status: created.status,
    };
  }

  /** Recompute the winners from a campaign's stored seed + snapshot (audit). */
  async reproduceSelection(campaignId: string) {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign.selectionSeed || !Array.isArray(campaign.eligibleSnapshot)) {
      throw new BadRequestException('Campaign has no recorded selection to reproduce');
    }
    const eligible = campaign.eligibleSnapshot as string[];
    const reproduced = seededShuffle(eligible, campaign.selectionSeed).slice(0, campaign.numberOfWinners);
    const actual = campaign.winners.map((w) => w.farmerId).sort();
    return {
      reproducedWinners: [...reproduced].sort(),
      actualWinners: actual,
      matches:
        reproduced.length === actual.length &&
        [...reproduced].sort().every((v, i) => v === actual[i]),
    };
  }

  /**
   * Approve and announce winners: notify each in-app and by SMS (owner comment
   * §9 congratulations message). Approval is required before announcement.
   */
  async approveAndNotify(campaignId: string, user: RequestUser) {
    const campaign = await this.getCampaign(campaignId);
    if (campaign.status !== RewardCampaignStatus.WINNERS_SELECTED) {
      throw new BadRequestException('Run winner selection before approving');
    }

    for (const winner of campaign.winners) {
      const farmer = await this.prisma.farmer.findUnique({
        where: { id: winner.farmerId },
        select: { userId: true, user: { select: { phone: true } }, farms: { select: { farmCode: true }, take: 1 } },
      });
      if (!farmer) continue;

      const farmCode = farmer.farms[0]?.farmCode ?? 'your farm';
      const msg = `Congratulations! You have been selected for MAYODE ${campaign.rewardType.toLowerCase().replace(/_/g, ' ')} support for ${farmCode}. You will receive ${winner.quantity}. A MAYODE officer will contact you with collection details.`;

      await this.notifications.create({
        userId: farmer.userId,
        type: 'reward.winner',
        title: 'You received a MAYODE reward',
        body: msg,
        data: { campaignId, winnerId: winner.id },
      });
      if (farmer.user?.phone) {
        await this.sms.send(farmer.user.phone, `MAYOData: ${msg}`, 'reward_winner');
      }
    }

    await this.prisma.$transaction([
      this.prisma.rewardWinner.updateMany({
        where: { campaignId },
        data: { status: RewardWinnerStatus.NOTIFIED, notifiedAt: new Date() },
      }),
      this.prisma.rewardCampaign.update({
        where: { id: campaignId },
        data: { status: RewardCampaignStatus.ANNOUNCED, approvedByUserId: user.id },
      }),
    ]);

    return { campaignId, notified: campaign.winners.length, status: RewardCampaignStatus.ANNOUNCED };
  }

  // --------------------------------------------------------------- farmer

  /** The current farmer's reward wins. */
  async myAwards(user: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!farmer) return [];
    return this.prisma.rewardWinner.findMany({
      where: { farmerId: farmer.id, status: { not: RewardWinnerStatus.SELECTED } }, // announced only
      orderBy: { createdAt: 'desc' },
      include: { campaign: { select: { id: true, name: true, sponsor: true } } },
    });
  }

  /** Farmer confirms they received the reward. */
  async confirmReceipt(winnerId: string, user: RequestUser) {
    const winner = await this.prisma.rewardWinner.findUnique({
      where: { id: winnerId },
      include: { farmer: { select: { userId: true } } },
    });
    if (!winner) throw new NotFoundException('Award not found');
    if (winner.farmer.userId !== user.id) {
      throw new ForbiddenException('This award does not belong to you');
    }
    return this.prisma.rewardWinner.update({
      where: { id: winnerId },
      data: { status: RewardWinnerStatus.CONFIRMED, confirmedAt: new Date() },
    });
  }
}
