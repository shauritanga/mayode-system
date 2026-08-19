import { randomBytes } from 'crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClickPesaService } from '../payments/clickpesa.service';
import { SmsService } from '../messaging/sms.service';
import { PricingService, RentSchedule } from './pricing.service';
import { LeaseDocumentService } from './lease-document.service';
import { DisputesService } from '../disputes/disputes.service';
import { CreateLandListingDto } from './dto/create-land-listing.dto';
import { EscrowDepositDto } from './dto/escrow-deposit.dto';
import { CreateTractorOwnerDto } from './dto/create-tractor-owner.dto';
import { CreateTractorDto } from './dto/create-tractor.dto';
import { CreateTractorBookingDto } from './dto/create-tractor-booking.dto';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { RequestSubLeaseDto, ApproveSubLeaseDto } from './dto/sub-lease.dto';
import { TransferOwnershipDto } from './dto/ownership-transfer.dto';
import {
  DealType,
  LeaseStatus,
  PaymentStatus,
  PayoutStatus,
  SubLeaseStatus,
  BookingStatus,
  FarmGrade,
  DisputeType,
} from '@prisma/client';

/** ClickPesa statuses that mean the money was collected. */
const PAID_STATUSES = ['SUCCESS', 'SETTLED'];
/** ClickPesa payout statuses that mean the money was disbursed. */
const PAYOUT_SUCCESS_STATUSES = ['SUCCESS', 'SETTLED'];
const PAYOUT_FAILURE_STATUSES = ['FAILED'];
/** Fixed fees from the "Updated Profit Structure (Simplified for Speed)" model. */
const VERIFICATION_FEE_TZS = 2000;
const AGENT_FEE_TZS = 5000;
/**
 * Commission rate is derived from dealType server-side — never trust a
 * client-supplied rate, or a buggy/malicious caller could undercut MAYODE's
 * fee entirely. STANDARD=10% total (5% renter/5% owner), FLASH_DEAL=14%
 * (MAYODE provides instant liquidity), RELATIONSHIP=5% flat (owner did the
 * matching work).
 */
