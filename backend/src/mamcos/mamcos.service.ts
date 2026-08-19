import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { MamcosStaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMamcosDto,
  UpdateMamcosDto,
  AssignFarmerDto,
  CreateSecretaryDto,
} from './dto/mamcos.dto';

@Injectable()
export class MamcosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createMamcosDto: CreateMamcosDto) {
    const existing = await this.prisma.mamcos.findUnique({
      where: { name: createMamcosDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `MAMCOS scheme with name ${createMamcosDto.name} already exists`,
      );
    }

    return this.prisma.mamcos.create({
      data: createMamcosDto,
    });
  }

  async findAll() {
    const mamcosList = await this.prisma.mamcos.findMany({
      include: {
        staff: {
          where: { role: MamcosStaffRole.SECRETARY },
          select: { firstName: true, lastName: true, stabilityBonus: true },
        },
        _count: {
          select: { farmers: true, farms: true },
        },
      },
    });

    // Preserve the original response shape: `secretary` as a single object
    // (or null), not the array `staff` now carries it in.
    return mamcosList.map(({ staff, ...rest }) => ({
      ...rest,
      secretary: staff[0] ?? null,
    }));
  }

  /** Platform-wide field officer directory, for admin assignment pickers. */
  findAllFieldOfficers() {
    return this.prisma.mamcosStaff.findMany({
      where: { role: MamcosStaffRole.FIELD_OFFICER },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        assignedArea: true,
        mamcos: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const mamcos = await this.prisma.mamcos.findUnique({
      where: { id },
      include: {
        staff: {
          include: {
            user: { select: { phone: true, isActive: true } },
          },
        },
        farmers: {
          select: {
            id: true,
            controlNumber: true,
            firstName: true,
            lastName: true,
            creditScore: true,
          },
        },
        farms: {
          select: {
            id: true,
            farmCode: true,
            socialHectares: true,
            grade: true,
            isVerified: true,
          },
        },
        irrigationSchemes: true,
        aggregationCentres: true,
      },
    });

    if (!mamcos) {
      throw new NotFoundException(`MAMCOS with ID ${id} not found`);
    }

    // Rolled-up production/aggregation figures the docx asks for on the AMCOS
    // detail page. "Total rice aggregated" (actual, to date) is reported as
    // the honest equivalent of a storage balance. "Aggregation capacity" is
    // now a real derived figure (sum of this AMCOS's AggregationCentre rows'
    // capacityKg) since that field was added in this pass — no longer
    // fabricated. Cooperative-level "storage capacity" as a distinct figure
    // still has no backing field anywhere in the schema, so it stays omitted
    // rather than reporting a made-up number.
    const farmerIds = mamcos.farmers.map((f) => f.id);
    const totalRegisteredHectares = mamcos.farms.reduce(
      (sum, f) => sum + (f.socialHectares || 0),
      0,
    );
    const totalAggregationCapacityKg = mamcos.aggregationCentres.reduce(
      (sum, c) => sum + (c.capacityKg || 0),
      0,
    );
    const [yieldAgg, inventoryAgg] = farmerIds.length
      ? await Promise.all([
          this.prisma.cropCycle.aggregate({
            where: { farmerId: { in: farmerIds } },
            _sum: { actualYieldKg: true, estimatedYieldKg: true },
          }),
          this.prisma.inventoryRecord.aggregate({
            where: { farmerId: { in: farmerIds } },
            _sum: { weightKg: true },
          }),
        ])
      : [
          { _sum: { actualYieldKg: 0, estimatedYieldKg: 0 } },
          { _sum: { weightKg: 0 } },
        ];
    const productionSummary = {
      totalRegisteredHectares,
      totalActualYieldKg: yieldAgg._sum.actualYieldKg ?? 0,
      totalEstimatedYieldKg: yieldAgg._sum.estimatedYieldKg ?? 0,
      totalRiceAggregatedKg: inventoryAgg._sum.weightKg ?? 0,
      totalAggregationCapacityKg,
    };

    const { staff, ...rest } = mamcos;
    const secretaryRow = staff.find(
      (s) => s.role === MamcosStaffRole.SECRETARY,
    );
    const secretary = secretaryRow
      ? {
          id: secretaryRow.id,
          userId: secretaryRow.userId,
          mamcosId: secretaryRow.mamcosId,
          firstName: secretaryRow.firstName,
          lastName: secretaryRow.lastName,
          stabilityBonus: secretaryRow.stabilityBonus,
          createdAt: secretaryRow.createdAt,
          updatedAt: secretaryRow.updatedAt,
          user: secretaryRow.user,
        }
      : null;
    const fieldOfficers = staff
      .filter((s) => s.role === MamcosStaffRole.FIELD_OFFICER)
      .map((s) => ({
        id: s.id,
        employeeCode: s.employeeCode,
        firstName: s.firstName,
        lastName: s.lastName,
        assignedArea: s.assignedArea,
        user: s.user,
      }));

    return { ...rest, secretary, fieldOfficers, productionSummary };
  }

  async update(id: string, updateMamcosDto: UpdateMamcosDto) {
    await this.findOne(id); // Verify existence
    return this.prisma.mamcos.update({
      where: { id },
      data: updateMamcosDto,
    });
  }

  async assignFarmer(id: string, assignFarmerDto: AssignFarmerDto) {
    await this.findOne(id); // Verify MAMCOS exists

    const farmer = await this.prisma.farmer.findUnique({
      where: { id: assignFarmerDto.farmerId },
    });

    if (!farmer) {
      throw new NotFoundException(
        `Farmer with ID ${assignFarmerDto.farmerId} not found`,
      );
    }

    return this.prisma.farmer.update({
      where: { id: assignFarmerDto.farmerId },
      data: { mamcosId: id },
      include: {
        mamcos: true,
      },
    });
  }

  async createSecretary(
    mamcosId: string,
    createSecretaryDto: CreateSecretaryDto,
  ) {
    await this.findOne(mamcosId); // Verify MAMCOS exists

    const existingSecretary = await this.prisma.mamcosStaff.findFirst({
      where: { mamcosId, role: MamcosStaffRole.SECRETARY },
    });

    if (existingSecretary) {
      throw new ConflictException(
        `MAMCOS scheme with ID ${mamcosId} already has a designated secretary`,
      );
    }

    return this.prisma.mamcosStaff.create({
      data: {
        mamcosId,
        role: MamcosStaffRole.SECRETARY,
        userId: createSecretaryDto.userId,
        firstName: createSecretaryDto.firstName,
        lastName: createSecretaryDto.lastName,
      },
    });
  }

  async getSecretaryDashboard(secretaryUserId: string) {
    const secretary = await this.prisma.mamcosStaff.findFirst({
      where: { userId: secretaryUserId, role: MamcosStaffRole.SECRETARY },
      include: {
        mamcos: {
          include: {
            staff: {
              where: { role: MamcosStaffRole.FIELD_OFFICER },
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                assignedArea: true,
                user: { select: { phone: true, isActive: true } },
              },
            },
            farmers: {
              select: {
                id: true,
                controlNumber: true,
                firstName: true,
                lastName: true,
                creditScore: true,
                isBlacklisted: true,
              },
            },
            farms: {
              select: {
                id: true,
                farmCode: true,
                socialHectares: true,
                grade: true,
                isVerified: true,
                isLeased: true,
              },
            },
          },
        },
      },
    });

    if (!secretary) {
      throw new NotFoundException(
        `MAMCOS Secretary profile for user ID ${secretaryUserId} not found`,
      );
    }

    // Preserve the original response shape: `mamcos.fieldOfficers`, not
    // `mamcos.staff` (which is now filtered to officers only anyway).
    const { mamcos, ...secretaryRest } = secretary;
    const { staff, ...mamcosRest } = mamcos!;
    return {
      ...secretaryRest,
      mamcos: { ...mamcosRest, fieldOfficers: staff },
    };
  }
}
