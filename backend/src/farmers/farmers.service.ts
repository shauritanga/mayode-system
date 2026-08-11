import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  DocumentType,
  MamcosStaffRole,
  Prisma,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../uploads/documents.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';
import { QueryFarmersDto } from './dto/query-farmers.dto';
import {
  AssignOfficerDto,
  VerifyFarmerDto,
  RejectFarmerDto,
  SuspendFarmerDto,
  UpsertHouseholdDto,
  LinkDocumentDto,
  SubmitIdentityDto,
} from './dto/farmer-actions.dto';
import {
  CaptureConsentDto,
  CreateQuestionnaireDto,
} from './dto/trust-layer.dto';

@Injectable()
export class FarmersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentsService,
    private readonly ownership: OwnershipService,
    private readonly memberships: MembershipsService,
  ) {}

  // --------------------------------------------------------------------------
  // Creation
  // --------------------------------------------------------------------------

  private async generateControlNumber(): Promise<string> {
    const prefix = this.config.get<string>('CONTROL_NUMBER_PREFIX') || 'MYD';
    const last = await this.prisma.farmer.findFirst({
      where: { controlNumber: { startsWith: prefix } },
      orderBy: { controlNumber: 'desc' },
    });
    if (!last) return `${prefix}-00001`;
    const n = parseInt(last.controlNumber.replace(`${prefix}-`, ''), 10) + 1;
    return `${prefix}-${n.toString().padStart(5, '0')}`;
  }

  /** Provision a login User + Farmer profile (admin / field-officer flow). */
  async create(dto: CreateFarmerDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ phone: dto.phone }, { email: dto.email || undefined }] },
    });
    if (existing) {
      throw new ConflictException(
        'A user with this phone number or email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const controlNumber = await this.generateControlNumber();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: UserRole.FARMER,
        },
      });

      return tx.farmer.create({
        data: {
          userId: user.id,
          controlNumber,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          gender: dto.gender,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          nationalId: dto.nationalId,
          mamcosId: dto.mamcosId,
          village: dto.village,
          ward: dto.ward,
          district: dto.district,
          region: dto.region,
          residenceLatitude: dto.residenceLatitude,
          residenceLongitude: dto.residenceLongitude,
          educationLevel: dto.educationLevel,
          farmingExperienceYears: dto.farmingExperienceYears,
          familySize: dto.familySize,
          dependents: dto.dependents,
          dataShareConsent: dto.dataShareConsent ?? false,
          consentedAt: dto.dataShareConsent ? new Date() : null,
        },
        include: { user: { select: { phone: true, email: true } } },
      });
    });
  }

  // --------------------------------------------------------------------------
  // Reads
  // --------------------------------------------------------------------------

  async findAll(query: QueryFarmersDto) {
    const {
      search,
      region,
      district,
      ward,
      village,
      mamcosId,
      verificationStatus,
    } = query;
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;

    const where: Prisma.FarmerWhereInput = {
      ...(region ? { region } : {}),
      ...(district ? { district } : {}),
      ...(ward ? { ward } : {}),
      ...(village ? { village } : {}),
      ...(mamcosId ? { mamcosId } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { controlNumber: { contains: search, mode: 'insensitive' } },
              { user: { phone: { contains: search } } },
            ],
          }
        : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.farmer.count({ where }),
      this.prisma.farmer.findMany({
        where,
        include: {
          user: { select: { phone: true, email: true, isActive: true } },
          mamcos: { select: { name: true } },
          _count: { select: { farms: true, cropCycles: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Unpaginated, minimal-field farmer list for admin dashboard aggregation
   * (gender/age/district/officer-attribution charts). `findAll()` above is
   * paginated (max 100/page) for the searchable UI table — dashboards that
   * need every farmer must use this instead, not loop pages against `findAll`.
   */
  findAllUnpaginated() {
    return this.prisma.farmer.findMany({
      select: {
        id: true,
        gender: true,
        dateOfBirth: true,
        district: true,
        region: true,
        verificationStatus: true,
        verifiedById: true,
        assignedOfficerId: true,
        mamcosId: true,
      },
    });
  }

  async findOne(id: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id },
      include: {
        user: {
          select: { phone: true, email: true, isActive: true, language: true },
        },
        mamcos: true,
        household: true,
        documents: { orderBy: { createdAt: 'desc' } },
        verifications: {
          include: {
            fieldOfficer: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
          orderBy: { verifiedAt: 'desc' },
        },
        farms: {
          include: { _count: { select: { plots: true, cropCycles: true } } },
        },
        loanRecords: true,
      },
    });
    if (!farmer) throw new NotFoundException(`Farmer with ID ${id} not found`);
    return farmer;
  }

  async findMe(userId: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!farmer) {
      throw new NotFoundException('No farmer profile is linked to this user');
    }
    return this.findOne(farmer.id);
  }

  async findByControlNumber(controlNumber: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { controlNumber },
      include: {
        user: { select: { phone: true, email: true, isActive: true } },
        mamcos: true,
        farms: true,
      },
    });
    if (!farmer) {
      throw new NotFoundException(
        `Farmer with Control Number ${controlNumber} not found`,
      );
    }
    return farmer;
  }

  // --------------------------------------------------------------------------
  // Update
  // --------------------------------------------------------------------------

  async update(id: string, dto: UpdateFarmerDto, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, id);
    await this.findOne(id);
    const { dateOfBirth, dataShareConsent, ...rest } = dto;
    return this.prisma.farmer.update({
      where: { id },
      data: {
        ...rest,
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        ...(dataShareConsent !== undefined
          ? {
              dataShareConsent,
              consentedAt: dataShareConsent ? new Date() : null,
            }
          : {}),
      },
      include: { user: { select: { phone: true, email: true } } },
    });
  }

  // --------------------------------------------------------------------------
  // Verification workflow
  // --------------------------------------------------------------------------

  private async fieldOfficerFor(userId: string) {
    const officer = await this.prisma.mamcosStaff.findFirst({
      where: { userId, role: MamcosStaffRole.FIELD_OFFICER },
    });
    if (!officer) {
      throw new NotFoundException(
        `Field Officer profile for user ID ${userId} not found`,
      );
    }
    return officer;
  }

  /** Staff assigns a field officer as responsible for a farmer's follow-up (pending-tasks tracking). */
  async assignOfficer(farmerId: string, dto: AssignOfficerDto) {
    await this.findOne(farmerId);
    const officer = await this.prisma.mamcosStaff.findUnique({
      where: { id: dto.officerId },
      select: { id: true, role: true },
    });
    if (!officer) {
      throw new NotFoundException(`Field officer with ID ${dto.officerId} not found`);
    }
    if (officer.role !== MamcosStaffRole.FIELD_OFFICER) {
      throw new ConflictException('Assignee must be a field officer');
    }
    return this.prisma.farmer.update({
      where: { id: farmerId },
      data: { assignedOfficerId: dto.officerId },
    });
  }

  async verifyFarmer(
    officerUserId: string,
    farmerId: string,
    dto: VerifyFarmerDto,
  ) {
    const officer = await this.fieldOfficerFor(officerUserId);
    const farmer = await this.findOne(farmerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.farmerVerification.create({
        data: {
          farmerId,
          fieldOfficerId: officer.id,
          status: VerificationStatus.VERIFIED,
          gpsVerified: dto.gpsVerified ?? false,
          documentsReviewed: dto.documentsReviewed ?? false,
          gpsLatitude: dto.gpsLatitude,
          gpsLongitude: dto.gpsLongitude,
          notes: dto.notes,
        },
      });
      await tx.farmer.update({
        where: { id: farmerId },
        data: {
          verificationStatus: VerificationStatus.VERIFIED,
          verifiedById: officer.id,
          verifiedAt: new Date(),
        },
      });
      return verification;
    });

    await this.notifications.create({
      userId: farmer.userId,
      type: 'farmer.verified',
      title: 'Profile verified',
      body: 'Your farmer profile has been verified. You now have full access.',
      data: { farmerId },
    });

    return result;
  }

  async rejectFarmer(
    officerUserId: string,
    farmerId: string,
    dto: RejectFarmerDto,
  ) {
    const officer = await this.fieldOfficerFor(officerUserId);
    const farmer = await this.findOne(farmerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.farmerVerification.create({
        data: {
          farmerId,
          fieldOfficerId: officer.id,
          status: VerificationStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
          notes: dto.notes,
        },
      });
      await tx.farmer.update({
        where: { id: farmerId },
        data: { verificationStatus: VerificationStatus.REJECTED },
      });
      return verification;
    });

    await this.notifications.create({
      userId: farmer.userId,
      type: 'farmer.rejected',
      title: 'Profile needs attention',
      body: `Your registration was rejected: ${dto.rejectionReason}`,
      data: { farmerId },
    });

    return result;
  }

  async suspendFarmer(
    officerUserId: string,
    farmerId: string,
    dto: SuspendFarmerDto,
  ) {
    const officer = await this.fieldOfficerFor(officerUserId);
    const farmer = await this.findOne(farmerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.farmerVerification.create({
        data: {
          farmerId,
          fieldOfficerId: officer.id,
          status: VerificationStatus.SUSPENDED,
          rejectionReason: dto.reason,
        },
      });
      await tx.farmer.update({
        where: { id: farmerId },
        data: { verificationStatus: VerificationStatus.SUSPENDED },
      });
      return verification;
    });

    await this.notifications.create({
      userId: farmer.userId,
      type: 'farmer.suspended',
      title: 'Profile suspended',
      body: `Your profile has been suspended: ${dto.reason}`,
      data: { farmerId },
    });

    return result;
  }

  // --------------------------------------------------------------------------
  // Household & documents
  // --------------------------------------------------------------------------

  async upsertHousehold(
    farmerId: string,
    dto: UpsertHouseholdDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    await this.findOne(farmerId);
    return this.prisma.household.upsert({
      where: { farmerId },
      create: { farmerId, ...dto },
      update: { ...dto },
    });
  }

  async addDocument(farmerId: string, dto: LinkDocumentDto, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.documents.createForFarmer(farmerId, {
      ...dto,
      uploadedById: user.id,
    });
  }

  /**
   * Final-stage identity verification (owner comment §2.1): the farmer submits
   * an ID document, its number, and a recent photo / guided face-capture. We
   * store the evidence, set the national ID and photo, move the profile to
   * PENDING, and queue an officer to review (officer verify/reject is the final
   * approval until automated facial matching is added).
   */
  async submitIdentity(
    farmerId: string,
    dto: SubmitIdentityDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.findOne(farmerId);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.document.createMany({
        data: [
          {
            farmerId,
            type: dto.idType,
            fileUrl: dto.idDocumentUrl,
            fileName: `${dto.idType}-${dto.idNumber}`,
            uploadedById: user.id,
          },
          {
            farmerId,
            type: DocumentType.FACE_CAPTURE,
            fileUrl: dto.faceCaptureUrl,
            fileName: 'face-capture',
            uploadedById: user.id,
          },
          ...(dto.profilePhotoUrl
            ? [
                {
                  farmerId,
                  type: DocumentType.PROFILE_PHOTO,
                  fileUrl: dto.profilePhotoUrl,
                  fileName: 'profile-photo',
                  uploadedById: user.id,
                },
              ]
            : []),
        ],
      });

      return tx.farmer.update({
        where: { id: farmerId },
        data: {
          nationalId: dto.idNumber,
          photoUrl: dto.profilePhotoUrl ?? dto.faceCaptureUrl,
          // Re-submitting resets a prior rejection back to review.
          verificationStatus: VerificationStatus.PENDING,
        },
        select: { id: true, verificationStatus: true, nationalId: true },
      });
    });

    // Queue officers/admins to review the submission.
    await this.notifications.createForRoles(
      [UserRole.FIELD_OFFICER, UserRole.ADMIN, UserRole.SUPER_ADMIN],
      {
        type: 'identity.submitted',
        title: 'Identity verification submitted',
        body: `${farmer.firstName} ${farmer.lastName} (${farmer.controlNumber}) submitted identity documents for review.`,
        data: { farmerId },
      },
    );

    return updated;
  }

  async listDocuments(farmerId: string) {
    await this.findOne(farmerId);
    return this.documents.listForFarmer(farmerId);
  }

  async removeDocument(documentId: string) {
    return this.documents.remove(documentId);
  }

  // --------------------------------------------------------------------------
  // Analytics: production, financial, credit-readiness
  // --------------------------------------------------------------------------

  async getProductionSummary(farmerId: string, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        cropCycles: {
          include: { farm: { select: { farmCode: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);

    const cycles = farmer.cropCycles;
    const harvested = cycles.filter((c) => (c.actualYieldKg ?? 0) > 0);
    const totalActualYieldKg = harvested.reduce(
      (s, c) => s + (c.actualYieldKg ?? 0),
      0,
    );
    const totalEstimatedYieldKg = cycles.reduce(
      (s, c) => s + (c.estimatedYieldKg ?? 0),
      0,
    );
    const avgYieldKg = harvested.length
      ? totalActualYieldKg / harvested.length
      : 0;

    return {
      farmerId,
      controlNumber: farmer.controlNumber,
      totalCropCycles: cycles.length,
      harvestedCycles: harvested.length,
      totalActualYieldKg,
      totalEstimatedYieldKg,
      avgYieldKgPerCycle: Math.round(avgYieldKg),
      yieldAccuracy:
        totalEstimatedYieldKg > 0
          ? Number((totalActualYieldKg / totalEstimatedYieldKg).toFixed(2))
          : null,
      cycles: cycles.map((c) => ({
        id: c.id,
        season: c.season,
        riceVariety: c.riceVariety,
        farmCode: c.farm?.farmCode,
        status: c.status,
        estimatedYieldKg: c.estimatedYieldKg,
        actualYieldKg: c.actualYieldKg,
        harvestDate: c.harvestDate,
      })),
    };
  }

  async getFinancialSummary(farmerId: string, user: RequestUser) {
    // Premium gate: financial analytics require an active membership (staff bypass).
    if (!(await this.memberships.hasPremiumAccess(user))) {
      return {
        locked: true,
        code: 'MEMBERSHIP_REQUIRED',
        farmerId,
        message:
          'Activate your MAYOData membership to view the full financial analysis.',
      };
    }
    return this.finance.getFarmerFinancialSummary(farmerId, user);
  }

  async captureConsent(
    farmerId: string,
    dto: CaptureConsentDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);

    const granted = dto.granted ?? true;
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
    const consent = await this.prisma.consentRecord.create({
      data: {
        farmerId,
        scope: dto.scope,
        granted,
        formVersion: dto.formVersion ?? 'MAYODATA_CONSENT_2026_07',
        language: dto.language ?? 'sw',
        explanationReadByUserId: user.id,
        signatureUrl: dto.signatureUrl,
        thumbprintUrl: dto.thumbprintUrl,
        witnessName: dto.witnessName,
        notes: dto.notes,
        capturedAt,
        revokedAt: granted ? undefined : capturedAt,
      },
    });

    const financialScopes = new Set([
      'FINANCIAL_PROVIDERS',
      'FINANCIAL_PROVIDER',
      'FINANCIAL_DATA_SHARING',
      'CREDIT_PROFILE',
    ]);
    if (financialScopes.has(dto.scope)) {
      await this.prisma.farmer.update({
        where: { id: farmerId },
        data: {
          dataShareConsent: granted,
          consentedAt: granted ? capturedAt : null,
        },
      });
    }

    return consent;
  }

  async listConsents(farmerId: string, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.prisma.consentRecord.findMany({
      where: { farmerId },
      orderBy: { capturedAt: 'desc' },
    });
  }

  async createQuestionnaire(
    farmerId: string,
    dto: CreateQuestionnaireDto,
    user: RequestUser,
  ) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      select: { id: true },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    if (dto.farmId) {
      const farm = await this.prisma.farm.findUnique({
        where: { id: dto.farmId },
        select: { id: true },
      });
      if (!farm)
        throw new NotFoundException(`Farm with ID ${dto.farmId} not found`);
    }

    return this.prisma.farmerQuestionnaire.create({
      data: {
        farmerId,
        farmId: dto.farmId,
        fieldOfficerUserId: user.id,
        formVersion: dto.formVersion ?? 'MAYODATA_FIELD_QUESTIONNAIRE_2026_07',
        language: dto.language ?? 'sw',
        officialUse: (dto.officialUse ?? {}) as Prisma.InputJsonValue,
        farmerSnapshot: (dto.farmerSnapshot ?? {}) as Prisma.InputJsonValue,
        farmRegistration: (dto.farmRegistration ?? {}) as Prisma.InputJsonValue,
        plantingInputs: (dto.plantingInputs ?? {}) as Prisma.InputJsonValue,
        midSeasonCosts: (dto.midSeasonCosts ?? {}) as Prisma.InputJsonValue,
        harvestSales: (dto.harvestSales ?? {}) as Prisma.InputJsonValue,
        consentAcknowledged: dto.consentAcknowledged ?? false,
        signatureUrl: dto.signatureUrl,
        photoUrls: dto.photoUrls ?? [],
        gpsLatitude: dto.gpsLatitude,
        gpsLongitude: dto.gpsLongitude,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : new Date(),
      },
      include: { farm: { select: { id: true, farmCode: true, name: true } } },
    });
  }

  async listQuestionnaires(farmerId: string, user: RequestUser) {
    await this.ownership.assertFarmerAccess(user, farmerId);
    return this.prisma.farmerQuestionnaire.findMany({
      where: { farmerId },
      include: { farm: { select: { id: true, farmCode: true, name: true } } },
      orderBy: { capturedAt: 'desc' },
    });
  }

  async getFormalFinancialProfile(farmerId: string, user: RequestUser) {
    if (user.role !== UserRole.FINANCIAL_PROVIDER) {
      await this.ownership.assertFarmerAccess(user, farmerId);
    }
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        user: { select: { phone: true, email: true } },
        mamcos: { select: { id: true, name: true } },
        consentRecords: {
          orderBy: { capturedAt: 'desc' },
          take: 10,
        },
        farms: {
          select: {
            id: true,
            farmCode: true,
            name: true,
            socialHectares: true,
            actualAcres: true,
            isVerified: true,
          },
        },
        cropCycles: {
          include: {
            costs: true,
            revenues: true,
            farm: { select: { farmCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        loanRecords: { include: { deductions: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 20 },
        memberships: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    if (user.role === UserRole.FINANCIAL_PROVIDER && !farmer.dataShareConsent) {
      throw new ForbiddenException(
        'This farmer has not consented to financial-provider data sharing',
      );
    }

    const totalCosts = farmer.cropCycles.reduce(
      (sum, cycle) => sum + cycle.costs.reduce((s, c) => s + c.totalCost, 0),
      0,
    );
    const totalRevenue = farmer.cropCycles.reduce(
      (sum, cycle) =>
        sum +
        cycle.revenues.reduce(
          (s, r) => s + r.totalRevenue + (r.fairtradePremium ?? 0),
          0,
        ),
      0,
    );
    const harvestedCycles = farmer.cropCycles.filter(
      (cycle) => (cycle.actualYieldKg ?? 0) > 0,
    );
    const totalLoanOriginal = farmer.loanRecords.reduce(
      (sum, loan) => sum + loan.originalAmount,
      0,
    );
    const totalLoanOutstanding = farmer.loanRecords.reduce(
      (sum, loan) => sum + loan.amountOwed,
      0,
    );
    const activeLoanCount = farmer.loanRecords.filter((loan) => loan.isActive)
      .length;

    const readiness = await this.getCreditReadiness(farmerId, user);
    const latestFinancialConsent = farmer.consentRecords.find((record) =>
      [
        'FINANCIAL_PROVIDERS',
        'FINANCIAL_PROVIDER',
        'FINANCIAL_DATA_SHARING',
        'CREDIT_PROFILE',
      ].includes(record.scope),
    );

    return {
      farmer: {
        id: farmer.id,
        controlNumber: farmer.controlNumber,
        name: `${farmer.firstName} ${farmer.lastName}`,
        phone: farmer.user.phone,
        email: farmer.user.email,
        village: farmer.village,
        ward: farmer.ward,
        district: farmer.district,
        region: farmer.region,
        cooperative: farmer.mamcos,
        verificationStatus: farmer.verificationStatus,
        farmingExperienceYears: farmer.farmingExperienceYears,
      },
      consent: {
        financialProviderSharing: farmer.dataShareConsent,
        consentedAt: farmer.consentedAt,
        latestRecord: latestFinancialConsent ?? null,
      },
      credit: readiness,
      production: {
        totalCropCycles: farmer.cropCycles.length,
        harvestedCycles: harvestedCycles.length,
        totalYieldKg: harvestedCycles.reduce(
          (sum, cycle) => sum + (cycle.actualYieldKg ?? 0),
          0,
        ),
        cycles: farmer.cropCycles.map((cycle) => ({
          id: cycle.id,
          season: cycle.season,
          farmCode: cycle.farm.farmCode,
          status: cycle.status,
          riceVariety: cycle.riceVariety,
          actualYieldKg: cycle.actualYieldKg,
          estimatedYieldKg: cycle.estimatedYieldKg,
          harvestDate: cycle.harvestDate,
        })),
      },
      finance: {
        totalCosts,
        totalRevenue,
        netProfit: totalRevenue - totalCosts,
        activeLoanCount,
        totalLoanOriginal,
        totalLoanOutstanding,
        repaymentRatio: totalLoanOriginal
          ? Number(
              (
                (totalLoanOriginal - totalLoanOutstanding) /
                totalLoanOriginal
              ).toFixed(2),
            )
          : null,
      },
      farms: farmer.farms,
      recentPayments: farmer.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        netAmount: payment.netAmount,
        loanDeduction: payment.loanDeduction,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        description: payment.description,
      })),
      conditions: {
        canShareWithFinancialProvider:
          farmer.dataShareConsent && !farmer.isBlacklisted,
        hasVerifiedIdentity:
          farmer.verificationStatus === VerificationStatus.VERIFIED,
        hasProductionHistory: harvestedCycles.length > 0,
        hasPositiveNetFarmIncome: totalRevenue - totalCosts > 0,
        isBlacklisted: farmer.isBlacklisted,
      },
    };
  }

  /**
   * Compute a real credit-readiness score (0-100) from verification, production,
   * profitability, loan repayment, cooperative membership, experience, farm size and
   * insurance status. The resulting score is persisted onto Farmer.creditScore.
   */
  async getCreditReadiness(farmerId: string, user: RequestUser) {
    if (user.role !== UserRole.FINANCIAL_PROVIDER) {
      await this.ownership.assertFarmerAccess(user, farmerId);
    }
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: {
        cropCycles: { include: { costs: true, revenues: true } },
        loanRecords: true,
        farms: { select: { socialHectares: true } },
        insurancePolicies: { select: { status: true } },
      },
    });
    if (!farmer)
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    if (user.role === UserRole.FINANCIAL_PROVIDER && !farmer.dataShareConsent) {
      throw new ForbiddenException(
        'This farmer has not consented to sharing credit-readiness data',
      );
    }

    // 1. Verification (max 20)
    const verificationScore =
      farmer.verificationStatus === VerificationStatus.VERIFIED ? 20 : 0;

    // 2. Production history (max 15) — reward harvested cycles
    const harvestedCycles = farmer.cropCycles.filter(
      (c) => (c.actualYieldKg ?? 0) > 0,
    ).length;
    const productionScore = Math.min(15, harvestedCycles * 5);

    // 3. Profitability (max 20)
    let overallCosts = 0;
    let overallRevenues = 0;
    let overallPremium = 0;
    for (const cycle of farmer.cropCycles) {
      overallCosts += cycle.costs.reduce((s, c) => s + c.totalCost, 0);
      overallRevenues += cycle.revenues.reduce((s, r) => s + r.totalRevenue, 0);
      overallPremium += cycle.revenues.reduce(
        (s, r) => s + (r.fairtradePremium || 0),
        0,
      );
    }
    const netProfit = overallRevenues + overallPremium - overallCosts;
    let profitabilityScore = 0;
    if (farmer.cropCycles.length > 0) {
      profitabilityScore = netProfit > 0 ? 15 : 4;
    }

    // 4. Loan repayment history (max 15)
    let loanScore = 9; // neutral: no debt, but no track record
    if (farmer.loanRecords.length > 0) {
      const ratios = farmer.loanRecords.map((l) => {
        if (!l.originalAmount || l.originalAmount <= 0) return 1;
        const repaid = 1 - l.amountOwed / l.originalAmount;
        return Math.max(0, Math.min(1, repaid));
      });
      const avgRepaid = ratios.reduce((s, r) => s + r, 0) / ratios.length;
      loanScore = Math.round(15 * avgRepaid);
    }

    // 5. Cooperative membership (max 10)
    const cooperativeScore = farmer.mamcosId ? 10 : 0;

    // 6. Experience (max 5)
    const years = farmer.farmingExperienceYears ?? 0;
    const experienceScore = years >= 5 ? 5 : years >= 2 ? 3 : 0;

    // 7. Farm size (max 10) — total registered hectares across this farmer's farms
    const totalHectares = farmer.farms.reduce(
      (sum, farm) => sum + (farm.socialHectares ?? 0),
      0,
    );
    const farmSizeScore =
      totalHectares >= 2 ? 10 : totalHectares >= 1 ? 6 : totalHectares > 0 ? 3 : 0;

    // 8. Insurance status (max 10) — an active policy demonstrates managed production risk
    const hasActiveInsurance = farmer.insurancePolicies.some(
      (policy) => policy.status === 'ACTIVE',
    );
    const insuranceScore = hasActiveInsurance ? 10 : 0;

    let score =
      verificationScore +
      productionScore +
      profitabilityScore +
      loanScore +
      cooperativeScore +
      experienceScore +
      farmSizeScore +
      insuranceScore;
    if (farmer.isBlacklisted) score = Math.min(score, 20);

    const creditReady =
      !farmer.isBlacklisted &&
      farmer.verificationStatus === VerificationStatus.VERIFIED &&
      score >= 60;

    // Persist the computed score.
    await this.prisma.farmer.update({
      where: { id: farmerId },
      data: { creditScore: score },
    });

    return {
      farmerId,
      controlNumber: farmer.controlNumber,
      creditScore: score,
      creditReady,
      isBlacklisted: farmer.isBlacklisted,
      blacklistReason: farmer.blacklistReason,
      factors: {
        verification: {
          score: verificationScore,
          max: 20,
          status: farmer.verificationStatus,
        },
        production: { score: productionScore, max: 15, harvestedCycles },
        profitability: { score: profitabilityScore, max: 15, netProfit },
        loanRepayment: {
          score: loanScore,
          max: 15,
          activeLoans: farmer.loanRecords.length,
        },
        cooperativeMembership: {
          score: cooperativeScore,
          max: 10,
          isMember: !!farmer.mamcosId,
        },
        experience: { score: experienceScore, max: 5, years },
        farmSize: { score: farmSizeScore, max: 10, totalHectares },
        insurance: {
          score: insuranceScore,
          max: 10,
          hasActiveInsurance,
        },
      },
    };
  }

  /** Lightweight read of the stored credit score + blacklist status. */
  async getCreditScore(id: string) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id },
      select: {
        id: true,
        controlNumber: true,
        creditScore: true,
        isBlacklisted: true,
        blacklistReason: true,
      },
    });
    if (!farmer) throw new NotFoundException(`Farmer with ID ${id} not found`);
    return farmer;
  }

  // --------------------------------------------------------------------------
  // Dashboard aggregates
  // --------------------------------------------------------------------------

  async getOverview() {
    const [total, byStatus, byRegion] = await Promise.all([
      this.prisma.farmer.count(),
      this.prisma.farmer.groupBy({ by: ['verificationStatus'], _count: true }),
      this.prisma.farmer.groupBy({ by: ['region'], _count: true }),
    ]);

    return {
      total,
      byVerificationStatus: byStatus.map((s) => ({
        status: s.verificationStatus,
        count: s._count,
      })),
      byRegion: byRegion.map((r) => ({
        region: r.region ?? 'Unknown',
        count: r._count,
      })),
    };
  }
}
