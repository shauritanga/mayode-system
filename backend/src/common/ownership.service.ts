import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

export interface RequestUser {
  id: string;
  role: UserRole;
}

/** Roles that may act on any farmer/farm/plot regardless of ownership. */
const PRIVILEGED_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.FIELD_OFFICER,
  UserRole.MAMCOS_SECRETARY,
  UserRole.AUDITOR,
];

/**
 * OwnershipService — row-level authorization. Privileged staff bypass; a FARMER
 * may only touch resources belonging to their own farmer profile. Call these
 * from services before performing a mutation.
 */
@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  private isPrivileged(user: RequestUser): boolean {
    return PRIVILEGED_ROLES.includes(user.role);
  }

  /** Resolve the farmer.id owned by the requesting user (or null if not a farmer). */
  private async farmerIdForUser(userId: string): Promise<string | null> {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      select: { id: true },
    });
    return farmer?.id ?? null;
  }

  async assertFarmerAccess(user: RequestUser, farmerId: string): Promise<void> {
    if (this.isPrivileged(user)) return;
    const ownFarmerId = await this.farmerIdForUser(user.id);
    if (ownFarmerId !== farmerId) {
      throw new ForbiddenException('You can only access your own farmer records');
    }
  }

  async assertFarmAccess(user: RequestUser, farmId: string): Promise<void> {
    if (this.isPrivileged(user)) return;
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { farmerId: true },
    });
    if (!farm) throw new NotFoundException(`Farm with ID ${farmId} not found`);
    const ownFarmerId = await this.farmerIdForUser(user.id);
    if (ownFarmerId !== farm.farmerId) {
      throw new ForbiddenException('You can only access your own farms');
    }
  }

  async assertPlotAccess(user: RequestUser, plotId: string): Promise<void> {
    if (this.isPrivileged(user)) return;
    const plot = await this.prisma.plot.findUnique({
      where: { id: plotId },
      select: { farm: { select: { farmerId: true } } },
    });
    if (!plot) throw new NotFoundException(`Plot with ID ${plotId} not found`);
    const ownFarmerId = await this.farmerIdForUser(user.id);
    if (ownFarmerId !== plot.farm.farmerId) {
      throw new ForbiddenException('You can only access plots on your own farms');
    }
  }
}
