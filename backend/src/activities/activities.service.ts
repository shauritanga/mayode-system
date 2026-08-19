import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  /** Record a farmer-facing activity event. Called from other services (farms, plots, uploads). */
  async log(
    farmerId: string | null | undefined,
    type: string,
    title: string,
    subtitle?: string,
    icon?: string,
  ) {
    if (!farmerId) return;
    return this.prisma.activity.create({
      data: { farmerId, type, title, subtitle, icon },
    });
  }

  async listForFarmer(farmerId: string, user: RequestUser, limit?: number) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.prisma.activity.findMany({
      where: { farmerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
