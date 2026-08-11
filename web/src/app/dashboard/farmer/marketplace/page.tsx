'use client';
import { EmptyState, InsightPanel, money } from '@/components/role-dashboards/DashboardPrimitives';
import { marketplaceApi } from '@/lib/api';
import { LandListingForm, MakeOfferButton } from '../FarmerForms';
import { useFarmerData } from '../FarmerDataContext';

export default function FarmerMarketplacePage() {
  const { farmer, farms, landListings, tractors, run } = useFarmerData();

  return <div className="role-two-col">
    <InsightPanel title="Land listings" subtitle="Browse, list land, and make offers.">
      <div className="role-list">
        {landListings.slice(0, 8).map((listing) => <div className="role-list-item" key={listing.id}>
          <div><strong>{listing.title || listing.farm?.farmCode || 'Land listing'}</strong><p>{money(listing.askingPrice || listing.price)} · {listing.status || listing.leaseStatus}</p></div>
          <MakeOfferButton farmerId={farmer?.id} listingId={listing.id} onOffer={(amount) => run(() => marketplaceApi.submitOffer(listing.id, { farmerId: farmer.id, offerAmount: amount }), 'Offer submitted.')} />
        </div>)}
        {!landListings.length && <EmptyState>No land listings available.</EmptyState>}
      </div>
    </InsightPanel>
    <LandListingForm farms={farms} farmerId={farmer?.id} onSubmit={(payload) => run(() => marketplaceApi.createLandListing(payload), 'Land listing created.')} />
    <InsightPanel title="Tractors" subtitle="Browse and request tractor services.">
      <div className="role-list">
        {tractors.slice(0, 8).map((tractor) => <div className="role-list-item" key={tractor.id}>
          <div><strong>{tractor.name || tractor.model || 'Tractor'}</strong><p>{tractor.location || tractor.owner?.location || 'Location not set'}</p></div>
          <button className="btn-secondary" onClick={() => run(() => marketplaceApi.bookTractor({ tractorId: tractor.id, farmerId: farmer.id, bookingDate: new Date().toISOString() }), 'Tractor booking requested.')}>Book</button>
        </div>)}
        {!tractors.length && <EmptyState>No tractors available.</EmptyState>}
      </div>
    </InsightPanel>
  </div>;
}
