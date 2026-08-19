import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { CreateLandListingDto } from './dto/create-land-listing.dto';
import { EscrowDepositDto } from './dto/escrow-deposit.dto';
import { CreateTractorOwnerDto } from './dto/create-tractor-owner.dto';
import { CreateTractorDto } from './dto/create-tractor.dto';
import { CreateTractorBookingDto } from './dto/create-tractor-booking.dto';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { RequestSubLeaseDto, ApproveSubLeaseDto } from './dto/sub-lease.dto';
import { TransferOwnershipDto } from './dto/ownership-transfer.dto';
import { UpdateLandListingDto } from './dto/update-land-listing.dto';
import { PayInstallmentDto } from './dto/pay-installment.dto';
import { LogImprovementDto } from './dto/log-improvement.dto';
import {
  SubmitOfferDto,
  RespondToOfferDto,
  RespondToCounterDto,
} from './dto/offer.dto';
import { IssueInputCreditDto } from './dto/issue-input-credit.dto';
import { FlagUnreportedActivityDto } from './dto/flag-unreported-activity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, DealType, LeaseStatus } from '@prisma/client';

@ApiTags('marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ==========================================
  // 🌾 A. LAND LEASING & ESCROW WORKFLOWS
  // ==========================================

  @Post('land')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FARMER,
    UserRole.MAMCOS_SECRETARY,
  )
  @ApiOperation({
    summary: 'Create a new Land Lease Listing on M-LAX Marketplace',
  })
  createLandListing(@Body() createLandListingDto: CreateLandListingDto) {
    return this.marketplaceService.createLandListing(createLandListingDto);
  }

  @Get('land')
  @ApiOperation({ summary: 'List all available land lease listings' })
  @ApiQuery({ name: 'dealType', enum: DealType, required: false })
  @ApiQuery({ name: 'maxPrice', type: Number, required: false })
  @ApiQuery({ name: 'leaseStatus', enum: LeaseStatus, required: false })
  findAllLandListings(
    @Query('dealType') dealType?: DealType,
    @Query('maxPrice') maxPrice?: number,
    @Query('leaseStatus') leaseStatus?: LeaseStatus,
  ) {
    return this.marketplaceService.findAllLandListings({
      dealType,
      maxPrice,
      leaseStatus,
    });
  }

  @Get('land/:id')
  @ApiOperation({ summary: 'Get details of a specific Land Listing' })
  findOneLandListing(@Param('id') id: string) {
    return this.marketplaceService.findOneLandListing(id);
  }

  @Get('land/:id/protection')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
    UserRole.BUYER,
  )
  @ApiOperation({
    summary:
      '"Reward for Honesty" MAYODE protection status (internal guarantee, not third-party insurance)',
  })
  getProtectionStatus(@Param('id') id: string) {
    return this.marketplaceService.getProtectionStatus(id);
  }

  @Get('land/farm/:farmId/suggested-price')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
    UserRole.BUYER,
  )
  @ApiOperation({
    summary:
      'Preview the market-linked suggested price and market gauge for a farm',
  })
  @ApiQuery({ name: 'askingPrice', type: Number, required: false })
  getSuggestedPrice(
    @Param('farmId') farmId: string,
    @Query('askingPrice') askingPrice?: number,
  ) {
    return this.marketplaceService.getSuggestedPrice(
      farmId,
      askingPrice ? Number(askingPrice) : undefined,
    );
  }

  @Patch('land/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FARMER,
    UserRole.MAMCOS_SECRETARY,
  )
  @ApiOperation({
    summary: "Edit a DRAFT listing's terms (before any deposit)",
  })
  updateLandListing(
    @Param('id') id: string,
    @Body() dto: UpdateLandListingDto,
  ) {
    return this.marketplaceService.updateLandListing(id, dto);
  }

  @Patch('land/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FARMER,
    UserRole.MAMCOS_SECRETARY,
  )
  @ApiOperation({
    summary: 'Cancel a listing that has no active deposit or lease',
  })
  cancelLandListing(@Param('id') id: string) {
    return this.marketplaceService.cancelLandListing(id);
  }

  @Post('land/:id/escrow-deposit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary: 'Renter initiates lease by depositing funds into M-LAX Escrow',
  })
  depositEscrow(
    @Param('id') id: string,
    @Body() escrowDepositDto: EscrowDepositDto,
  ) {
    return this.marketplaceService.depositEscrow(id, escrowDepositDto);
  }

  @Post('land/:id/escrow-reconcile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Manually re-check a pending ClickPesa escrow deposit (fallback if the webhook is delayed)',
  })
  async reconcileEscrow(@Param('id') id: string) {
    const listing = await this.marketplaceService.findOneLandListing(id);
    const pending = listing.escrowPayments
      .filter((p: any) => p.orderReference)
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
    if (!pending) {
      return { status: 'NO_PENDING_ORDER' };
    }
    return this.marketplaceService.reconcileEscrowPayment(
      pending.orderReference as string,
    );
  }

  @Post('land/:id/escrow-release')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  @ApiOperation({
    summary: 'Release M-LAX Escrow funds and activate the Land Lease',
  })
  releaseEscrow(@Param('id') id: string) {
    return this.marketplaceService.releaseEscrow(id);
  }

  @Post('land/:id/installments/pay')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary:
      "Pay the next year's installment on a multi-year ANNUAL-plan lease",
  })
  payInstallment(@Param('id') id: string, @Body() dto: PayInstallmentDto) {
    return this.marketplaceService.payAnnualInstallment(id, dto.renterId, dto);
  }

  @Get('land/:id/rent-schedule')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
    UserRole.BUYER,
  )
  @ApiOperation({
    summary: 'Year-by-year rent schedule for a multi-year lease',
  })
  getRentSchedule(@Param('id') id: string) {
    return this.marketplaceService.getRentSchedule(id);
  }

  @Post('land/:id/improvements')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary:
      "Renter's Right to Improve: log land-improvement spend, credited against the next installment",
  })
  logImprovement(@Param('id') id: string, @Body() dto: LogImprovementDto) {
    return this.marketplaceService.logLandImprovement(id, dto.renterId, dto);
  }

  @Post('land/:id/agreement/regenerate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary: 'Regenerate the digital lease agreement PDF for an active listing',
  })
  regenerateAgreement(@Param('id') id: string) {
    return this.marketplaceService.regenerateAgreement(id);
  }

  // ==========================================
  // 🤝 A1b. BARGAINING — "MAKE AN OFFER"
  // ==========================================

  @Post('land/:id/offers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary: 'Make an offer below the asking price on a DRAFT listing',
  })
  submitOffer(@Param('id') id: string, @Body() dto: SubmitOfferDto) {
    return this.marketplaceService.submitOffer(
      id,
      dto.farmerId,
      dto.offerAmount,
    );
  }

  @Get('land/:id/offers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
    UserRole.FARMER,
    UserRole.BUYER,
  )
  @ApiOperation({ summary: 'List all offers made on a listing' })
  findOffers(@Param('id') id: string) {
    return this.marketplaceService.findOffersForListing(id);
  }

  @Patch('land/:id/offers/:offerId/respond')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary: 'Owner accepts, rejects, or counters a pending offer',
  })
  respondToOffer(
    @Param('id') id: string,
    @Param('offerId') offerId: string,
    @Body() dto: RespondToOfferDto,
  ) {
    return this.marketplaceService.respondToOffer(
      id,
      offerId,
      dto.ownerId,
      dto,
    );
  }

  @Patch('land/:id/offers/:offerId/counter-response')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary: "Farmer accepts or declines the owner's counter-offer",
  })
  respondToCounter(
    @Param('offerId') offerId: string,
    @Body() dto: RespondToCounterDto,
  ) {
    return this.marketplaceService.respondToCounterOffer(
      offerId,
      dto.farmerId,
      dto.accept,
    );
  }

  // ==========================================
  // 🔁 A2. SUB-LEASING & OWNERSHIP TRANSFER
  // ==========================================

  @Post('land/:id/sub-lease/request')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Current renter requests to sub-lease the remainder of an active season',
  })
  requestSubLease(@Param('id') id: string, @Body() dto: RequestSubLeaseDto) {
    return this.marketplaceService.requestSubLease(id, dto.renterId, dto);
  }

  @Patch('land/:id/sub-lease/:subLeaseId/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary: 'Owner approves or rejects a pending sub-lease request',
  })
  approveSubLease(
    @Param('id') id: string,
    @Param('subLeaseId') subLeaseId: string,
    @Body() dto: ApproveSubLeaseDto,
  ) {
    return this.marketplaceService.approveSubLease(
      id,
      subLeaseId,
      dto.ownerId,
      dto,
    );
  }

  @Post('land/:id/transfer-ownership')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary:
      'Owner transfers a listing to a new owner mid-lease; the lease terms carry over',
  })
  transferOwnership(
    @Param('id') id: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.marketplaceService.transferOwnership(
      id,
      dto.currentOwnerId,
      dto,
    );
  }

  // ==========================================
  // 🚜 B. TRACTOR SERVICES & COMMISSION
  // ==========================================

  @Post('tractors/owners')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Register a new Tractor Owner or Service Company' })
  createTractorOwner(@Body() createTractorOwnerDto: CreateTractorOwnerDto) {
    return this.marketplaceService.createTractorOwner(createTractorOwnerDto);
  }

  @Post('tractors')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary: 'Register a Tractor for tilling and service booking',
  })
  createTractor(@Body() createTractorDto: CreateTractorDto) {
    return this.marketplaceService.createTractor(createTractorDto);
  }

  @Get('tractors')
  @ApiOperation({
    summary: 'List all registered tractors on M-LAX Marketplace',
  })
  @ApiQuery({ name: 'isAvailable', type: Boolean, required: false })
  @ApiQuery({ name: 'location', type: String, required: false })
  findAllTractors(
    @Query('isAvailable') isAvailable?: boolean,
    @Query('location') location?: string,
  ) {
    return this.marketplaceService.findAllTractors({ isAvailable, location });
  }

  @Get('tractors/owners/:ownerId/tractors')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FARMER,
  )
  @ApiOperation({
    summary: '"My tractors" — a tractor owner\'s fleet plus their bookings',
  })
  findTractorsByOwner(@Param('ownerId') ownerId: string) {
    return this.marketplaceService.findTractorsByOwner(ownerId);
  }

  @Post('tractors/book')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FARMER,
    UserRole.FIELD_OFFICER,
  )
  @ApiOperation({
    summary:
      'Book a Tractor service with terrain surcharge and M-LAX commission calculation',
  })
  bookTractor(@Body() createTractorBookingDto: CreateTractorBookingDto) {
    return this.marketplaceService.bookTractor(createTractorBookingDto);
  }

  @Patch('tractors/bookings/:id/confirm')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary: 'Tractor owner or admin confirms a pending booking',
  })
  confirmTractorBooking(@Param('id') id: string) {
    return this.marketplaceService.confirmTractorBooking(id);
  }

  @Patch('tractors/bookings/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({
    summary: 'Farmer cancels a booking before the tractor owner confirms it',
  })
  cancelTractorBooking(@Param('id') id: string) {
    return this.marketplaceService.cancelTractorBooking(id);
  }

  @Patch('tractors/bookings/:id/complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.FARMER,
    UserRole.FIELD_OFFICER,
  )
  @ApiOperation({
    summary:
      'Farmer or Field Officer completes booking and confirms satisfactory tilling',
  })
  completeTractorBooking(@Param('id') id: string) {
    return this.marketplaceService.completeTractorBooking(id);
  }

  // ==========================================
  // 🌱 D. INPUT CREDIT & HARVEST BUY-BACK (M-LAX ACTIVITY ELIGIBILITY)
  // ==========================================

  @Get('farmers/:farmerId/input-credit-eligibility')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  @ApiOperation({
    summary:
      'Check whether a farmer qualifies for M-LAX input credit (active/completed lease as renter)',
  })
  checkInputCreditEligibility(@Param('farmerId') farmerId: string) {
    return this.marketplaceService.checkInputCreditEligibility(farmerId);
  }

  @Post('farmers/:farmerId/input-credit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({
    summary:
      'Issue M-LAX input credit (real LoanRecord) — gated on platform activity eligibility',
  })
  issueInputCredit(
    @Param('farmerId') farmerId: string,
    @Body() dto: IssueInputCreditDto,
  ) {
    return this.marketplaceService.issueInputCredit(farmerId, dto);
  }

  @Get('mamcos/:mamcosId/stability')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  @ApiOperation({
    summary:
      "MAMCOS stability metric: % of farms actually on M-LAX, and the secretary's stability bonus",
  })
  getMamcosStability(@Param('mamcosId') mamcosId: string) {
    return this.marketplaceService.getMamcosStability(mamcosId);
  }

  @Post('farms/:farmId/flag-unreported-activity')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({
    summary:
      'Field officer flags a farm they observed being cultivated but not reflected as active on M-LAX (Data Hub Gap proxy — routes into the disputes module)',
  })
  flagUnreportedActivity(
    @Param('farmId') farmId: string,
    @Body() dto: FlagUnreportedActivityDto,
  ) {
    return this.marketplaceService.flagUnreportedActivity(
      farmId,
      dto.officerUserId,
      dto.description,
    );
  }

  @Get('farmers/:farmerId/buy-back-eligibility')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MAMCOS_SECRETARY,
    UserRole.FIELD_OFFICER,
  )
  @ApiOperation({
    summary:
      'Check whether a farmer qualifies for the Harvest Buy-Back Guarantee eligibility signal',
  })
  checkBuyBackEligibility(@Param('farmerId') farmerId: string) {
    return this.marketplaceService.checkBuyBackEligibility(farmerId);
  }

  // ==========================================
  // 📊 C. MARKET PRICE INTELLIGENCE
  // ==========================================

  @Post('prices')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({
    summary:
      'Record new Market Price intelligence for agricultural commodities',
  })
  createMarketPrice(@Body() createMarketPriceDto: CreateMarketPriceDto) {
    return this.marketplaceService.createMarketPrice(createMarketPriceDto);
  }

  @Get('prices')
  @ApiOperation({
    summary: 'Get latest recorded market prices for commodities',
  })
  @ApiQuery({ name: 'commodity', type: String, required: false })
  @ApiQuery({ name: 'market', type: String, required: false })
  findAllMarketPrices(
    @Query('commodity') commodity?: string,
    @Query('market') market?: string,
  ) {
    return this.marketplaceService.findAllMarketPrices({ commodity, market });
  }
}
