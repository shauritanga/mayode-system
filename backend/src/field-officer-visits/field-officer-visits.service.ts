import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CropCycleStatus, MamcosStaffRole, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import type { RequestUser } from '../common/ownership.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { CalendarQueryDto, QueryVisitsDto } from './dto/query-visits.dto';

const STAFF_CAN_VIEW_ANY_FARMER: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
];

@Injectable()
export class FieldOfficerVisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
  ) {}

  /** Resolve the calling officer's MamcosStaff row and require they're scoped to an AMCOS. */
  private async requireOfficerWithMamcos(userId: string) {
    const officer = await this.prisma.mamcosStaff.findFirst({
      where: { userId, role: MamcosStaffRole.FIELD_OFFICER },
      select: { id: true, mamcosId: true },
    });
    if (!officer) {
      throw new NotFoundException('Field Officer profile not found');
    }
    if (!officer.mamcosId) {
      throw new ForbiddenException(
        'Your account is not yet assigned to an AMCOS — contact an administrator',
      );
    }
    return officer as { id: string; mamcosId: string };
  }

  async create(userId: string, dto: CreateVisitDto) {
    const officer = await this.requireOfficerWithMamcos(userId);

    const farmer = await this.prisma.farmer.findUnique({
      where: { id: dto.farmerId },
      select: { id: true, mamcosId: true },
    });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${dto.farmerId} not found`);
    }
    if (farmer.mamcosId !== officer.mamcosId) {
      throw new ForbiddenException('This farmer is not in your AMCOS');
    }

    const farm = await this.prisma.farm.findUnique({
      where: { id: dto.farmId },
      select: { id: true, farmerId: true, mamcosId: true },
    });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${dto.farmId} not found`);
    }
    if (farm.mamcosId !== officer.mamcosId) {
      throw new ForbiddenException('This farm is not in your AMCOS');
    }
    if (farm.farmerId !== dto.farmerId) {
      throw new BadRequestException('This farm does not belong to the selected farmer');
    }

    let cropCycleId = dto.cropCycleId;
    if (cropCycleId) {
      const cycle = await this.prisma.cropCycle.findFirst({
        where: { id: cropCycleId, farmId: dto.farmId },
        select: { id: true },
      });
      if (!cycle) {
        throw new BadRequestException('Crop cycle not found for this farm');
      }
    } else {
      const active = await this.prisma.cropCycle.findFirst({
        where: {
          farmId: dto.farmId,
          status: { in: [CropCycleStatus.ACTIVE, CropCycleStatus.PLANNED] },
        },
        orderBy: { plantingDate: 'desc' },
        select: { id: true, riceVariety: true },
      });
      if (active) cropCycleId = active.id;
    }

    const visitedAt = dto.visitedAt ? new Date(dto.visitedAt) : new Date();
    const observations = dto.observations?.trim() || dto.notes?.trim() || undefined;
    const nextVisitDate = dto.nextVisitDate ? new Date(dto.nextVisitDate) : undefined;

    const visit = await this.prisma.fieldOfficerVisit.create({
      data: {
        fieldOfficerId: officer.id,
        farmerId: dto.farmerId,
        farmId: dto.farmId,
        cropCycleId,
        purpose: dto.purpose ?? 'ROUTINE_CHECK',
        notes: observations,
        growthStage: dto.growthStage,
        riceVariety: dto.riceVariety?.trim() || undefined,
        cropCondition: dto.cropCondition,
        waterStatus: dto.waterStatus,
        weedStatus: dto.weedStatus,
        pestStatus: dto.pestStatus,
        diseaseStatus: dto.diseaseStatus,
        fertilizerApplied: dto.fertilizerApplied,
        inputUsed: dto.inputUsed?.trim() || undefined,
        inputQuantity: dto.inputQuantity?.trim() || undefined,
        observations,
        recommendations: dto.recommendations?.trim() || undefined,
        nextVisitDate,
        photoUrls: dto.photoUrls ?? [],
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
        visitedAt,
      },
      include: {
        farmer: {
          select: { id: true, firstName: true, lastName: true, controlNumber: true },
        },
        farm: { select: { id: true, farmCode: true, name: true } },
      },
    });

    await this.activities.log(
      dto.farmerId,
      'officer.visit',
      'Field officer visited you',
      visit.recommendations ?? visit.observations ?? undefined,
      'user-check',
    );

    return visit;
  }

  /** Platform-wide visit list for admin reporting (field officer activity ranking). */
  findAll() {
    return this.prisma.fieldOfficerVisit.findMany({
      orderBy: { visitedAt: 'desc' },
      include: {
        fieldOfficer: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
      },
    });
  }

  async findMine(userId: string, query: QueryVisitsDto) {
    const officer = await this.requireOfficerWithMamcos(userId);
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;

    const where = {
      fieldOfficerId: officer.id,
      ...(query.farmerId ? { farmerId: query.farmerId } : {}),
      ...(query.from || query.to
        ? {
            visitedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.fieldOfficerVisit.count({ where }),
      this.prisma.fieldOfficerVisit.findMany({
        where,
        orderBy: { visitedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          farmer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              controlNumber: true,
            },
          },
          farm: { select: { id: true, farmCode: true, name: true } },
        },
      }),
    ]);

    return { total, page, pageSize, data };
  }

  async findForFarmer(farmerId: string, user: RequestUser) {
    if (
      user.role === UserRole.FIELD_OFFICER ||
      user.role === UserRole.MAMCOS_SECRETARY
    ) {
      // userId is unique across the whole staff table, so one query covers
      // either role — the caller's auth role (checked above) already
      // determines which one we expect to find.
      const [scope, farmer] = await Promise.all([
        this.prisma.mamcosStaff.findUnique({
          where: { userId: user.id },
          select: { mamcosId: true },
        }),
        this.prisma.farmer.findUnique({
          where: { id: farmerId },
          select: { mamcosId: true },
        }),
      ]);
      if (!farmer)
        throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
      if (!scope?.mamcosId || farmer.mamcosId !== scope.mamcosId) {
        throw new ForbiddenException('This farmer is not in your AMCOS');
      }
    } else if (!STAFF_CAN_VIEW_ANY_FARMER.includes(user.role)) {
      throw new ForbiddenException('Not permitted to view visit history');
    }

    return this.prisma.fieldOfficerVisit.findMany({
      where: { farmerId },
      orderBy: { visitedAt: 'desc' },
      include: {
        fieldOfficer: {
          select: { firstName: true, lastName: true, employeeCode: true },
        },
        farm: { select: { id: true, farmCode: true, name: true } },
      },
    });
  }

  async calendar(userId: string, query: CalendarQueryDto) {
    const officer = await this.requireOfficerWithMamcos(userId);

    const now = new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = query.to
      ? new Date(query.to)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [visits, followUps, cropCycles] = await Promise.all([
      this.prisma.fieldOfficerVisit.findMany({
        where: {
          fieldOfficerId: officer.id,
          visitedAt: { gte: from, lte: to },
        },
        include: {
          farmer: { select: { id: true, firstName: true, lastName: true } },
          farm: { select: { id: true, farmCode: true, name: true } },
        },
      }),
      this.prisma.fieldOfficerVisit.findMany({
        where: {
          fieldOfficerId: officer.id,
          nextVisitDate: { gte: from, lte: to },
        },
        include: {
          farmer: { select: { id: true, firstName: true, lastName: true } },
          farm: { select: { id: true, farmCode: true, name: true } },
        },
      }),
      this.prisma.cropCycle.findMany({
        where: {
          farmer: { mamcosId: officer.mamcosId },
          OR: [
            { plantingDate: { gte: from, lte: to } },
            { expectedHarvest: { gte: from, lte: to } },
          ],
        },
        include: {
          farmer: { select: { id: true, firstName: true, lastName: true } },
          farm: { select: { id: true, farmCode: true, name: true } },
        },
      }),
    ]);

    const entries = [
      ...visits.map((v) => ({
        type: 'VISIT' as const,
        date: v.visitedAt,
        id: v.id,
        purpose: v.purpose,
        growthStage: v.growthStage,
        farmer: v.farmer,
        farm: v.farm,
      })),
      ...followUps.map((v) => ({
        type: 'FOLLOW_UP' as const,
        date: v.nextVisitDate as Date,
        id: `${v.id}-followup`,
        visitId: v.id,
        growthStage: v.growthStage,
        farmer: v.farmer,
        farm: v.farm,
      })),
      ...cropCycles
        .filter(
          (c) =>
            c.plantingDate && c.plantingDate >= from && c.plantingDate <= to,
        )
        .map((c) => ({
          type: 'PLANTING' as const,
          date: c.plantingDate as Date,
          id: c.id,
          farmer: c.farmer,
          farm: c.farm,
        })),
      ...cropCycles
        .filter(
          (c) =>
            c.expectedHarvest &&
            c.expectedHarvest >= from &&
            c.expectedHarvest <= to,
        )
        .map((c) => ({
          type: 'HARVEST' as const,
          date: c.expectedHarvest as Date,
          id: c.id,
          farmer: c.farmer,
          farm: c.farm,
        })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return entries;
  }
}
