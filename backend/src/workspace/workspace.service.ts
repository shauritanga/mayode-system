import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  FarmRegistryStatus,
  LeaseStatus,
  MamcosStaffRole,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';

/** True when boundaryCoordinates has a polygon ring with at least 3 points. */
function isBoundaryMapped(boundaryCoordinates: unknown): boolean {
  if (!boundaryCoordinates || typeof boundaryCoordinates !== 'object') return false;
  const raw: any = boundaryCoordinates;
  const geom =
    raw.type === 'Feature' && raw.geometry
      ? raw.geometry
      : raw.type === 'FeatureCollection' && Array.isArray(raw.features)
        ? raw.features[0]?.geometry
        : raw.geometry || raw;
  const ring = geom?.coordinates?.[0];
  return Array.isArray(ring) && ring.length >= 3;
}
/**
 * A deliberately small, role-scoped read model used by both mobile and web.
 * It prevents clients from guessing which unrelated datasets to load and is
 * the single source for workspace navigation and task counts.
 */
@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async context(user: RequestUser) {
    switch (user.role) {
      case UserRole.FARMER:
        return this.renterContext(user.id);
      case UserRole.FIELD_OFFICER:
        return this.officerContext(user.id);
      case UserRole.MAMCOS_SECRETARY:
        return this.mamcosContext(user.id);
      case UserRole.ADMIN:
      case UserRole.SUPER_ADMIN:
        return this.adminContext();
      default:
        throw new ForbiddenException(
          'This role does not have an operational workspace',
        );
    }
  }

  private async renterContext(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      select: { id: true },
    });
    const assignments = farmer
      ? await this.prisma.seasonalFarmAssignment.findMany({
          where: { activeFarmerId: farmer.id },
          orderBy: { updatedAt: 'desc' },
          include: {
            farm: {
              select: {
                id: true,
                farmCode: true,
                name: true,
                grade: true,
                socialHectares: true,
                actualAcres: true,
                hasIrrigation: true,
                isVerified: true,
                centerLatitude: true,
                centerLongitude: true,
                boundaryCoordinates: true,
                mamcos: { select: { id: true, name: true } },
              },
            },
            farmingSeason: { select: { id: true, name: true, status: true } },
            lease: {
              select: {
                id: true,
                renterConfirmationStatus: true,
                officerConfirmationStatus: true,
                status: true,
              },
            },
          },
        })
      : [];
    const active = assignments.filter(
      (a) =>
        a.status === VerificationStatus.VERIFIED &&
        a.farmingSeason.status === 'ACTIVE',
    );
    const pending = assignments.filter(
      (a) => a.status !== VerificationStatus.VERIFIED,
    );
    const unreadAlerts = farmer
      ? await this.prisma.notification.count({
          where: { userId, isRead: false },
        })
      : 0;
    return {
      workspace: 'RENTER',
      role: UserRole.FARMER,
      navigation: ['home', 'my-farm', 'activities', 'alerts', 'profile'],
      activeAssignments: active,
      pendingAssignments: pending,
      metrics: {
        activeFarmCount: active.length,
        pendingVerificationCount: pending.length,
        unreadAlerts,
      },
    };
  }

  private async officerContext(userId: string) {
    const officer = await this.prisma.mamcosStaff.findFirst({
      where: { userId, role: MamcosStaffRole.FIELD_OFFICER },
      select: {
        id: true,
        assignedArea: true,
        mamcosId: true,
        mamcos: { select: { id: true, name: true } },
      },
    });
    if (!officer)
      throw new ForbiddenException('Field officer profile is missing');

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [pendingLeases, myFarmersCount, visitsThisWeek] = await Promise.all([
      this.prisma.farmLease.findMany({
        where: {
          renterConfirmationStatus: VerificationStatus.VERIFIED,
          officerConfirmationStatus: VerificationStatus.PENDING,
          status: LeaseStatus.PENDING_VERIFICATION,
        },
        take: 25,
        orderBy: { updatedAt: 'asc' },
        include: {
          farm: {
            select: {
              id: true,
              farmCode: true,
              name: true,
              mamcos: { select: { id: true, name: true } },
            },
          },
          renterFarmer: {
            select: { id: true, firstName: true, lastName: true },
          },
          farmingSeason: { select: { id: true, name: true } },
        },
      }),
      officer.mamcosId
        ? this.prisma.farmer.count({ where: { mamcosId: officer.mamcosId } })
        : 0,
      this.prisma.fieldOfficerVisit.count({
        where: { fieldOfficerId: officer.id, visitedAt: { gte: startOfWeek } },
      }),
    ]);

    return {
      workspace: 'FIELD_OFFICER',
      role: UserRole.FIELD_OFFICER,
      assignedArea: officer.assignedArea,
      mamcos: officer.mamcos,
      navigation: ['home', 'farmers', 'calendar', 'reports', 'profile'],
      workQueue: pendingLeases,
      metrics: {
        pendingVerifications: pendingLeases.length,
        myFarmersCount,
        visitsThisWeek,
      },
    };
  }

  private async mamcosContext(userId: string) {
    const secretary = await this.prisma.mamcosStaff.findFirst({
      where: { userId, role: MamcosStaffRole.SECRETARY },
      select: { mamcosId: true, mamcos: { select: { id: true, name: true } } },
    });
    if (!secretary)
      throw new ForbiddenException('AMCOS officer profile is missing');
    const mamcosId = secretary.mamcosId;
    const [
      unassignedFarms,
      pendingRenterAcceptance,
      pendingFieldVerification,
      disputes,
      unverifiedMappedCandidates,
      pendingLeaseList,
    ] = await Promise.all([
      this.prisma.farmRegistryRecord.count({
        where: {
          sourceMamcosId: mamcosId,
          status: {
            in: [
              FarmRegistryStatus.PRE_REGISTERED,
              FarmRegistryStatus.FIELD_VERIFICATION_PENDING,
            ],
          },
        },
      }),
      this.prisma.farmLease.count({
        where: {
          farm: { mamcosId },
          renterConfirmationStatus: VerificationStatus.PENDING,
          status: LeaseStatus.PENDING_VERIFICATION,
        },
      }),
      this.prisma.farmLease.count({
        where: {
          farm: { mamcosId },
          renterConfirmationStatus: VerificationStatus.VERIFIED,
          officerConfirmationStatus: VerificationStatus.PENDING,
          status: LeaseStatus.PENDING_VERIFICATION,
        },
      }),
      this.prisma.dispute.count({
        where: { farm: { mamcosId }, status: 'OPEN' },
      }),
      this.prisma.farm.findMany({
        where: {
          mamcosId,
          isVerified: false,
        },
        take: 120,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          farmCode: true,
          name: true,
          village: true,
          boundaryCoordinates: true,
          farmer: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.farmLease.findMany({
        where: {
          farm: { mamcosId },
          status: LeaseStatus.PENDING_VERIFICATION,
        },
        take: 10,
        orderBy: { updatedAt: 'asc' },
        include: {
          farm: { select: { id: true, farmCode: true, name: true } },
          farmingSeason: { select: { id: true, name: true } },
          renterFarmer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    const pendingBoundaryList = unverifiedMappedCandidates
      .filter((farm) => isBoundaryMapped(farm.boundaryCoordinates))
      .slice(0, 10)
      .map(({ boundaryCoordinates: _bc, ...farm }) => farm);
    const pendingBoundaryFarms = unverifiedMappedCandidates.filter((farm) =>
      isBoundaryMapped(farm.boundaryCoordinates),
    ).length;

    return {
      workspace: 'AMCOS_OFFICER',
      role: UserRole.MAMCOS_SECRETARY,
      mamcos: secretary.mamcos,
      navigation: [
        'home',
        'registry',
        'farms',
        'renter-assignments',
        'memberships',
        'disputes',
        'reports',
        'profile',
      ],
      workQueue: [
        ...pendingBoundaryList.map((farm) => ({
          id: farm.id,
          kind: 'BOUNDARY_APPROVAL',
          href: `/dashboard/farms/${farm.id}`,
          farm,
          label: `Approve boundary · ${farm.farmCode}`,
        })),
        ...pendingLeaseList.map((lease) => ({
          id: lease.id,
          kind: 'RENTER_ASSIGNMENT',
          href: '/dashboard/leases',
          lease,
          farm: lease.farm,
          label: `Renter assignment · ${lease.farm?.farmCode ?? 'farm'}`,
        })),
      ],
      metrics: {
        unassignedFarms,
        pendingRenterAcceptance,
        pendingFieldVerification,
        pendingBoundaryApprovals: pendingBoundaryFarms,
        openDisputes: disputes,
      },
    };
  }

  private async adminContext() {
    const [farmers, farms, pendingVerifications, disputes] = await Promise.all([
      this.prisma.farmer.count(),
      this.prisma.farm.count(),
      this.prisma.farmLease.count({
        where: { status: LeaseStatus.PENDING_VERIFICATION },
      }),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
    ]);
    return {
      workspace: 'ADMIN',
      role: UserRole.ADMIN,
      navigation: ['dashboard', 'amcos', 'registry', 'seasons', 'reports'],
      metrics: { farmers, farms, pendingVerifications, openDisputes: disputes },
    };
  }
}
