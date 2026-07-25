import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLandListingDto } from './dto/create-land-listing.dto';
import { EscrowDepositDto } from './dto/escrow-deposit.dto';
import { CreateTractorOwnerDto } from './dto/create-tractor-owner.dto';
import { CreateTractorDto } from './dto/create-tractor.dto';
import { CreateTractorBookingDto } from './dto/create-tractor-booking.dto';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { DealType, LeaseStatus, PaymentStatus, BookingStatus, FarmGrade } from '@prisma/client';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

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
      commissionRate,
      leaseDurationMonths,
      isFlashDeal,
      preferredRenterCode,
      isMultiYear,
      pricingModel,
      autoDropPrice,
      autoDropDays,
    } = createLandListingDto;

    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      throw new NotFoundException(`Farm with ID ${farmId} not found`);
    }

    if (farm.farmerId !== ownerId) {
      throw new BadRequestException(`Farmer ID ${ownerId} is not the owner of Farm ID ${farmId}`);
    }

    if (!farm.isVerified) {
      throw new BadRequestException(`Farm ID ${farmId} must be verified by a Field Officer before it can be listed on M-LAX`);
    }

    if (farm.isLeased) {
      throw new ConflictException(`Farm ID ${farmId} is currently actively leased and cannot be listed`);
    }

    const commissionAmount = askingPrice * commissionRate;

    const listing = await this.prisma.landListing.create({
      data: {
        farmId,
        ownerId,
        askingPrice,
        suggestedPrice,
        dealType,
        commissionRate,
        commissionAmount,
        leaseStatus: LeaseStatus.DRAFT,
        leaseDurationMonths,
        isFlashDeal: isFlashDeal ?? false,
        preferredRenterCode,
        isMultiYear: isMultiYear ?? (leaseDurationMonths > 12),
        pricingModel,
        autoDropPrice,
        autoDropDays,
      },
      include: {
        farm: true,
        owner: true,
      },
    });

    // Mark farm as available for rent
    await this.prisma.farm.update({
      where: { id: farmId },
      data: { isAvailableForRent: true },
    });

    return listing;
  }

  async findAllLandListings(query?: { dealType?: DealType; maxPrice?: number; leaseStatus?: LeaseStatus }) {
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
      },
    });

    if (!listing) {
      throw new NotFoundException(`Land Listing with ID ${id} not found`);
    }

    return listing;
  }

  async depositEscrow(listingId: string, escrowDepositDto: EscrowDepositDto) {
    const { renterId, amount, mpesaRef } = escrowDepositDto;

    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: { farm: true },
    });

    if (!listing) {
      throw new NotFoundException(`Land Listing with ID ${listingId} not found`);
    }

    if (listing.ownerId === renterId) {
      throw new BadRequestException('A land owner cannot rent their own farm');
    }

    if (listing.leaseStatus === LeaseStatus.ACTIVE) {
      throw new ConflictException('This land listing is already actively leased');
    }

    // Create escrow payment record
    const escrowPayment = await this.prisma.escrowPayment.create({
      data: {
        listingId,
        amount,
        status: PaymentStatus.IN_ESCROW,
        mpesaRef,
        depositedAt: new Date(),
      },
    });

    // Update listing status to PENDING_VERIFICATION and assign renter
    const updatedListing = await this.prisma.landListing.update({
      where: { id: listingId },
      data: {
        renterId,
        finalPrice: amount,
        leaseStatus: LeaseStatus.PENDING_VERIFICATION,
      },
      include: {
        farm: true,
        owner: true,
        renter: true,
        escrowPayments: true,
      },
    });

    return { updatedListing, escrowPayment };
  }

  async releaseEscrow(listingId: string) {
    const listing = await this.prisma.landListing.findUnique({
      where: { id: listingId },
      include: { escrowPayments: true, farm: true },
    });

    if (!listing) {
      throw new NotFoundException(`Land Listing with ID ${listingId} not found`);
    }

    if (listing.leaseStatus !== LeaseStatus.PENDING_VERIFICATION) {
      throw new BadRequestException(`Cannot release escrow for listing in status ${listing.leaseStatus}. Expected PENDING_VERIFICATION.`);
    }

    const pendingEscrow = listing.escrowPayments.find(p => p.status === PaymentStatus.IN_ESCROW);
    if (!pendingEscrow) {
      throw new BadRequestException('No active IN_ESCROW payment found for this listing');
    }

    const now = new Date();
    const leaseEndDate = new Date(now);
    leaseEndDate.setMonth(leaseEndDate.getMonth() + listing.leaseDurationMonths);

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

    return updatedListing;
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
    const { ownerId, registrationNo, model, horsePower, isAvailable, location, pricePerHectare } = createTractorDto;

    const owner = await this.prisma.tractorOwner.findUnique({ where: { id: ownerId } });
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

  async bookTractor(createTractorBookingDto: CreateTractorBookingDto) {
    const { tractorId, farmerId, hectares, terrainGrade, commissionRate, scheduledDate } = createTractorBookingDto;

    const tractor = await this.prisma.tractor.findUnique({ where: { id: tractorId } });
    if (!tractor) {
      throw new NotFoundException(`Tractor with ID ${tractorId} not found`);
    }

    if (!tractor.isAvailable) {
      throw new BadRequestException(`Tractor ID ${tractorId} is currently unavailable for booking`);
    }

    const farmer = await this.prisma.farmer.findUnique({ where: { id: farmerId } });
    if (!farmer) {
      throw new NotFoundException(`Farmer with ID ${farmerId} not found`);
    }

    const basePricePerHectare = tractor.pricePerHectare || 50000;
    const basePrice = hectares * basePricePerHectare;

    // Terrain surcharge calculation based on farm grade/obstacles
    let surchargePercent = 0;
    if (terrainGrade === FarmGrade.B) {
      surchargePercent = 0.10; // 10% surcharge for minor obstacles/anthills
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
    const booking = await this.prisma.tractorBooking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException(`Tractor Booking with ID ${bookingId} not found`);
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(`Cannot confirm booking in status ${booking.status}. Expected PENDING.`);
    }

    return this.prisma.tractorBooking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED },
      include: {
        tractor: { include: { owner: true } },
        farmer: true,
      },
    });
  }

  async completeTractorBooking(bookingId: string) {
    const booking = await this.prisma.tractorBooking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException(`Tractor Booking with ID ${bookingId} not found`);
    }

    if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot complete booking in status ${booking.status}. Expected CONFIRMED or IN_PROGRESS.`);
    }

    return this.prisma.tractorBooking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.COMPLETED,
        farmerConfirmed: true,
        completedAt: new Date(),
      },
      include: {
        tractor: { include: { owner: true } },
        farmer: true,
      },
    });
  }

  // ==========================================
  // 📊 C. MARKET PRICE INTELLIGENCE
  // ==========================================

  async createMarketPrice(createMarketPriceDto: CreateMarketPriceDto) {
    const { commodity, price, market, source, recordedAt } = createMarketPriceDto;

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
      whereClause.commodity = { contains: query.commodity, mode: 'insensitive' };
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