const DEAL_TYPE_COMMISSION_RATE: Record<DealType, number> = {
  STANDARD: 0.1,
  FLASH_DEAL: 0.14,
  RELATIONSHIP: 0.05,
};

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickPesa: ClickPesaService,
    private readonly sms: SmsService,
    private readonly pricing: PricingService,
    private readonly leaseDocument: LeaseDocumentService,
    private readonly disputes: DisputesService,
  ) {}

  /** ClickPesa requires an alphanumeric order reference — generate a unique one. */
  private generateOrderReference(): string {
    return `MLAX${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toUpperCase();
  }

  /** If this listing has an open approved sub-lease awaiting a new renter, record who took it. */
  private async markSubLeaseRenterIfApplicable(
    listingId: string,
    renterId: string,
  ) {
    const openSubLease = await this.prisma.landListingSubLease.findFirst({
      where: {
        originalListingId: listingId,
        status: 'APPROVED',
        newRenterId: null,
      },
    });
    if (openSubLease) {
      await this.prisma.landListingSubLease.update({
        where: { id: openSubLease.id },
        data: { newRenterId: renterId },
      });
    }
  }

  /** SMS both parties once a deposit is confirmed IN_ESCROW and pending verification. */
  private async notifyEscrowInEscrow(listingId: string) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: {
        farm: { select: { farmCode: true } },
        owner: { include: { user: { select: { phone: true } } } },
        renter: { include: { user: { select: { phone: true } } } },
      },
    });
    if (!listing) return;
    if (listing.owner.user?.phone) {
      await this.sms.send(
        listing.owner.user.phone,
        `MAYODE: A renter has deposited funds for ${listing.farm.farmCode}. Awaiting officer verification before the lease activates.`,
        'mlax_escrow_deposited',
      );
    }
    if (listing.renter?.user?.phone) {
      await this.sms.send(
        listing.renter.user.phone,
        `MAYODE: Your deposit for ${listing.farm.farmCode} is secured in M-LAX escrow. Awaiting officer verification.`,
        'mlax_escrow_deposited',
      );
    }
  }

  // ==========================================
  // 🌾 A. LAND LEASING & ESCROW WORKFLOWS
  // ==========================================

  async createLandListing(createLandListingDto: CreateLandListingDto) {
    const {
      farmId,
      ownerId,
      askingPrice,
      suggestedPrice,
      dealType,
      leaseDurationMonths,
      isFlashDeal,
      preferredRenterCode,
      isMultiYear,
      pricingModel,
      autoDropPrice,
      autoDropDays,
      facilitatedByStaffId,
    } = createLandListingDto;

    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    if (farm.farmerId !== ownerId) {
      throw new BadRequestException(
        `Farmer ID ${ownerId} is not the owner of Farm ID ${farmId}`,
      );
    }

    const owner = await this.prisma.farmer.findUnique({
      where: { id: ownerId },
    });
    if (owner?.isBlacklisted) {
      throw new BadRequestException(
        'This farmer is blacklisted from M-LAX and cannot list land',
      );
    }

    if (!farm.isVerified) {
      throw new BadRequestException(
        `Farm ID ${farmId} must be verified by a Field Officer before it can be listed on M-LAX`,
      );
    }

    if (farm.isLeased) {
      throw new ConflictException(
        `Farm ID ${farmId} is currently actively leased and cannot be listed`,
      );
    }

    // "Digital Lock" — even if isLeased was somehow reset early, the plot
    // stays locked until the recorded lease end date.
    if (farm.leaseLockedUntil && farm.leaseLockedUntil > new Date()) {
      throw new ConflictException(
        `Farm ID ${farmId} is locked under a MAYODE Lease until ${farm.leaseLockedUntil.toLocaleDateString('en-GB')}`,
      );
    }

    const commissionRate = DEAL_TYPE_COMMISSION_RATE[dealType];
    const commissionAmount = askingPrice * commissionRate;

    // Auto-compute the market-linked suggested price when the client didn't
    // supply one (the create-form can also call GET .../suggested-price to
    // preview this live before submitting).
    const computedSuggestedPrice =
      suggestedPrice ??
      (await this.pricing.computeSuggestedPrice(farmId, askingPrice))
        .suggestedPrice;

    // Loyalty tie-in: remember the most recent renter this farm had (if any)
    // so a returning renter gets relationship pricing at deposit time.
    const priorListing = await this.prisma.landListing.findFirst({
      where: { farmId, renterId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { renterId: true },
    });

    const resolvedIsMultiYear = isMultiYear ?? leaseDurationMonths > 12;
    const paymentPlan = createLandListingDto.paymentPlan ?? 'PREPAID';
    if (
      resolvedIsMultiYear &&
      pricingModel === 'rice_linked' &&
      paymentPlan === 'PREPAID'
    ) {
      throw new BadRequestException(
        "Rice-linked pricing requires the ANNUAL payment plan — future years' rice price is not known upfront.",
      );
    }
    const rentSchedule = resolvedIsMultiYear
      ? await this.pricing.buildRentSchedule(
          askingPrice,
          Math.ceil(leaseDurationMonths / 12),
          pricingModel,
        )
      : null;

    const listing = await this.prisma.landListing.create({
      data: {
        farmId,
        ownerId,
        askingPrice,
        suggestedPrice: computedSuggestedPrice,
        previousRenterId: priorListing?.renterId,
        dealType,
        commissionRate,
        commissionAmount,
        leaseStatus: LeaseStatus.DRAFT,
        leaseDurationMonths,
        isFlashDeal: isFlashDeal ?? false,
        preferredRenterCode,
        isMultiYear: resolvedIsMultiYear,
        pricingModel,
        paymentPlan: resolvedIsMultiYear ? paymentPlan : undefined,
        rentScheduleJson: rentSchedule ? (rentSchedule as any) : undefined,
        autoDropPrice,
        autoDropDays,
        facilitatedByStaffId,
      },
      include: {
        farm: true,
        owner: { include: { user: { select: { phone: true } } } },
      },
    });

    // Mark farm as available for rent
    await this.prisma.farm.update({
      where: { id: farmId },
      data: { isAvailableForRent: true },
    });

    if (listing.owner.user?.phone) {
      await this.sms.send(
        listing.owner.user.phone,
        `MAYODE: Your farm ${listing.farm.farmCode} is now listed on M-LAX for ${askingPrice.toLocaleString()} TZS. We'll notify you when a renter deposits funds.`,
        'mlax_listing_live',
      );
    }

    // Verification fee: the MAMCOS secretary who vouched for this farm's
    // verification earns a fixed 2,000/- once it goes live on M-LAX ("paid to
    // the MAMCOS Secretary for the Truth").
    if (farm.mamcosId) {
      const secretary = await this.prisma.mamcosStaff.findFirst({
        where: { mamcosId: farm.mamcosId, role: 'SECRETARY' },
      });
      if (secretary) {
        await this.prisma.mamcosStaff.update({
          where: { id: secretary.id },
          data: { stabilityBonus: { increment: VERIFICATION_FEE_TZS } },
        });
      }
    }

    // Agent fee: a desk officer who facilitated the listing earns a fixed
    // 5,000/- ("Paid to the desk officer who did the 'Process'").
    if (facilitatedByStaffId) {
      await this.prisma.mamcosStaff.update({
        where: { id: facilitatedByStaffId },
        data: { stabilityBonus: { increment: AGENT_FEE_TZS } },
      });
    }

    return listing;
  }

  async findAllLandListings(query?: {
    dealType?: DealType;
    maxPrice?: number;
    leaseStatus?: LeaseStatus;
  }) {
    const whereClause: any = {};

    if (query?.dealType) {
      whereClause.dealType = query.dealType;
    }
    if (query?.maxPrice) {
      whereClause.askingPrice = { lte: Number(query.maxPrice) };
    }
    if (query?.leaseStatus) {
      whereClause.leaseStatus = query.leaseStatus;
    }

    return this.prisma.landListing.findMany({
      where: whereClause,
      include: {
        farm: true,
        owner: true,
        renter: true,
        escrowPayments: true,
        subLeases: { where: { status: 'PENDING' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneLandListing(id: string) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id },
      include: {
        farm: true,
        owner: true,
        renter: true,
        escrowPayments: true,
        subLeases: { where: { status: 'PENDING' } },
      },
    });

    if (!listing) {
      throw new NotFoundException(`Land Listing with ID ${id} not found`);
    }

    return listing;
  }

  /** Owner edits listing terms while it's still a DRAFT (before any deposit). */
  async updateLandListing(id: string, dto: Partial<CreateLandListingDto>) {
    const listing = await this.prisma.landListing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException(`Land Listing with ID ${id} not found`);
    }
    if (listing.leaseStatus !== LeaseStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit a listing in status ${listing.leaseStatus}. Only DRAFT listings can be edited.`,
      );
    }

    const askingPrice = dto.askingPrice ?? listing.askingPrice;
    // Commission rate is always derived from dealType, never from client
    // input — same rule as createLandListing.
    const dealType = dto.dealType ?? listing.dealType;
    const commissionRate = DEAL_TYPE_COMMISSION_RATE[dealType];

    return this.prisma.landListing.update({
      where: { id },
      data: {
        ...dto,
        commissionRate,
        commissionAmount: askingPrice * commissionRate,
      },
      include: { farm: true, owner: true, renter: true },
    });
  }

  /** Owner (or admin) cancels a listing that hasn't taken any money yet. */
  async cancelLandListing(id: string) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id },
      include: { escrowPayments: true },
    });
    if (!listing) {
      throw new NotFoundException(`Land Listing with ID ${id} not found`);
    }
    const hasActiveEscrow = listing.escrowPayments.some(
      (p) =>
        p.status === PaymentStatus.PENDING ||
        p.status === PaymentStatus.IN_ESCROW,
    );
    if (hasActiveEscrow || listing.leaseStatus === LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot cancel a listing with an active deposit or lease. Resolve the escrow first.',
      );
    }

    const cancelled = await this.prisma.landListing.update({
      where: { id },
      data: { leaseStatus: LeaseStatus.TERMINATED },
      include: { farm: true },
    });
    await this.prisma.farm.update({
      where: { id: cancelled.farmId },
      data: { isAvailableForRent: false },
    });
    return cancelled;
  }

  /**
   * Renter initiates the lease: reserves the listing and either pushes a
   * mobile-money USSD/PIN prompt (ClickPesa configured) or falls back to a
   * manual mpesaRef (dev/demo, or ClickPesa not configured). Escrow only
   * becomes IN_ESCROW — and the listing only moves to PENDING_VERIFICATION —
   * once the payment is reconciled (webhook or manual/poll reconcile).
   */
  async depositEscrow(listingId: string, escrowDepositDto: EscrowDepositDto) {
    const { renterId, amount, mpesaRef, phoneNumber } = escrowDepositDto;

    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: { farm: true },
    });

    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }

    if (listing.ownerId === renterId) {
      throw new BadRequestException('A land owner cannot rent their own farm');
    }

    // Normally an ACTIVE listing can't take a new deposit — unless the owner
    // has approved a sub-lease (the original renter re-listing their season)
    // and a new renter hasn't stepped in yet.
    if (listing.leaseStatus === LeaseStatus.ACTIVE) {
      const openSubLease = await this.prisma.landListingSubLease.findFirst({
        where: {
          originalListingId: listingId,
          status: 'APPROVED',
          newRenterId: null,
        },
      });
      if (!openSubLease) {
        throw new ConflictException(
          'This land listing is already actively leased',
        );
      }
    }

    const renter = await this.prisma.farmer.findUnique({
      where: { id: renterId },
      include: { user: { select: { phone: true } } },
    });
    if (!renter) {
      throw new NotFoundException(`Farmer with ID ${renterId} not found`);
    }
    if (renter.isBlacklisted) {
      throw new BadRequestException(
        'This farmer is blacklisted from M-LAX and cannot rent land',
      );
    }

    // Relationship deals lock the discounted price to one named renter
    // (the doc's "Closed Circle" feature) — the depositing renter's control
    // number must match the code the owner set when listing.
    if (
      listing.preferredRenterCode &&
      listing.preferredRenterCode.trim().toUpperCase() !==
        renter.controlNumber.trim().toUpperCase()
    ) {
      throw new BadRequestException(
        `This listing is reserved for a specific renter (control number ${listing.preferredRenterCode}). Your control number does not match.`,
      );
    }

    // Multi-year leases: the initial deposit amount is always server-computed
    // from the rent schedule (PREPAID = full term, ANNUAL = year 1 only) —
    // never trust a client-supplied amount for these.
    let depositAmount = amount;
    if (listing.isMultiYear && listing.rentScheduleJson) {
      const schedule = listing.rentScheduleJson as unknown as RentSchedule;
      if (listing.paymentPlan === 'ANNUAL') {
        depositAmount = await this.pricing.computeInstallmentAmount(
          schedule,
          1,
        );
      } else if (schedule.model !== 'rice_linked') {
        depositAmount = schedule.years.reduce((sum, y) => sum + y.amount, 0);
      }
    }

    const payViaClickPesa = this.clickPesa.isConfigured();
    const payerPhone = phoneNumber?.trim() || renter.user?.phone;

    if (payViaClickPesa && !payerPhone) {
      throw new BadRequestException('A mobile-money phone number is required');
    }

    // Loyalty pricing: a renter returning to a farm they rented last season
    // gets the flat 5% "relationship" commission instead of the standard rate.
    const isReturningRenter =
      listing.previousRenterId != null && listing.previousRenterId === renterId;
    const loyaltyUpdate = isReturningRenter
      ? {
          dealType: DealType.RELATIONSHIP,
          commissionRate: 0.05,
          commissionAmount: depositAmount * 0.05,
        }
      : {};

    // Reserve the listing for this renter while payment is pending.
    await this.prisma.landListing.update({
      where: { id: listingId },
      data: {
        renterId,
        finalPrice: depositAmount,
        lastInstallmentYear: listing.isMultiYear ? 1 : undefined,
        ...loyaltyUpdate,
      },
    });

    if (!payViaClickPesa) {
      // Manual/dev fallback — trust the client-supplied mpesaRef immediately,
      // matching the previous synchronous behaviour.
      const escrowPayment = await this.prisma.escrowPayment.create({
        data: {
          listingId,
          amount: depositAmount,
          status: PaymentStatus.IN_ESCROW,
          mpesaRef,
          phoneNumber: payerPhone,
          depositedAt: new Date(),
        },
      });
      const updatedListing = await this.prisma.landListing.update({
        where: { id: listingId },
        data: {
          leaseStatus: LeaseStatus.PENDING_VERIFICATION,
          mayodeProtected: true,
        },
        include: {
          farm: true,
          owner: true,
          renter: true,
          escrowPayments: true,
        },
      });
      await this.markSubLeaseRenterIfApplicable(listingId, renterId);
      await this.notifyEscrowInEscrow(listingId);
      return {
        updatedListing,
        escrowPayment,
        paymentProvider: 'manual' as const,
        message:
          'Deposit recorded. An administrator will confirm payment before the lease is verified.',
      };
    }

    const orderReference = this.generateOrderReference();
    const escrowPayment = await this.prisma.escrowPayment.create({
      data: {
        listingId,
        amount: depositAmount,
        status: PaymentStatus.PENDING,
        orderReference,
        phoneNumber: payerPhone,
      },
    });

    try {
      const push = await this.clickPesa.initiateUssdPush({
        amount: String(depositAmount),
        orderReference,
        phoneNumber: payerPhone,
      });
      return {
        escrowPayment,
        paymentProvider: 'clickpesa' as const,
        orderReference,
        pushStatus: push.status,
        message:
          'Check your phone and enter your mobile-money PIN to complete the deposit.',
      };
    } catch (e) {
      throw new BadRequestException(
        `Could not start mobile-money payment: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * Reconcile a ClickPesa collection order: re-query the authoritative status
   * and move the escrow to IN_ESCROW (and the listing to PENDING_VERIFICATION)
   * if paid, or FAILED otherwise. Safe to call from the webhook, from mobile
   * polling, or via the manual admin fallback endpoint — idempotent once the
   * escrow is no longer PENDING.
   */
  async reconcileEscrowPayment(orderReference: string) {
    const escrow = await this.prisma.escrowPayment.findUnique({
      where: { orderReference },
      include: { listing: true },
    });
    if (!escrow) {
      throw new NotFoundException(
        `No escrow payment for order ${orderReference}`,
      );
    }
    if (escrow.status !== PaymentStatus.PENDING) {
      return { status: escrow.status, listingId: escrow.listingId };
    }

    const payment = this.clickPesa.isConfigured()
      ? await this.clickPesa.queryPayment(orderReference)
      : null;

    if (payment && PAID_STATUSES.includes(payment.status)) {
      await this.prisma.escrowPayment.update({
        where: { id: escrow.id },
        data: {
          status: PaymentStatus.IN_ESCROW,
          mpesaRef: payment.paymentReference ?? payment.id,
          depositedAt: new Date(),
        },
      });

      // An annual installment (year 2+) on an already-ACTIVE multi-year lease
      // doesn't go through verification again — just settle it directly.
      if (escrow.installmentYear != null) {
        await this.settleAnnualInstallment(
          escrow.id,
          escrow.listingId,
          escrow.installmentYear,
          escrow.amount,
        );
        return { status: PaymentStatus.IN_ESCROW, listingId: escrow.listingId };
      }

      await this.prisma.landListing.update({
        where: { id: escrow.listingId },
        data: {
          leaseStatus: LeaseStatus.PENDING_VERIFICATION,
          mayodeProtected: true,
        },
      });
      if (escrow.listing.renterId) {
        await this.markSubLeaseRenterIfApplicable(
          escrow.listingId,
          escrow.listing.renterId,
        );
      }
      await this.notifyEscrowInEscrow(escrow.listingId);
      return { status: PaymentStatus.IN_ESCROW, listingId: escrow.listingId };
    }

    if (payment && payment.status === 'FAILED') {
      await this.prisma.escrowPayment.update({
        where: { id: escrow.id },
        data: { status: PaymentStatus.FAILED },
      });
      return { status: PaymentStatus.FAILED, listingId: escrow.listingId };
    }

    // Still processing / pending.
    return {
      status: escrow.status,
      listingId: escrow.listingId,
      providerStatus: payment?.status ?? 'PENDING',
    };
  }

  /**
   * Pay the next year's installment on an ACTIVE multi-year ANNUAL-plan
   * lease. Unlike the original deposit, this never re-enters verification —
   * the lease is already active, so a successful payment settles directly.
   * Any unapplied "Right to Improve" development credits (see
   * logLandImprovement) are deducted from the amount due, floored at zero.
   */
  async payAnnualInstallment(
    listingId: string,
    renterId: string,
    dto: { phoneNumber?: string; mpesaRef?: string },
  ) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (!listing.isMultiYear || listing.paymentPlan !== 'ANNUAL') {
      throw new BadRequestException(
        'This listing is not on a multi-year annual payment plan',
      );
    }
    if (listing.leaseStatus !== LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot pay an installment on a listing in status ${listing.leaseStatus}. Expected ACTIVE.`,
      );
    }
    if (listing.renterId !== renterId) {
      throw new BadRequestException(
        "Only the current renter can pay this lease's installments",
      );
    }
    const totalYears = Math.ceil(listing.leaseDurationMonths / 12);
    const nextYear = listing.lastInstallmentYear + 1;
    if (nextYear > totalYears) {
      throw new BadRequestException(
        'All installments for this lease have already been paid',
      );
    }

    const schedule = listing.rentScheduleJson as unknown as RentSchedule;
    let amountDue = await this.pricing.computeInstallmentAmount(
      schedule,
      nextYear,
    );

    const unappliedCredits = await this.prisma.landListingImprovement.findMany({
      where: { listingId, appliedToYear: null },
    });
    const creditTotal = unappliedCredits.reduce(
      (sum, c) => sum + c.amountTzs,
      0,
    );
    if (creditTotal > 0) {
      amountDue = Math.max(0, amountDue - creditTotal);
      await this.prisma.landListingImprovement.updateMany({
        where: { id: { in: unappliedCredits.map((c) => c.id) } },
        data: { appliedToYear: nextYear },
      });
    }

    const renter = await this.prisma.farmer.findUnique({
      where: { id: renterId },
      include: { user: { select: { phone: true } } },
    });
    const payerPhone = dto.phoneNumber?.trim() || renter?.user?.phone;
    const payViaClickPesa = this.clickPesa.isConfigured();
    if (payViaClickPesa && !payerPhone) {
      throw new BadRequestException('A mobile-money phone number is required');
    }

    if (!payViaClickPesa) {
      const escrow = await this.prisma.escrowPayment.create({
        data: {
          listingId,
          amount: amountDue,
          status: PaymentStatus.IN_ESCROW,
          mpesaRef: dto.mpesaRef,
          phoneNumber: payerPhone,
          depositedAt: new Date(),
          installmentYear: nextYear,
        },
      });
      await this.settleAnnualInstallment(
        escrow.id,
        listingId,
        nextYear,
        amountDue,
      );
      return {
        escrowPayment: escrow,
        paymentProvider: 'manual' as const,
        year: nextYear,
        amountDue,
      };
    }

    const orderReference = this.generateOrderReference();
    const escrow = await this.prisma.escrowPayment.create({
      data: {
        listingId,
        amount: amountDue,
        status: PaymentStatus.PENDING,
        orderReference,
        phoneNumber: payerPhone,
        installmentYear: nextYear,
      },
    });
    try {
      const push = await this.clickPesa.initiateUssdPush({
        amount: String(amountDue),
        orderReference,
        phoneNumber: payerPhone!,
      });
      return {
        escrowPayment: escrow,
        paymentProvider: 'clickpesa' as const,
        orderReference,
        pushStatus: push.status,
        year: nextYear,
        amountDue,
      };
    } catch (e) {
      throw new BadRequestException(
        `Could not start mobile-money payment: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Marks an annual installment paid, advances the lease year counter, disburses the owner's share, and notifies both parties. */
  private async settleAnnualInstallment(
    escrowId: string,
    listingId: string,
    year: number,
    amount: number,
  ) {
    const listing = await this.prisma.landListing.update({
      where: { id: listingId },
      data: { lastInstallmentYear: year },
      include: {
        farm: true,
        owner: { include: { user: { select: { phone: true } } } },
      },
    });
    // Installments don't carry their own commissionAmount column — compute
    // this year's MAYODE cut from the listing's stored commission rate.
    await this.disburseOwnerPayout(escrowId, {
      id: listing.id,
      finalPrice: amount,
      commissionAmount: amount * listing.commissionRate,
      ownerId: listing.ownerId,
      owner: listing.owner,
    });
    if (listing.owner.user?.phone) {
      await this.sms.send(
        listing.owner.user.phone,
        `MAYODE: Year ${year} rent for ${listing.farm.farmCode} has been paid (${amount.toLocaleString()} TZS). Payout is on the way.`,
        'mlax_installment_paid',
      );
    }
  }

  async releaseEscrow(listingId: string) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: {
        escrowPayments: true,
        farm: true,
        owner: { include: { user: true } },
      },
    });

    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }

    if (listing.leaseStatus !== LeaseStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(
        `Cannot release escrow for listing in status ${listing.leaseStatus}. Expected PENDING_VERIFICATION.`,
      );
    }

    const pendingEscrow = listing.escrowPayments.find(
      (p) => p.status === PaymentStatus.IN_ESCROW,
    );
    if (!pendingEscrow) {
      throw new BadRequestException(
        'No active IN_ESCROW payment found for this listing',
      );
    }

    const now = new Date();
    const leaseEndDate = new Date(now);
    leaseEndDate.setMonth(
      leaseEndDate.getMonth() + listing.leaseDurationMonths,
    );

    // Update escrow payment status to RELEASED
    await this.prisma.escrowPayment.update({
      where: { id: pendingEscrow.id },
      data: {
        status: PaymentStatus.RELEASED,
        releasedAt: now,
      },
    });

    // Update listing to ACTIVE lease
    const updatedListing = await this.prisma.landListing.update({
      where: { id: listingId },
      data: {
        leaseStatus: LeaseStatus.ACTIVE,
        leaseStartDate: now,
        leaseEndDate: leaseEndDate,
      },
      include: {
        farm: true,
        owner: true,
        renter: true,
        escrowPayments: true,
      },
    });

    // Update farm record to reflect active lease
    await this.prisma.farm.update({
      where: { id: listing.farmId },
      data: {
        isLeased: true,
        isAvailableForRent: false,
        leaseLockedUntil: leaseEndDate,
      },
    });

    // If this deposit settles a sub-lease (the original renter re-listed
    // their season), route the payout to them instead of the owner.
    const settlingSubLease = await this.prisma.landListingSubLease.findFirst({
      where: {
        originalListingId: listingId,
        status: 'APPROVED',
        newRenterId: updatedListing.renterId,
        settledAt: null,
      },
    });

    if (settlingSubLease) {
      await this.disburseSubLeasePayout(
        pendingEscrow.id,
        listing,
        settlingSubLease,
      );
    } else {
      // Disburse the owner's share (deposit minus MAYODE's commission) now
      // that the money already sits in MAYODE's ClickPesa balance.
      await this.disburseOwnerPayout(pendingEscrow.id, listing);
    }

    if (listing.owner.user?.phone) {
      await this.sms.send(
        listing.owner.user.phone,
        `MAYODE: Your M-LAX lease for ${listing.farm.farmCode} is now ACTIVE. Payout to your mobile money is on the way.`,
        'mlax_lease_active',
      );
    }
    if (updatedListing.renter) {
      const renterPhone = (
        await this.prisma.farmer.findUnique({
          where: { id: updatedListing.renter.id },
          include: { user: { select: { phone: true } } },
        })
      )?.user?.phone;
      if (renterPhone) {
        await this.sms.send(
          renterPhone,
          `MAYODE: Your M-LAX lease for ${listing.farm.farmCode} is now ACTIVE. Enjoy the season!`,
          'mlax_lease_active',
        );
      }
    }

    // Generate the digital lease agreement (PDF + QR) now that both parties
    // and terms are finalized. Best-effort — a generation failure shouldn't
    // undo the already-active lease.
    try {
      await this.leaseDocument.generateAgreement(listingId);
    } catch (e) {
      this.logger.error(
        `Failed to generate lease agreement for ${listingId}: ${e instanceof Error ? e.message : e}`,
      );
    }

    return updatedListing;
  }

  /**
   * Pay the owner their share of a released escrow (amount collected minus
   * MAYODE's commission) via ClickPesa's Payout API. Best-effort: a payout
   * failure never undoes the already-active lease — it's tracked on the
   * escrow row (`payoutStatus`) for the scheduler/admin to retry.
   */
  private async disburseOwnerPayout(
    escrowPaymentId: string,
    listing: {
      id: string;
      finalPrice: number | null;
      commissionAmount: number | null;
      ownerId: string;
      owner: { user?: { phone?: string } | null };
    },
  ) {
    const grossAmount = listing.finalPrice ?? 0;
    const commission = listing.commissionAmount ?? 0;
    let payoutAmount = Math.max(0, grossAmount - commission);
    const ownerPhone = listing.owner.user?.phone;

    // A pending ownership-transfer fee (fixed 10,000/-) is deducted from the
    // owner's very next payout after the transfer was recorded.
    const unbilledTransfer =
      await this.prisma.landListingOwnershipTransfer.findFirst({
        where: { listingId: listing.id, feeChargedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    if (unbilledTransfer) {
      payoutAmount = Math.max(
        0,
        payoutAmount - unbilledTransfer.transferFeeTzs,
      );
      await this.prisma.landListingOwnershipTransfer.update({
        where: { id: unbilledTransfer.id },
        data: { feeChargedAt: new Date() },
      });
    }

    if (payoutAmount <= 0 || !ownerPhone) return;

    if (!this.clickPesa.isConfigured()) {
      // Bookkeeping-only fallback — cash settles off-platform for now.
      await this.prisma.escrowPayment.update({
        where: { id: escrowPaymentId },
        data: {
          payoutStatus: PayoutStatus.PENDING,
          payoutRecipientId: listing.ownerId,
        },
      });
      return;
    }

    const payoutOrderReference = this.generateOrderReference();
    await this.prisma.escrowPayment.update({
      where: { id: escrowPaymentId },
      data: {
        payoutOrderReference,
        payoutStatus: PayoutStatus.PROCESSING,
        payoutRecipientId: listing.ownerId,
      },
    });

    try {
      await this.clickPesa.initiateMobilePayout({
        amount: String(payoutAmount),
        orderReference: payoutOrderReference,
        phoneNumber: ownerPhone,
      });
    } catch (e) {
      await this.prisma.escrowPayment.update({
        where: { id: escrowPaymentId },
        data: {
          payoutStatus: PayoutStatus.FAILED,
          payoutFailureReason: e instanceof Error ? e.message : String(e),
        },
      });
      await this.sms.send(
        ownerPhone,
        'MAYODE: We could not complete your M-LAX payout automatically. Our team has been notified and will settle it manually.',
        'mlax_payout_failed',
      );
    }
  }

  /**
   * Settle a sub-lease: the original renter (who re-listed their season
   * because they couldn't continue) gets 95% of what the new renter paid;
   * MAYODE keeps the other 5% as the re-listing fee, already retained since
   * the full amount was collected into MAYODE's balance at deposit time.
   */
  private async disburseSubLeasePayout(
    escrowPaymentId: string,
    listing: { finalPrice: number | null },
    subLease: { id: string; originalRenterId: string },
  ) {
    const grossAmount = listing.finalPrice ?? 0;
    const payoutAmount = Math.max(0, grossAmount * 0.95);

    const originalRenter = await this.prisma.farmer.findUnique({
      where: { id: subLease.originalRenterId },
      include: { user: { select: { phone: true } } },
    });
    const recipientPhone = originalRenter?.user?.phone;

    await this.prisma.landListingSubLease.update({
      where: { id: subLease.id },
      data: { settledAt: new Date() },
    });

    if (payoutAmount <= 0 || !recipientPhone) return;

    if (!this.clickPesa.isConfigured()) {
      await this.prisma.escrowPayment.update({
        where: { id: escrowPaymentId },
        data: {
          payoutStatus: PayoutStatus.PENDING,
          payoutRecipientId: subLease.originalRenterId,
        },
      });
      return;
    }

    const payoutOrderReference = this.generateOrderReference();
    await this.prisma.escrowPayment.update({
      where: { id: escrowPaymentId },
      data: {
        payoutOrderReference,
        payoutStatus: PayoutStatus.PROCESSING,
        payoutRecipientId: subLease.originalRenterId,
      },
    });

    try {
      await this.clickPesa.initiateMobilePayout({
        amount: String(payoutAmount),
        orderReference: payoutOrderReference,
        phoneNumber: recipientPhone,
      });
    } catch (e) {
      await this.prisma.escrowPayment.update({
        where: { id: escrowPaymentId },
        data: {
          payoutStatus: PayoutStatus.FAILED,
          payoutFailureReason: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  /**
   * Poll a processing payout for its authoritative status (called by the
   * payout scheduler). Idempotent once the payout is no longer PROCESSING.
   */
  async reconcilePayoutStatus(escrowPaymentId: string) {
    const escrow = await this.prisma.escrowPayment.findUnique({
      where: { id: escrowPaymentId },
      include: {
        payoutRecipient: { include: { user: { select: { phone: true } } } },
      },
    });
    if (!escrow || !escrow.payoutOrderReference) return null;
    if (escrow.payoutStatus !== PayoutStatus.PROCESSING) return escrow;

    const result = this.clickPesa.isConfigured()
      ? await this.clickPesa.queryPayoutStatus(escrow.payoutOrderReference)
      : null;
    const recipientPhone = escrow.payoutRecipient?.user?.phone;

    if (result && PAYOUT_SUCCESS_STATUSES.includes(result.status)) {
      const updated = await this.prisma.escrowPayment.update({
        where: { id: escrow.id },
        data: { payoutStatus: PayoutStatus.SUCCESS },
      });
      if (recipientPhone) {
        await this.sms.send(
          recipientPhone,
          `MAYODE: Your M-LAX payout of ${escrow.amount.toLocaleString()} TZS has been sent to your mobile money.`,
          'mlax_payout_success',
        );
      }
      return updated;
    }
    if (result && PAYOUT_FAILURE_STATUSES.includes(result.status)) {
      const updated = await this.prisma.escrowPayment.update({
        where: { id: escrow.id },
        data: {
          payoutStatus: PayoutStatus.FAILED,
          payoutFailureReason: result.message ?? 'Payout failed',
        },
      });
      if (recipientPhone) {
        await this.sms.send(
          recipientPhone,
          'MAYODE: We could not complete your M-LAX payout automatically. Our team has been notified and will settle it manually.',
          'mlax_payout_failed',
        );
      }
      return updated;
    }
    return escrow;
  }

  /** All escrow payouts still processing — used by the payout scheduler. */
  async findProcessingPayouts() {
    return this.prisma.escrowPayment.findMany({
      where: { payoutStatus: PayoutStatus.PROCESSING },
      include: { payoutRecipient: { include: { user: true } } },
    });
  }

  /**
   * SMS the renter (monthly, via the scheduler) for every ACTIVE multi-year
   * ANNUAL lease whose next installment's anniversary has arrived and hasn't
   * been paid yet. Returns the number of reminders sent.
   */
  async sendDueAnnualReminders(): Promise<number> {
    const candidates = await this.prisma.landListing.findMany({
      where: {
        isMultiYear: true,
        paymentPlan: 'ANNUAL',
        leaseStatus: LeaseStatus.ACTIVE,
        leaseStartDate: { not: null },
      },
      include: {
        farm: { select: { farmCode: true } },
        renter: { include: { user: { select: { phone: true } } } },
      },
    });
    const now = new Date();
    let sent = 0;
    for (const listing of candidates) {
      const totalYears = Math.ceil(listing.leaseDurationMonths / 12);
      if (listing.lastInstallmentYear >= totalYears) continue;
      const nextAnniversary = new Date(listing.leaseStartDate!);
      nextAnniversary.setFullYear(
        nextAnniversary.getFullYear() + listing.lastInstallmentYear,
      );
      if (now < nextAnniversary) continue;
      if (!listing.renter?.user?.phone) continue;
      await this.sms.send(
        listing.renter.user.phone,
        `MAYODE: Your year ${listing.lastInstallmentYear + 1} rent for ${listing.farm.farmCode} is due. Pay it in the M-LAX app to keep your lease active.`,
        'mlax_annual_installment_due',
      );
      sent++;
    }
    return sent;
  }

  // ==========================================
  // 🤝 A1b. BARGAINING — "MAKE AN OFFER"
  // ==========================================

  /** A prospective renter bids below the asking price on a DRAFT listing. */
  async submitOffer(listingId: string, farmerId: string, offerAmount: number) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: {
        farm: true,
        owner: { include: { user: { select: { phone: true } } } },
      },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (listing.ownerId === farmerId) {
      throw new BadRequestException(
        'A land owner cannot make an offer on their own listing',
      );
    }
    if (listing.leaseStatus !== LeaseStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot make an offer on a listing in status ${listing.leaseStatus}. Expected DRAFT.`,
      );
    }
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
    });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }
    if (farmer.isBlacklisted) {
      throw new BadRequestException(
        'This farmer is blacklisted from M-LAX and cannot make offers',
      );
    }

    const offer = await this.prisma.landListingOffer.create({
      data: { listingId, farmerId, offerAmount },
    });

    if (listing.owner.user?.phone) {
      await this.sms.send(
        listing.owner.user.phone,
        `MAYODE: You've received an offer of ${offerAmount.toLocaleString()} TZS for ${listing.farm.farmCode} (asking ${listing.askingPrice.toLocaleString()}). Review it in the M-LAX app.`,
        'mlax_offer_received',
      );
    }
    return offer;
  }

  /** Owner accepts, rejects, or counters a pending offer. */
  async respondToOffer(
    listingId: string,
    offerId: string,
    ownerId: string,
    dto: { action: 'accept' | 'reject' | 'counter'; counterAmount?: number },
  ) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (listing.ownerId !== ownerId) {
      throw new BadRequestException(
        'Only the listing owner can respond to offers',
      );
    }
    const offer = await this.prisma.landListingOffer.findUnique({
      where: { id: offerId },
      include: { farmer: { include: { user: { select: { phone: true } } } } },
    });
    if (!offer || offer.listingId !== listingId) {
      throw new NotFoundException(
        `Offer with ID ${offerId} not found for this listing`,
      );
    }
    if (offer.status !== 'PENDING') {
      throw new BadRequestException(
        `This offer has already been ${offer.status.toLowerCase()}`,
      );
    }
    if (dto.action === 'counter' && !dto.counterAmount) {
      throw new BadRequestException(
        'counterAmount is required to counter an offer',
      );
    }

    const status =
      dto.action === 'accept'
        ? 'ACCEPTED'
        : dto.action === 'reject'
          ? 'REJECTED'
          : 'COUNTERED';
    const updated = await this.prisma.landListingOffer.update({
      where: { id: offerId },
      data: {
        status,
        counterAmount: dto.action === 'counter' ? dto.counterAmount : undefined,
      },
    });

    const farmerPhone = offer.farmer.user?.phone;
    if (farmerPhone) {
      const message =
        dto.action === 'accept'
          ? `MAYODE: Your offer of ${offer.offerAmount.toLocaleString()} TZS was accepted! Deposit that amount in the app to secure the lease.`
          : dto.action === 'reject'
            ? 'MAYODE: Your offer was declined by the owner.'
            : `MAYODE: The owner countered your offer with ${dto.counterAmount!.toLocaleString()} TZS. Review it in the M-LAX app.`;
      await this.sms.send(farmerPhone, message, 'mlax_offer_decision');
    }
    return updated;
  }

  /** Farmer accepts or declines the owner's counter-offer. */
  async respondToCounterOffer(
    offerId: string,
    farmerId: string,
    accept: boolean,
  ) {
    const offer = await this.prisma.landListingOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer) {
      throw new NotFoundException(`Offer with ID ${offerId} not found`);
    }
    if (offer.farmerId !== farmerId) {
      throw new BadRequestException(
        'Only the farmer who made this offer can respond to the counter',
      );
    }
    if (offer.status !== 'COUNTERED') {
      throw new BadRequestException(
        'This offer has no pending counter to respond to',
      );
    }
    return this.prisma.landListingOffer.update({
      where: { id: offerId },
      data: {
        status: accept ? 'ACCEPTED' : 'REJECTED',
        offerAmount: accept ? offer.counterAmount! : offer.offerAmount,
      },
    });
  }

  async findOffersForListing(listingId: string) {
    return this.prisma.landListingOffer.findMany({
      where: { listingId },
      include: {
        farmer: {
          select: { firstName: true, lastName: true, controlNumber: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // 🔁 A2. SUB-LEASING & OWNERSHIP TRANSFER
  // ==========================================

  /**
   * The current renter can't continue the season and wants to hand it off:
   * request re-listing the remainder to a new renter. Requires the owner's
   * approval before the listing accepts a new deposit (see depositEscrow).
   */
  async requestSubLease(
    listingId: string,
    renterId: string,
    dto: RequestSubLeaseDto,
  ) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: {
        farm: true,
        owner: { include: { user: { select: { phone: true } } } },
      },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (listing.renterId !== renterId) {
      throw new BadRequestException(
        'Only the current renter can request a sub-lease',
      );
    }
    if (listing.leaseStatus !== LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot sub-lease a listing in status ${listing.leaseStatus}. Expected ACTIVE.`,
      );
    }

    const existing = await this.prisma.landListingSubLease.findFirst({
      where: { originalListingId: listingId, status: SubLeaseStatus.PENDING },
    });
    if (existing) {
      throw new ConflictException(
        'A sub-lease request is already pending for this listing',
      );
    }

    const subLease = await this.prisma.landListingSubLease.create({
      data: {
        originalListingId: listingId,
        originalRenterId: renterId,
        newAskingPrice: dto.newAskingPrice,
      },
    });

    if (listing.owner.user?.phone) {
      await this.sms.send(
        listing.owner.user.phone,
        `MAYODE: Your renter for ${listing.farm.farmCode} has requested to sub-lease the remaining season. Review it in the M-LAX app.`,
        'mlax_sublease_requested',
      );
    }

    return subLease;
  }

  /**
   * Owner approves or rejects a pending sub-lease request. On approval, the
   * listing becomes bookable again for a new renter (see depositEscrow); on
   * release, the payout is redirected to the original renter minus MAYODE's
   * 5% re-listing fee (see disburseSubLeasePayout).
   */
  async approveSubLease(
    listingId: string,
    subLeaseId: string,
    ownerId: string,
    dto: ApproveSubLeaseDto,
  ) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (listing.ownerId !== ownerId) {
      throw new BadRequestException(
        'Only the listing owner can approve a sub-lease',
      );
    }

    const subLease = await this.prisma.landListingSubLease.findUnique({
      where: { id: subLeaseId },
      include: {
        originalRenter: { include: { user: { select: { phone: true } } } },
      },
    });
    if (!subLease || subLease.originalListingId !== listingId) {
      throw new NotFoundException(
        `Sub-lease request with ID ${subLeaseId} not found for this listing`,
      );
    }
    if (subLease.status !== SubLeaseStatus.PENDING) {
      throw new BadRequestException(
        `Sub-lease request already ${subLease.status}`,
      );
    }

    const updated = await this.prisma.landListingSubLease.update({
      where: { id: subLeaseId },
      data: {
        status: dto.approve ? SubLeaseStatus.APPROVED : SubLeaseStatus.REJECTED,
        approvedByOwnerAt: dto.approve ? new Date() : null,
      },
    });

    const renterPhone = subLease.originalRenter.user?.phone;
    if (renterPhone) {
      await this.sms.send(
        renterPhone,
        dto.approve
          ? 'MAYODE: Your sub-lease request was approved. Your farm will be re-listed for a new renter and you’ll be paid once they deposit funds.'
          : 'MAYODE: Your sub-lease request was declined by the owner.',
        'mlax_sublease_decision',
      );
    }

    return updated;
  }

  /**
   * Owner transfers the farm to a new owner mid-lease ("the lease follows the
   * land, not the person"). If the new owner is already a registered Farmer
   * (matched by phone), ownership moves immediately; otherwise it's recorded
   * pending resolution and the next payout still routes to the old owner
   * until a transfer with a resolved Farmer exists. A fixed 10,000/- transfer
   * fee is deducted from the next payout (see disburseOwnerPayout).
   */
  async transferOwnership(
    listingId: string,
    currentOwnerId: string,
    dto: TransferOwnershipDto,
  ) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: { farm: true },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (listing.ownerId !== currentOwnerId) {
      throw new BadRequestException(
        'Only the current owner can transfer this listing',
      );
    }

    // Phones aren't stored in a single normalized format, so match on the
    // last 9 significant digits (the part that's stable across 0/+255/255
    // prefixes) rather than assuming a canonical form.
    const digits = dto.newOwnerPhone.replace(/[^0-9]/g, '');
    const last9 = digits.slice(-9);
    const newOwnerUser = await this.prisma.user.findFirst({
      where: { phone: { endsWith: last9 } },
      include: { farmer: true },
    });
    const toOwnerId = newOwnerUser?.farmer?.id;

    const transfer = await this.prisma.landListingOwnershipTransfer.create({
      data: {
        listingId,
        fromOwnerId: currentOwnerId,
        toOwnerPhone: dto.newOwnerPhone,
        toOwnerId,
        reason: dto.reason,
      },
    });

    if (toOwnerId) {
      await this.prisma.landListing.update({
        where: { id: listingId },
        data: { ownerId: toOwnerId },
      });
      await this.sms.send(
        dto.newOwnerPhone,
        `MAYODE: Ownership of ${listing.farm.farmCode} has been transferred to you on M-LAX. Any active lease continues under the same terms.`,
        'mlax_ownership_transferred',
      );
    } else {
      await this.sms.send(
        dto.newOwnerPhone,
        `MAYODE: ${listing.farm.farmCode} was transferred to your phone number on M-LAX, but we need you to register as a MAYODE farmer to receive future payouts. Please sign up in the app.`,
        'mlax_ownership_transfer_pending',
      );
    }

    return transfer;
  }

  /**
   * "Reward for Honesty" — every deal closed inside M-LAX (escrow secured)
   * gets a MAYODE-backed protection status, the incentive the doc describes
   * for staying in-app instead of a private "vijiweni" deal. NOTE: this is an
   * internal MAYODE guarantee/priority-support marker, not a third-party
   * underwritten crop-insurance policy — no insurer or claims-adjustment
   * pipeline exists in this system.
   */
  async getProtectionStatus(listingId: string) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    return {
      mayodeProtected: listing.mayodeProtected,
      note: listing.mayodeProtected
        ? 'This lease was closed inside M-LAX: MAYODE guarantees the escrowed payment and gives this dispute priority handling. This is an internal MAYODE guarantee, not third-party crop insurance.'
        : 'This lease has not yet secured funds through M-LAX escrow — private/off-platform deals carry no MAYODE guarantee.',
    };
  }

  /**
   * Shared "is this farmer active/in-good-standing on M-LAX" check backing
   * both the Input Credit Lock and Harvest Buy-Back Guarantee — the doc's
   * "why renters come back every season" mechanisms. A farmer qualifies if
   * they have (or recently had) an ACTIVE or COMPLETED lease as a renter.
   */
  private async checkMlaxActivityEligibility(
    farmerId: string,
  ): Promise<{ eligible: boolean; reason: string }> {
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
    });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }
    if (farmer.isBlacklisted) {
      return { eligible: false, reason: 'Farmer is blacklisted from M-LAX' };
    }
    const activeLease = await this.prisma.landListing.findFirst({
      where: {
        renterId: farmerId,
        leaseStatus: { in: [LeaseStatus.ACTIVE, LeaseStatus.COMPLETED] },
      },
    });
    if (!activeLease) {
      return {
        eligible: false,
        reason:
          'Farmer has no active or completed M-LAX lease as a renter — rent through M-LAX first to unlock this benefit',
      };
    }
    return {
      eligible: true,
      reason: `Eligible via M-LAX lease ${activeLease.id} (${activeLease.leaseStatus})`,
    };
  }

  /**
   * Input Credit Lock: only M-LAX-active renters can be issued input credit —
   * the incentive to stay in-platform instead of side-dealing. Wires into the
   * real `LoanRecord` model (not a new module) so this credit shows up in the
   * farmer's actual loan history, same as any other loan.
   */
  async checkInputCreditEligibility(farmerId: string) {
    return this.checkMlaxActivityEligibility(farmerId);
  }

  async issueInputCredit(
    farmerId: string,
    dto: {
      amountTzs: number;
      repaymentSchedule?: string;
      autoDeductPercent?: number;
    },
  ) {
    const eligibility = await this.checkMlaxActivityEligibility(farmerId);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        `Not eligible for M-LAX input credit: ${eligibility.reason}`,
      );
    }
    const loan = await this.prisma.loanRecord.create({
      data: {
        farmerId,
        lenderName: 'MAYODE Processing (M-LAX Input Credit)',
        originalAmount: dto.amountTzs,
        amountOwed: dto.amountTzs,
        repaymentSchedule: dto.repaymentSchedule,
        autoDeductPercent: dto.autoDeductPercent,
        isActive: true,
      },
    });
    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
      include: { user: { select: { phone: true } } },
    });
    if (farmer?.user?.phone) {
      await this.sms.send(
        farmer.user.phone,
        `MAYODE: You've been issued ${dto.amountTzs.toLocaleString()} TZS in M-LAX input credit (seeds/fertilizer). Repay at harvest.`,
        'mlax_input_credit_issued',
      );
    }
    return loan;
  }

  /**
   * Harvest Buy-Back Guarantee: eligibility check for MAYODE's Processing
   * Dept to offer a guaranteed off-take price. NOTE: no Processing/Milling
   * purchase pipeline exists in this system yet — this is an eligibility
   * signal for staff to act on manually, not an automated purchase contract.
   */
  async checkBuyBackEligibility(farmerId: string) {
    return this.checkMlaxActivityEligibility(farmerId);
  }

  /**
   * MAMCOS stability metric: what fraction of a cooperative's farms are
   * actually on M-LAX (available, leased, or ever listed). Ties into the
   * doc's "Secretary Stability Bonus" — a high percentage means side-dealing
   * isn't happening in that MAMCOS.
   */
  async getMamcosStability(mamcosId: string) {
    const mamcos = await this.prisma.mamcos.findUnique({
      where: { id: mamcosId },
    });
    if (!mamcos) {
      throw new NotFoundException(`Mamcos with ID ${mamcosId} not found`);
    }
    const totalFarms = await this.prisma.farm.count({ where: { mamcosId } });
    const farmsOnMlax = await this.prisma.farm.count({
      where: {
        mamcosId,
        OR: [
          { isAvailableForRent: true },
          { isLeased: true },
          { landListings: { some: {} } },
        ],
      },
    });
    const secretary = await this.prisma.mamcosStaff.findFirst({
      where: { mamcosId, role: 'SECRETARY' },
    });
    return {
      totalFarms,
      farmsOnMlax,
      stabilityPercent:
        totalFarms > 0 ? Math.round((farmsOnMlax / totalFarms) * 100) : 0,
      secretaryStabilityBonus: secretary?.stabilityBonus ?? 0,
    };
  }

  /**
   * Data Hub Gap proxy: since no drone/satellite imagery pipeline exists in
   * this system, a field officer who visually observes cultivation on a farm
   * that isn't reflected as active on M-LAX can flag it — reusing the
   * existing (pre-built) disputes module rather than inventing a new one.
   */
  async flagUnreportedActivity(
    farmId: string,
    officerUserId: string,
    description: string,
  ) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }
    const officerUser = await this.prisma.user.findUnique({
      where: { id: officerUserId },
    });
    if (!officerUser) {
      throw new NotFoundException(`User with ID ${officerUserId} not found`);
    }
    return this.disputes.create(
      { farmId, type: DisputeType.UNREPORTED_MLAX_ACTIVITY, description },
      { id: officerUser.id, role: officerUser.role },
    );
  }

  /** Live preview of the market-linked suggested price for a farm (used by the create-listing form). */
  async getSuggestedPrice(farmId: string, askingPrice?: number) {
    return this.pricing.computeSuggestedPrice(farmId, askingPrice);
  }

  /** The stored (or live, for rice-linked) year-by-year rent schedule for a multi-year listing. */
  async getRentSchedule(listingId: string) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (!listing.isMultiYear || !listing.rentScheduleJson) {
      throw new BadRequestException('This listing is not a multi-year lease');
    }
    const schedule = listing.rentScheduleJson as unknown as RentSchedule;
    const totalYears = Math.ceil(listing.leaseDurationMonths / 12);
    const years = await Promise.all(
      Array.from({ length: totalYears }, (_, i) => i + 1).map(async (year) => ({
        year,
        amount: await this.pricing.computeInstallmentAmount(schedule, year),
        paid: year <= listing.lastInstallmentYear,
      })),
    );
    return {
      paymentPlan: listing.paymentPlan,
      model: schedule.model,
      lastInstallmentYear: listing.lastInstallmentYear,
      years,
    };
  }

  /**
   * Renter's Right to Improve: log spend on leveling/improving the land so it
   * gets deducted from the next annual installment (see payAnnualInstallment).
   * Only meaningful for multi-year ANNUAL leases — a PREPAID or single-season
   * lease has no future installment to apply the credit to.
   */
  async logLandImprovement(
    listingId: string,
    renterId: string,
    dto: { description: string; amountTzs: number },
  ) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException(
        `Land Listing with ID ${listingId} not found`,
      );
    }
    if (listing.renterId !== renterId) {
      throw new BadRequestException(
        'Only the current renter can log an improvement on this lease',
      );
    }
    if (listing.leaseStatus !== LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        'Improvements can only be logged on an active lease',
      );
    }
    return this.prisma.landListingImprovement.create({
      data: {
        listingId,
        renterId,
        description: dto.description,
        amountTzs: dto.amountTzs,
      },
    });
  }

  /** Admin-triggered regeneration of the digital lease agreement PDF (e.g. if it was never generated or terms were corrected). */
  async regenerateAgreement(listingId: string) {
    const url = await this.leaseDocument.generateAgreement(listingId);
    if (!url) {
      throw new BadRequestException(
        'Cannot generate an agreement for a listing with no renter',
      );
    }
    return { agreementPdfUrl: url };
  }

  /**
   * Flash Deal auto-drop (called by FlashDealSchedulerService): unrented
   * Flash Deal listings past their `autoDropDays` window get their price
   * stepped 20% of the way toward `autoDropPrice`, floored at that price.
   * Returns the number of listings repriced.
   */
  async applyDueFlashDealDrops(): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.landListing.findMany({
      where: {
        isFlashDeal: true,
        leaseStatus: LeaseStatus.DRAFT,
        autoDropPrice: { not: null },
        autoDropDays: { not: null },
      },
      include: {
        owner: { include: { user: { select: { phone: true } } } },
        farm: { select: { farmCode: true } },
      },
    });

    let dropped = 0;
    for (const listing of candidates) {
      const since = listing.lastPriceDropAt ?? listing.createdAt;
      const daysSince =
        (now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < (listing.autoDropDays as number)) continue;
      if (listing.askingPrice <= (listing.autoDropPrice as number)) continue;

      const gap = listing.askingPrice - (listing.autoDropPrice as number);
      const newPrice = Math.max(
        listing.autoDropPrice as number,
        Math.round(listing.askingPrice - gap * 0.2),
      );
      if (newPrice === listing.askingPrice) continue;

      await this.prisma.landListing.update({
        where: { id: listing.id },
        data: {
          askingPrice: newPrice,
          commissionAmount: newPrice * listing.commissionRate,
          lastPriceDropAt: now,
        },
      });
      dropped++;

      if (listing.owner.user?.phone) {
        await this.sms.send(
          listing.owner.user.phone,
          `MAYODE: Your Flash Deal listing for ${listing.farm.farmCode} had no renters yet, so we've dropped the price to ${newPrice.toLocaleString()} TZS to help it rent faster.`,
          'mlax_flash_deal_dropped',
        );
      }
    }
    return dropped;
  }

  // ==========================================
  // 🚜 B. TRACTOR SERVICES & COMMISSION
  // ==========================================

  async createTractorOwner(createTractorOwnerDto: CreateTractorOwnerDto) {
    return this.prisma.tractorOwner.create({
      data: createTractorOwnerDto,
    });
  }

  async createTractor(createTractorDto: CreateTractorDto) {
    const {
      ownerId,
      registrationNo,
      model,
      horsePower,
      isAvailable,
      location,
      pricePerHectare,
    } = createTractorDto;

    const owner = await this.prisma.tractorOwner.findUnique({
      where: { id: ownerId },
    });
    if (!owner) {
      throw new NotFoundException(`TractorOwner with ID ${ownerId} not found`);
    }

    return this.prisma.tractor.create({
      data: {
        ownerId,
        registrationNo,
        model,
        horsePower,
        isAvailable: isAvailable ?? true,
        location,
        pricePerHectare,
      },
      include: { owner: true },
    });
  }

  async findAllTractors(query?: { isAvailable?: boolean; location?: string }) {
    const whereClause: any = {};

    if (query?.isAvailable !== undefined) {
      whereClause.isAvailable = String(query.isAvailable) === 'true';
    }
    if (query?.location) {
      whereClause.location = { contains: query.location, mode: 'insensitive' };
    }

    return this.prisma.tractor.findMany({
      where: whereClause,
      include: { owner: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** "My tractors" — a tractor owner's fleet plus their bookings. */
  async findTractorsByOwner(ownerId: string) {
    return this.prisma.tractor.findMany({
      where: { ownerId },
      include: { owner: true, bookings: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Farmer cancels a booking before the tractor owner has confirmed it. */
  async cancelTractorBooking(bookingId: string) {
    const booking = await this.prisma.tractorBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException(
        `Tractor Booking with ID ${bookingId} not found`,
      );
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel a booking in status ${booking.status}. Expected PENDING.`,
      );
    }
    return this.prisma.tractorBooking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
    });
  }

  async bookTractor(createTractorBookingDto: CreateTractorBookingDto) {
    const {
      tractorId,
      farmerId,
      hectares,
      terrainGrade,
      commissionRate,
      scheduledDate,
    } = createTractorBookingDto;

    const tractor = await this.prisma.tractor.findUnique({
      where: { id: tractorId },
    });
    if (!tractor) {
      throw new NotFoundException(`Tractor with ID ${tractorId} not found`);
    }

    if (!tractor.isAvailable) {
      throw new BadRequestException(
        `Tractor ID ${tractorId} is currently unavailable for booking`,
      );
    }

    const farmer = await this.prisma.farmer.findUnique({
      where: { id: farmerId },
    });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }
    if (farmer.isBlacklisted) {
      throw new BadRequestException(
        'This farmer is blacklisted from M-LAX and cannot book tractor services',
      );
    }

    const basePricePerHectare = tractor.pricePerHectare || 50000;
    const basePrice = hectares * basePricePerHectare;

    // Terrain surcharge calculation based on farm grade/obstacles
    let surchargePercent = 0;
    if (terrainGrade === FarmGrade.B) {
      surchargePercent = 0.1; // 10% surcharge for minor obstacles/anthills
    } else if (terrainGrade === FarmGrade.C) {
      surchargePercent = 0.25; // 25% surcharge for severe terrain/heavy anthills
    }

    const terrainSurcharge = basePrice * surchargePercent;
    const totalPrice = basePrice + terrainSurcharge;
    const commissionAmount = totalPrice * commissionRate;

    const booking = await this.prisma.tractorBooking.create({
      data: {
        tractorId,
        farmerId,
        hectares,
        terrainGrade,
        basePrice,
        terrainSurcharge,
        totalPrice,
        commissionRate,
        commissionAmount,
        status: BookingStatus.PENDING,
        scheduledDate: new Date(scheduledDate),
        farmerConfirmed: false,
      },
      include: {
        tractor: { include: { owner: true } },
        farmer: true,
      },
    });

    return booking;
  }

  async confirmTractorBooking(bookingId: string) {
    const booking = await this.prisma.tractorBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException(
        `Tractor Booking with ID ${bookingId} not found`,
      );
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Cannot confirm booking in status ${booking.status}. Expected PENDING.`,
      );
    }

    const confirmed = await this.prisma.tractorBooking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED },
      include: {
        tractor: { include: { owner: true } },
        farmer: { include: { user: { select: { phone: true } } } },
      },
    });
    if (confirmed.farmer.user?.phone) {
      await this.sms.send(
        confirmed.farmer.user.phone,
        `MAYODE: Your tractor booking (${confirmed.tractor.model || confirmed.tractor.registrationNo}) for ${confirmed.scheduledDate.toLocaleDateString('en-GB')} is confirmed.`,
        'mlax_booking_confirmed',
      );
    }
    return confirmed;
  }

  async completeTractorBooking(bookingId: string) {
    const booking = await this.prisma.tractorBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException(
        `Tractor Booking with ID ${bookingId} not found`,
      );
    }

    if (
      booking.status !== BookingStatus.CONFIRMED &&
      booking.status !== BookingStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Cannot complete booking in status ${booking.status}. Expected CONFIRMED or IN_PROGRESS.`,
      );
    }

    const completed = await this.prisma.tractorBooking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.COMPLETED,
        farmerConfirmed: true,
        completedAt: new Date(),
      },
      include: {
        tractor: { include: { owner: true } },
        farmer: { include: { user: { select: { phone: true } } } },
      },
    });
    if (completed.tractor.owner.phone) {
      await this.sms.send(
        completed.tractor.owner.phone,
        `MAYODE: Tractor service for ${completed.farmer.firstName} ${completed.farmer.lastName} is complete. Your M-LAX commission has been deducted from the booking total.`,
        'mlax_booking_completed',
      );
    }
    if (completed.farmer.user?.phone) {
      await this.sms.send(
        completed.farmer.user.phone,
        'MAYODE: Your tractor service has been marked complete. Thank you for using M-LAX.',
        'mlax_booking_completed',
      );
    }
    return completed;
  }

  // ==========================================
  // 📊 C. MARKET PRICE INTELLIGENCE
  // ==========================================

  async createMarketPrice(createMarketPriceDto: CreateMarketPriceDto) {
    const { commodity, price, market, source, recordedAt } =
      createMarketPriceDto;

    return this.prisma.marketPrice.create({
      data: {
        commodity,
        price,
        market,
        source,
        recordedAt: new Date(recordedAt),
      },
    });
  }

  async findAllMarketPrices(query?: { commodity?: string; market?: string }) {
    const whereClause: any = {};

    if (query?.commodity) {
      whereClause.commodity = {
        contains: query.commodity,
        mode: 'insensitive',
      };
    }
    if (query?.market) {
      whereClause.market = { contains: query.market, mode: 'insensitive' };
    }

    return this.prisma.marketPrice.findMany({
      where: whereClause,
      orderBy: { recordedAt: 'desc' },
    });
  }
}
