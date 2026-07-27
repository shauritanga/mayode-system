import { ForbiddenException, Injectable } from '@nestjs/common';
import { FarmRegistryStatus, LeaseStatus, UserRole, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';

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
        throw new ForbiddenException('This role does not have an operational workspace');
    }
  }

  private async renterContext(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({ where: { userId }, select: { id: true } });
    const assignments = farmer
      ? await this.prisma.seasonalFarmAssignment.findMany({
          where: { activeFarmerId: farmer.id },
          orderBy: { updatedAt: 'desc' },
          include: { farm: { select: { id: true, farmCode: true, name: true, mamcos: { select: { id: true, name: true } } } }, farmingSeason: { select: { id: true, name: true, status: true } }, lease: { select: { id: true, renterConfirmationStatus: true, officerConfirmationStatus: true, status: true } } },
        })
      : [];
    const active = assignments.filter((a) => a.status === VerificationStatus.VERIFIED && a.farmingSeason.status === 'ACTIVE');
    const pending = assignments.filter((a) => a.status !== VerificationStatus.VERIFIED);
    const unreadAlerts = farmer ? await this.prisma.notification.count({ where: { userId, isRead: false } }) : 0;
    return {
      workspace: 'RENTER', role: UserRole.FARMER,
      navigation: ['home', 'my-farm', 'activities', 'alerts', 'profile'],
      activeAssignments: active,
      pendingAssignments: pending,
      metrics: { activeFarmCount: active.length, pendingVerificationCount: pending.length, unreadAlerts },
    };
  }

  private async officerContext(userId: string) {
    const officer = await this.prisma.fieldOfficer.findUnique({ where: { userId }, select: { id: true, assignedArea: true } });
    if (!officer) throw new ForbiddenException('Field officer profile is missing');
    const pendingLeases = await this.prisma.farmLease.findMany({
      where: { renterConfirmationStatus: VerificationStatus.VERIFIED, officerConfirmationStatus: VerificationStatus.PENDING, status: LeaseStatus.PENDING_VERIFICATION },
      take: 25, orderBy: { updatedAt: 'asc' },
      include: { farm: { select: { id: true, farmCode: true, name: true, mamcos: { select: { id: true, name: true } } } }, renterFarmer: { select: { id: true, firstName: true, lastName: true } }, farmingSeason: { select: { id: true, name: true } } },
    });
    return {
      workspace: 'FIELD_OFFICER', role: UserRole.FIELD_OFFICER, assignedArea: officer.assignedArea,
      navigation: ['home', 'work-queue', 'field-surveys', 'farms', 'profile'],
      workQueue: pendingLeases,
      metrics: { pendingVerifications: pendingLeases.length },
    };
  }

  private async mamcosContext(userId: string) {
    const secretary = await this.prisma.mamcosSecretary.findUnique({ where: { userId }, select: { mamcosId: true, mamcos: { select: { id: true, name: true } } } });
    if (!secretary) throw new ForbiddenException('AMCOS officer profile is missing');
    const mamcosId = secretary.mamcosId;
    const [unassignedFarms, pendingRenterAcceptance, pendingFieldVerification, disputes] = await Promise.all([
      this.prisma.farmRegistryRecord.count({ where: { sourceMamcosId: mamcosId, status: { in: [FarmRegistryStatus.PRE_REGISTERED, FarmRegistryStatus.FIELD_VERIFICATION_PENDING] } } }),
      this.prisma.farmLease.count({ where: { farm: { mamcosId }, renterConfirmationStatus: VerificationStatus.PENDING, status: LeaseStatus.PENDING_VERIFICATION } }),
      this.prisma.farmLease.count({ where: { farm: { mamcosId }, renterConfirmationStatus: VerificationStatus.VERIFIED, officerConfirmationStatus: VerificationStatus.PENDING, status: LeaseStatus.PENDING_VERIFICATION } }),
      this.prisma.dispute.count({ where: { farm: { mamcosId }, status: 'OPEN' } }),
    ]);
    return {
      workspace: 'AMCOS_OFFICER', role: UserRole.MAMCOS_SECRETARY, mamcos: secretary.mamcos,
      navigation: ['home', 'registry', 'renter-assignments', 'disputes', 'profile'],
      metrics: { unassignedFarms, pendingRenterAcceptance, pendingFieldVerification, openDisputes: disputes },
    };
  }

  private async adminContext() {
    const [farmers, farms, pendingVerifications, disputes] = await Promise.all([
      this.prisma.farmer.count(), this.prisma.farm.count(),
      this.prisma.farmLease.count({ where: { status: LeaseStatus.PENDING_VERIFICATION } }),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
    ]);
    return { workspace: 'ADMIN', role: UserRole.ADMIN, navigation: ['dashboard', 'amcos', 'registry', 'seasons', 'reports'], metrics: { farmers, farms, pendingVerifications, openDisputes: disputes } };
  }
}
