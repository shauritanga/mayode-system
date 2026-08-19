import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, VerificationStatus } from '@prisma/client';

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
 * may only touch resources for farms they are actively assigned to operate.
 * `Farm.farmerId` is retained as legacy/import metadata; it is not the access
 * authority for renter-operated AMCOS farms. Call these from services before
 * performing a mutation.
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
      throw new ForbiddenException(
        'You can only access your own farmer records',
      );
    }
  }

  async assertFarmAccess(user: RequestUser, farmId: string): Promise<void> {
    if (this.isPrivileged(user)) return;
    const ownFarmerId = await this.farmerIdForUser(user.id);
    if (!ownFarmerId) {
      throw new ForbiddenException(
        'A farmer profile is required to access a farm',
      );
    }

    // Primary path: verified seasonal operator (owner-operated or renter).
    const assignment = await this.prisma.seasonalFarmAssignment.findFirst({
      where: {
        farmId,
        activeFarmerId: ownFarmerId,
        status: VerificationStatus.VERIFIED,
        farmingSeason: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (assignment) return;

    // Owner of a personally registered farm may access without an assignment
    // (bootstrap for self-operate / first crop cycle). AMCOS/renter farms keep
    // Farm.farmerId as metadata and still require a verified assignment above.
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      select: { farmerId: true },
    });
    if (farm?.farmerId === ownFarmerId) return;

    throw new ForbiddenException(
      'You need an active, field-verified seasonal assignment to access this farm',
    );
  }

  async assertPlotAccess(user: RequestUser, plotId: string): Promise<void> {
    if (this.isPrivileged(user)) return;
    const plot = await this.prisma.plot.findUnique({
      where: { id: plotId },
      select: { farmId: true },
    });
    if (!plot) throw new NotFoundException(`Plot with ID ${plotId} not found`);
    await this.assertFarmAccess(user, plot.farmId);
  }
}
