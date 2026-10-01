import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/ownership.service';

/** Resource grants never authorize acting as another farmer. */
@Injectable()
export class MarketplaceActorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user: RequestUser = req.user;
    if (user.role === 'SUPER_ADMIN') return true;
    const action = context.getHandler().name;
    const staffOnly = ['releaseEscrow', 'issueInputCredit', 'flagUnreportedActivity', 'createTractorOwner', 'createTractor', 'confirmTractorBooking', 'createMarketPrice'];
    if (user.role === 'FARMER' && staffOnly.includes(action)) throw new ForbiddenException('This action requires an authorized staff account');
    const farmer = user.role === 'FARMER'
      ? await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;
    if (user.role === 'FARMER' && !farmer) throw new ForbiddenException('Farmer profile required');

    const actorFields = ['farmerId', 'ownerId', 'renterId', 'currentOwnerId'];
    for (const field of actorFields) {
      const id = req.body?.[field] ?? req.params?.[field];
      if (!id) continue;
      if (farmer && id !== farmer.id) throw new ForbiddenException('You may only act for your own farmer account');
      if (!farmer && user.mamcosId) {
        const target = await this.prisma.farmer.findUnique({ where: { id }, select: { mamcosId: true } });
        if (!target || target.mamcosId !== user.mamcosId) throw new ForbiddenException('Farmer is outside your cooperative');
      }
    }
    if (req.body?.farmId || req.params?.farmId) {
      const farm = await this.prisma.farm.findUnique({ where: { id: req.body?.farmId ?? req.params.farmId }, select: { farmerId: true, mamcosId: true } });
      if (!farm) throw new NotFoundException('Farm not found');
      if (action === 'createLandListing' && farm.farmerId !== req.body.ownerId) throw new ForbiddenException('Only the registered farm owner may list this land');
      if (!farmer && user.mamcosId && farm.mamcosId !== user.mamcosId) throw new ForbiddenException('Farm is outside your cooperative');
    }
    if (req.params?.id && !action.toLowerCase().includes('tractor')) {
      const listing = await this.prisma.landListing.findUnique({ where: { id: req.params.id }, include: { farm: { select: { mamcosId: true } } } });
      if (!listing) throw new NotFoundException('Listing not found');
      if (!farmer && user.mamcosId && listing.farm.mamcosId !== user.mamcosId) throw new ForbiddenException('Listing is outside your cooperative');
      const ownerOnly = ['updateLandListing', 'cancelLandListing', 'respondToOffer', 'approveSubLease', 'transferOwnership'];
      const renterOnly = ['payInstallment', 'logImprovement', 'requestSubLease'];
      if (farmer && ownerOnly.includes(action) && listing.ownerId !== farmer.id) throw new ForbiddenException('Only the owner can change this listing');
      if (farmer && renterOnly.includes(action) && listing.renterId !== farmer.id) throw new ForbiddenException('Only the active renter can perform this action');
      if (farmer && ['reconcileEscrow', 'regenerateAgreement'].includes(action) && ![listing.ownerId, listing.renterId].includes(farmer.id)) throw new ForbiddenException('You are not a party to this lease');
      if (req.params.offerId) {
        const offer = await this.prisma.landListingOffer.findUnique({ where: { id: req.params.offerId } });
        if (!offer || offer.listingId !== listing.id) throw new NotFoundException('Offer not found on this listing');
      }
    }
    if (req.params?.id && ['cancelTractorBooking', 'completeTractorBooking', 'confirmTractorBooking'].includes(action)) {
      const booking = await this.prisma.tractorBooking.findUnique({ where: { id: req.params.id }, include: { farmer: { select: { mamcosId: true } } } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (farmer && booking.farmerId !== farmer.id) throw new ForbiddenException('This booking belongs to another farmer');
      if (!farmer && user.mamcosId && booking.farmer.mamcosId !== user.mamcosId) throw new ForbiddenException('Booking is outside your cooperative');
    }
    return true;
  }
}
