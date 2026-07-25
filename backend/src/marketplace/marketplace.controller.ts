import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { CreateLandListingDto } from './dto/create-land-listing.dto';
import { EscrowDepositDto } from './dto/escrow-deposit.dto';
import { CreateTractorOwnerDto } from './dto/create-tractor-owner.dto';
import { CreateTractorDto } from './dto/create-tractor.dto';
import { CreateTractorBookingDto } from './dto/create-tractor-booking.dto';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
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
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Create a new Land Lease Listing on M-LAX Marketplace' })
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
    return this.marketplaceService.findAllLandListings({ dealType, maxPrice, leaseStatus });
  }

  @Get('land/:id')
  @ApiOperation({ summary: 'Get details of a specific Land Listing' })
  findOneLandListing(@Param('id') id: string) {
    return this.marketplaceService.findOneLandListing(id);
  }

  @Post('land/:id/escrow-deposit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER)
  @ApiOperation({ summary: 'Renter initiates lease by depositing funds into M-LAX Escrow' })
  depositEscrow(@Param('id') id: string, @Body() escrowDepositDto: EscrowDepositDto) {
    return this.marketplaceService.depositEscrow(id, escrowDepositDto);
  }

  @Post('land/:id/escrow-release')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Release M-LAX Escrow funds and activate the Land Lease' })
  releaseEscrow(@Param('id') id: string) {
    return this.marketplaceService.releaseEscrow(id);
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
  @ApiOperation({ summary: 'Register a Tractor for tilling and service booking' })
  createTractor(@Body() createTractorDto: CreateTractorDto) {
    return this.marketplaceService.createTractor(createTractorDto);
  }

  @Get('tractors')
  @ApiOperation({ summary: 'List all registered tractors on M-LAX Marketplace' })
  @ApiQuery({ name: 'isAvailable', type: Boolean, required: false })
  @ApiQuery({ name: 'location', type: String, required: false })
  findAllTractors(
    @Query('isAvailable') isAvailable?: boolean,
    @Query('location') location?: string,
  ) {
    return this.marketplaceService.findAllTractors({ isAvailable, location });
  }

  @Post('tractors/book')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Book a Tractor service with terrain surcharge and M-LAX commission calculation' })
  bookTractor(@Body() createTractorBookingDto: CreateTractorBookingDto) {
    return this.marketplaceService.bookTractor(createTractorBookingDto);
  }

  @Patch('tractors/bookings/:id/confirm')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAMCOS_SECRETARY)
  @ApiOperation({ summary: 'Tractor owner or admin confirms a pending booking' })
  confirmTractorBooking(@Param('id') id: string) {
    return this.marketplaceService.confirmTractorBooking(id);
  }

  @Patch('tractors/bookings/:id/complete')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FARMER, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Farmer or Field Officer completes booking and confirms satisfactory tilling' })
  completeTractorBooking(@Param('id') id: string) {
    return this.marketplaceService.completeTractorBooking(id);
  }

  // ==========================================
  // 📊 C. MARKET PRICE INTELLIGENCE
  // ==========================================

  @Post('prices')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FIELD_OFFICER)
  @ApiOperation({ summary: 'Record new Market Price intelligence for agricultural commodities' })
  createMarketPrice(@Body() createMarketPriceDto: CreateMarketPriceDto) {
    return this.marketplaceService.createMarketPrice(createMarketPriceDto);
  }

  @Get('prices')
  @ApiOperation({ summary: 'Get latest recorded market prices for commodities' })
  @ApiQuery({ name: 'commodity', type: String, required: false })
  @ApiQuery({ name: 'market', type: String, required: false })
  findAllMarketPrices(
    @Query('commodity') commodity?: string,
    @Query('market') market?: string,
  ) {
    return this.marketplaceService.findAllMarketPrices({ commodity, market });
  }
}
