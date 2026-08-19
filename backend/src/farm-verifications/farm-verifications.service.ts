import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { MamcosStaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyFarmDto } from './dto/verify-farm.dto';

@Injectable()
export class FarmVerificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyFarm(officerUserId: string, verifyFarmDto: VerifyFarmDto) {
    const {
      farmId,
      neighborLeft,
      neighborRight,
      mamcosApprovalStatus,
      photoProofUrl,
      notes,
    } = verifyFarmDto;

    // Find the field officer profile
    const fieldOfficer = await this.prisma.mamcosStaff.findFirst({
      where: { userId: officerUserId, role: MamcosStaffRole.FIELD_OFFICER },
    });

    if (!fieldOfficer) {
      throw new NotFoundException(
        `Field Officer profile for user ID ${officerUserId} not found`,
      );
    }

    // Verify farm exists
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
    });

    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    if (farm.isVerified) {
      throw new ConflictException(`Farm with ID ${farmId} is already verified`);
    }

    // Perform transaction to add verification record and update farm status
    return this.prisma.$transaction(async (prisma) => {
      const verification = await prisma.farmVerification.create({
        data: {
          farmId,
          fieldOfficerId: fieldOfficer.id,
          gpsVerified: true,
          verifiedAt: new Date(),
          neighborLeft,
          neighborRight,
          mamcosApproved: mamcosApprovalStatus,
          photoProofUrl,
          notes,
        },
      });

      await prisma.farm.update({
        where: { id: farmId },
        data: { isVerified: true },
      });

      return verification;
    });
  }

  async findAll() {
    return this.prisma.farmVerification.findMany({
      include: {
        farm: {
          select: {
            farmCode: true,
            socialHectares: true,
            grade: true,
            isVerified: true,
          },
        },
        fieldOfficer: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const verification = await this.prisma.farmVerification.findUnique({
      where: { id },
      include: {
        farm: {
          include: {
            farmer: {
              select: { controlNumber: true, firstName: true, lastName: true },
            },
          },
        },
        fieldOfficer: true,
      },
    });

    if (!verification) {
      throw new NotFoundException(
        `Farm Verification record with ID ${id} not found`,
      );
    }

    return verification;
  }

  async findByFarmId(farmId: string) {
    return this.prisma.farmVerification.findMany({
      where: { farmId },
      include: {
        fieldOfficer: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
