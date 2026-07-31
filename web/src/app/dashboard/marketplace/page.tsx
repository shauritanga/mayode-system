'use client';
import { useEffect, useState } from 'react';
import { marketplaceApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface EscrowPayment {
  id: string;
  amount: number;
  status: string;
  payoutStatus?: string | null;
}

interface SubLease {
  id: string;
  status: string;
  originalRenterId: string;
  newAskingPrice?: number | null;
}

interface LandListing {
  id: string;
  ownerId: string;
  renterId?: string;
  askingPrice: number;
  suggestedPrice?: number;
  dealType: string;
  leaseStatus: string;
  leaseDurationMonths: number;
  commissionRate: number;
  commissionAmount?: number;
  isFlashDeal: boolean;
  isMultiYear?: boolean;
  paymentPlan?: string | null;
  mayodeProtected?: boolean;
  agreementPdfUrl?: string | null;
  farm?: { farmCode: string; socialHectares: number; grade: string };
  owner?: { firstName: string; lastName: string; controlNumber: string };
  renter?: { firstName: string; lastName: string };
  escrowPayments?: EscrowPayment[];
  subLeases?: SubLease[];
  createdAt: string;
}

interface Offer {
  id: string;
  farmerId: string;
  offerAmount: number;
  status: string;
  counterAmount?: number | null;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
}

interface TractorBooking {
  id: string;
  hectares: number;
  status: string;
  scheduledDate: string;
}

interface Tractor {
  id: string;
  registrationNo: string;
  model?: string;
  horsePower?: number;
  isAvailable: boolean;
  location?: string;
  pricePerHectare?: number;
  owner?: { id?: string; name: string; phone: string };
  ownerId?: string;
  bookings?: TractorBooking[];
}

interface MarketPrice {
  id: string;
  commodity: string;
  price: number;
  market?: string;
  source?: string;
  recordedAt: string;
}

const leaseStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'badge-gray',
    PENDING_VERIFICATION: 'badge-gold',
    ACTIVE: 'badge-green',
    COMPLETED: 'badge-blue',
    TERMINATED: 'badge-red',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status.replace('_', ' ')}</span>;
};

const emptyListingForm = {
  farmId: '', ownerId: '', askingPrice: '', dealType: 'STANDARD', commissionRate: '0.10',
  leaseDurationMonths: '6', isFlashDeal: false, autoDropPrice: '', autoDropDays: '',
};
const emptyTractorOwnerForm = { name: '', phone: '', location: '' };
const emptyTractorForm = { registrationNo: '', model: '', horsePower: '', pricePerHectare: '', location: '' };
const emptyPriceForm = { commodity: 'rice_sack_100kg', price: '', market: '', source: '', recordedAt: new Date().toISOString().slice(0, 10) };

export default function MarketplacePage() {
  const [listings, setListings] = useState<LandListing[]>([]);
  const [tractors, setTractors] = useState<Tractor[]>([]);
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [tractorOwners, setTractorOwners] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'land' | 'tractors' | 'prices' | 'tools'>('land');

  const [showListingForm, setShowListingForm] = useState(false);
  const [listingForm, setListingForm] = useState({ ...emptyListingForm });
  const [showTractorForm, setShowTractorForm] = useState(false);
  const [tractorOwnerForm, setTractorOwnerForm] = useState({ ...emptyTractorOwnerForm });
  const [tractorForm, setTractorForm] = useState({ ...emptyTractorForm });
  const [useExistingOwner, setUseExistingOwner] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceForm, setPriceForm] = useState({ ...emptyPriceForm });
  const [suggested, setSuggested] = useState<{ suggestedPrice: number; marketGauge: string } | null>(null);

  const [subLeaseTarget, setSubLeaseTarget] = useState<{ listing: LandListing; subLease: SubLease } | null>(null);
  const [subLeaseOwnerId, setSubLeaseOwnerId] = useState('');

  const [transferTarget, setTransferTarget] = useState<LandListing | null>(null);
  const [transferForm, setTransferForm] = useState({ currentOwnerId: '', newOwnerPhone: '', reason: '' });

  const [bookingsTarget, setBookingsTarget] = useState<Tractor | null>(null);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingBusyId, setBookingBusyId] = useState<string | null>(null);

  const [offersTarget, setOffersTarget] = useState<LandListing | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerOwnerId, setOfferOwnerId] = useState('');
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});

  const [scheduleTarget, setScheduleTarget] = useState<LandListing | null>(null);
  const [schedule, setSchedule] = useState<any | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [installmentRenterId, setInstallmentRenterId] = useState('');

  const [tools, setTools] = useState({ farmerId: '', mamcosId: '', creditAmount: '' });
  const [toolsResult, setToolsResult] = useState<{ eligibility?: any; buyBack?: any; stability?: any; error?: string } | null>(null);
  const [toolsBusy, setToolsBusy] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      marketplaceApi.getLandListings(),
      marketplaceApi.getTractors(),
      marketplaceApi.getMarketPrices(),
    ]).then(([l, t, p]) => {
      if (l.status === 'fulfilled') setListings(l.value.data || []);
      if (t.status === 'fulfilled') {
        const list = t.value.data || [];
        setTractors(list);
        const owners = Array.from(
          new Map(list.filter((x: any) => x.owner).map((x: any) => [x.owner.id ?? x.ownerId, x.owner])).entries(),
        ).map(([id, owner]: any) => ({ id, name: owner.name }));
        setTractorOwners(owners);
      }
      if (p.status === 'fulfilled') setPrices(p.value.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!showListingForm || !listingForm.farmId.trim()) { setSuggested(null); return; }
    const price = listingForm.askingPrice ? Number(listingForm.askingPrice) : undefined;
    let cancelled = false;
    marketplaceApi.getSuggestedPrice(listingForm.farmId.trim(), price)
      .then(res => { if (!cancelled) setSuggested(res.data); })
      .catch(() => { if (!cancelled) setSuggested(null); });
    return () => { cancelled = true; };
  }, [showListingForm, listingForm.farmId, listingForm.askingPrice]);

  const setL = (k: string, v: string | boolean) => setListingForm(f => ({ ...f, [k]: v }));
  const setTO = (k: string, v: string) => setTractorOwnerForm(f => ({ ...f, [k]: v }));
  const setT = (k: string, v: string) => setTractorForm(f => ({ ...f, [k]: v }));
  const setP = (k: string, v: string) => setPriceForm(f => ({ ...f, [k]: v }));

  const submitListing = async () => {
    setError('');
    if (!listingForm.farmId.trim() || !listingForm.ownerId.trim() || !listingForm.askingPrice) {
      setError('Farm ID, Owner ID, and asking price are required.');
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.createLandListing({
        farmId: listingForm.farmId.trim(),
        ownerId: listingForm.ownerId.trim(),
        askingPrice: Number(listingForm.askingPrice),
        dealType: listingForm.dealType,
        commissionRate: Number(listingForm.commissionRate),
        leaseDurationMonths: Number(listingForm.leaseDurationMonths),
        isFlashDeal: listingForm.isFlashDeal,
        autoDropPrice: listingForm.autoDropPrice ? Number(listingForm.autoDropPrice) : undefined,
        autoDropDays: listingForm.autoDropDays ? Number(listingForm.autoDropDays) : undefined,
      });
      setListingForm({ ...emptyListingForm });
      setShowListingForm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to create listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitTractor = async () => {
    setError('');
    if (!useExistingOwner && (!tractorOwnerForm.name.trim() || !tractorOwnerForm.phone.trim())) {
      setError('Owner name and phone are required.');
      return;
    }
    if (useExistingOwner && !tractorOwnerForm.name) {
      setError('Select an existing owner.');
      return;
    }
    if (!tractorForm.registrationNo.trim()) {
      setError('Registration number is required.');
      return;
    }
    setSubmitting(true);
    try {
      let ownerId = tractorOwnerForm.name; // reused as the selected owner id when useExistingOwner
      if (!useExistingOwner) {
        const res = await marketplaceApi.createTractorOwner({
          name: tractorOwnerForm.name.trim(),
          phone: tractorOwnerForm.phone.trim(),
          location: tractorOwnerForm.location.trim() || undefined,
        });
        ownerId = res.data.id;
      }
      await marketplaceApi.createTractor({
        ownerId,
        registrationNo: tractorForm.registrationNo.trim(),
        model: tractorForm.model.trim() || undefined,
        horsePower: tractorForm.horsePower ? Number(tractorForm.horsePower) : undefined,
        pricePerHectare: tractorForm.pricePerHectare ? Number(tractorForm.pricePerHectare) : undefined,
        location: tractorForm.location.trim() || undefined,
      });
      setTractorOwnerForm({ ...emptyTractorOwnerForm });
      setTractorForm({ ...emptyTractorForm });
      setShowTractorForm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to register tractor.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPrice = async () => {
    setError('');
    if (!priceForm.commodity.trim() || !priceForm.price) {
      setError('Commodity and price are required.');
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.createMarketPrice({
        commodity: priceForm.commodity.trim(),
        price: Number(priceForm.price),
        market: priceForm.market.trim() || undefined,
        source: priceForm.source.trim() || undefined,
        recordedAt: new Date(priceForm.recordedAt).toISOString(),
      });
      setPriceForm({ ...emptyPriceForm });
      setShowPriceForm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to record price.');
    } finally {
      setSubmitting(false);
    }
  };

  const releaseEscrow = async (id: string) => {
    setBusyId(id);
    try {
      await marketplaceApi.releaseEscrow(id);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to release escrow.');
    } finally {
      setBusyId(null);
    }
  };

  const cancelListing = async (id: string) => {
    setBusyId(id);
    try {
      await marketplaceApi.cancelLandListing(id);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to cancel listing.');
    } finally {
      setBusyId(null);
    }
  };

  const decideSubLease = async (approve: boolean) => {
    if (!subLeaseTarget) return;
    setError('');
    if (!subLeaseOwnerId.trim()) {
      setError('Owner (Farmer) ID is required to confirm this decision.');
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.approveSubLease(subLeaseTarget.listing.id, subLeaseTarget.subLease.id, {
        ownerId: subLeaseOwnerId.trim(),
        approve,
      });
      setSubLeaseTarget(null);
      setSubLeaseOwnerId('');
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to record decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitTransfer = async () => {
    if (!transferTarget) return;
    setError('');
    if (!transferForm.currentOwnerId.trim() || !transferForm.newOwnerPhone.trim()) {
      setError('Current owner ID and new owner phone are required.');
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.transferOwnership(transferTarget.id, {
        currentOwnerId: transferForm.currentOwnerId.trim(),
        newOwnerPhone: transferForm.newOwnerPhone.trim(),
        reason: transferForm.reason.trim() || undefined,
      });
      setTransferTarget(null);
      setTransferForm({ currentOwnerId: '', newOwnerPhone: '', reason: '' });
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to transfer ownership.');
    } finally {
      setSubmitting(false);
    }
  };

  const openBookings = async (tractor: Tractor) => {
    setBookingsTarget(tractor);
    setBookingsLoading(true);
    try {
      const ownerId = tractor.owner?.id ?? tractor.ownerId;
      if (!ownerId) return;
      const res = await marketplaceApi.getMyTractors(ownerId);
      const match = (res.data || []).find((t: Tractor) => t.id === tractor.id);
      setBookingsTarget(match ?? tractor);
    } catch {
      /* keep the tractor without bookings */
    } finally {
      setBookingsLoading(false);
    }
  };

  const actOnBooking = async (bookingId: string, action: 'confirm' | 'complete' | 'cancel') => {
    setBookingBusyId(bookingId);
    try {
      if (action === 'confirm') await marketplaceApi.confirmTractorBooking(bookingId);
      else if (action === 'complete') await marketplaceApi.completeTractorBooking(bookingId);
      else await marketplaceApi.cancelTractorBooking(bookingId);
      if (bookingsTarget) await openBookings(bookingsTarget);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to update booking.');
    } finally {
      setBookingBusyId(null);
    }
  };

  const openOffers = async (listing: LandListing) => {
    setOffersTarget(listing);
    setOfferOwnerId(listing.ownerId || '');
    setOffersLoading(true);
    try {
      const res = await marketplaceApi.getOffers(listing.id);
      setOffers(res.data || []);
    } catch {
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  };

  const respondToOffer = async (offerId: string, action: 'accept' | 'reject' | 'counter') => {
    if (!offersTarget) return;
    setError('');
    if (!offerOwnerId.trim()) {
      setError('Owner (Farmer) ID is required to confirm this decision.');
      return;
    }
    const counterAmount = action === 'counter' ? Number(counterAmounts[offerId]) : undefined;
    if (action === 'counter' && !counterAmount) {
      setError('Enter a counter amount first.');
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.respondToOffer(offersTarget.id, offerId, { ownerId: offerOwnerId.trim(), action, counterAmount });
      await openOffers(offersTarget);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to record decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const openSchedule = async (listing: LandListing) => {
    setScheduleTarget(listing);
    setInstallmentRenterId(listing.renterId || '');
    setScheduleLoading(true);
    try {
      const res = await marketplaceApi.getRentSchedule(listing.id);
      setSchedule(res.data);
    } catch {
      setSchedule(null);
    } finally {
      setScheduleLoading(false);
    }
  };

  const payInstallment = async () => {
    if (!scheduleTarget) return;
    setError('');
    if (!installmentRenterId.trim()) {
      setError('Renter (Farmer) ID is required.');
      return;
    }
    setSubmitting(true);
    try {
      await marketplaceApi.payInstallment(scheduleTarget.id, { renterId: installmentRenterId.trim() });
      await openSchedule(scheduleTarget);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to pay installment.');
    } finally {
      setSubmitting(false);
    }
  };

  const runFarmerLookup = async () => {
    if (!tools.farmerId.trim()) return;
    setToolsBusy(true);
    setToolsResult(null);
    try {
      const [elig, buyBack] = await Promise.all([
        marketplaceApi.checkInputCreditEligibility(tools.farmerId.trim()),
        marketplaceApi.checkBuyBackEligibility(tools.farmerId.trim()),
      ]);
      setToolsResult({ eligibility: elig.data, buyBack: buyBack.data });
    } catch (e: any) {
      setToolsResult({ error: e?.response?.data?.message || 'Farmer not found.' });
    } finally {
      setToolsBusy(false);
    }
  };

  const issueCredit = async () => {
    if (!tools.farmerId.trim() || !tools.creditAmount) return;
    setToolsBusy(true);
    try {
      await marketplaceApi.issueInputCredit(tools.farmerId.trim(), { amountTzs: Number(tools.creditAmount) });
      setTools(f => ({ ...f, creditAmount: '' }));
      alert('Input credit issued.');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to issue input credit.');
    } finally {
      setToolsBusy(false);
    }
  };

  const runMamcosLookup = async () => {
    if (!tools.mamcosId.trim()) return;
    setToolsBusy(true);
    try {
      const res = await marketplaceApi.getMamcosStability(tools.mamcosId.trim());
      setToolsResult(r => ({ ...r, stability: res.data }));
    } catch (e: any) {
      setToolsResult(r => ({ ...r, error: e?.response?.data?.message || 'MAMCOS not found.' }));
    } finally {
      setToolsBusy(false);
    }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--neutral-500)',
    borderColor: active ? 'rgba(16, 185, 129, 0.3)' : 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    transition: 'all 0.2s ease',
  });

  const activeCount = listings.filter(l => l.leaseStatus === 'ACTIVE').length;
  const pendingCount = listings.filter(l => l.leaseStatus === 'PENDING_VERIFICATION').length;

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--purple-500), var(--purple-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>M-LAX Marketplace</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Land Leasing, Tractor Services & Market Intelligence</p>
        </div>
        {tab === 'land' && (
          <button className="btn-primary" onClick={() => setShowListingForm(true)}>+ New listing</button>
        )}
        {tab === 'tractors' && (
          <button className="btn-primary" onClick={() => setShowTractorForm(true)}>+ Register tractor</button>
        )}
        {tab === 'prices' && (
          <button className="btn-primary" onClick={() => setShowPriceForm(true)}>+ Add price</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active leases', value: activeCount, color: 'var(--accent)' },
          { label: 'Awaiting verification', value: pendingCount, color: 'var(--gold-400)' },
          { label: 'Registered tractors', value: tractors.length, color: 'var(--blue-500)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button style={tabStyle(tab === 'land')} onClick={() => setTab('land')}>🌾 Land Listings ({listings.length})</button>
        <button style={tabStyle(tab === 'tractors')} onClick={() => setTab('tractors')}>🚜 Tractors ({tractors.length})</button>
        <button style={tabStyle(tab === 'prices')} onClick={() => setTab('prices')}>📊 Market Prices ({prices.length})</button>
        <button style={tabStyle(tab === 'tools')} onClick={() => setTab('tools')}>🧰 Farmer Tools</button>
      </div>

      {showListingForm && (
        <Modal
          title="New land listing"
          subtitle="Farm and owner IDs come from the Farms admin page"
          onClose={() => { setShowListingForm(false); setError(''); }}
          width="640px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowListingForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submitListing} disabled={submitting}>{submitting ? 'Saving…' : 'Create listing'}</button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <TextField label="Farm ID *" value={listingForm.farmId} onChange={v => setL('farmId', v)} placeholder="farm-uuid" />
            <TextField label="Owner (Farmer) ID *" value={listingForm.ownerId} onChange={v => setL('ownerId', v)} placeholder="farmer-uuid" />
            <div>
              <TextField label="Asking price (TZS) *" value={listingForm.askingPrice} onChange={v => setL('askingPrice', v)} placeholder="2000000" />
              {suggested && (
                <div style={{ fontSize: '11px', marginTop: '4px', fontWeight: 700, color: suggested.marketGauge === 'above' ? 'var(--red-400)' : 'var(--accent)' }}>
                  Suggested: {suggested.suggestedPrice.toLocaleString()} TZS ({suggested.marketGauge})
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Deal type</label>
              <select className="input-field" value={listingForm.dealType} onChange={e => setL('dealType', e.target.value)}>
                <option value="STANDARD">Standard</option>
                <option value="FLASH_DEAL">Flash Deal</option>
                <option value="RELATIONSHIP">Relationship</option>
              </select>
            </div>
            <TextField label="Commission rate (0-1)" value={listingForm.commissionRate} onChange={v => setL('commissionRate', v)} placeholder="0.10" />
            <TextField label="Lease duration (months)" value={listingForm.leaseDurationMonths} onChange={v => setL('leaseDurationMonths', v)} placeholder="6" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '13px', color: 'var(--neutral-400)' }}>
            <input type="checkbox" checked={listingForm.isFlashDeal} onChange={e => setL('isFlashDeal', e.target.checked)} />
            Flash Deal (auto-drop price if unrented)
          </label>
          {listingForm.isFlashDeal && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', marginTop: '12px' }}>
              <TextField label="Auto-drop floor price" value={listingForm.autoDropPrice} onChange={v => setL('autoDropPrice', v)} placeholder="1500000" />
              <TextField label="Days before auto-drop" value={listingForm.autoDropDays} onChange={v => setL('autoDropDays', v)} placeholder="7" />
            </div>
          )}
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {showTractorForm && (
        <Modal
          title="Register tractor"
          onClose={() => { setShowTractorForm(false); setError(''); }}
          width="640px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowTractorForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submitTractor} disabled={submitting}>{submitting ? 'Saving…' : 'Register'}</button>
            </>
          }
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', color: 'var(--neutral-400)' }}>
            <input type="checkbox" checked={useExistingOwner} onChange={e => { setUseExistingOwner(e.target.checked); setTractorOwnerForm({ ...emptyTractorOwnerForm }); }} />
            Use an existing tractor owner
          </label>
          {useExistingOwner ? (
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Owner</label>
              <select className="input-field" value={tractorOwnerForm.name} onChange={e => setTO('name', e.target.value)}>
                <option value="">Select owner…</option>
                {tractorOwners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <TextField label="Owner name *" value={tractorOwnerForm.name} onChange={v => setTO('name', v)} placeholder="Tractor Co." />
              <TextField label="Owner phone *" value={tractorOwnerForm.phone} onChange={v => setTO('phone', v)} placeholder="0768680433" />
              <TextField label="Location" value={tractorOwnerForm.location} onChange={v => setTO('location', v)} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            <TextField label="Registration No. *" value={tractorForm.registrationNo} onChange={v => setT('registrationNo', v)} placeholder="T123ABC" />
            <TextField label="Model" value={tractorForm.model} onChange={v => setT('model', v)} />
            <TextField label="Horsepower" value={tractorForm.horsePower} onChange={v => setT('horsePower', v)} />
            <TextField label="Price per hectare (TZS)" value={tractorForm.pricePerHectare} onChange={v => setT('pricePerHectare', v)} placeholder="60000" />
          </div>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {showPriceForm && (
        <Modal
          title="Record market price"
          onClose={() => { setShowPriceForm(false); setError(''); }}
          width="560px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowPriceForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submitPrice} disabled={submitting}>{submitting ? 'Saving…' : 'Save price'}</button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            <TextField label="Commodity *" value={priceForm.commodity} onChange={v => setP('commodity', v)} placeholder="rice_sack_100kg" />
            <TextField label="Price (TZS) *" value={priceForm.price} onChange={v => setP('price', v)} placeholder="100000" />
            <TextField label="Market" value={priceForm.market} onChange={v => setP('market', v)} placeholder="Mafinga" />
            <TextField label="Source" value={priceForm.source} onChange={v => setP('source', v)} />
            <div>
              <label style={labelStyle}>Date recorded</label>
              <input type="date" className="input-field" value={priceForm.recordedAt} onChange={e => setP('recordedAt', e.target.value)} />
            </div>
          </div>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {subLeaseTarget && (
        <Modal
          title="Review sub-lease request"
          subtitle={`Farm ${subLeaseTarget.listing.farm?.farmCode ?? ''}`}
          onClose={() => { setSubLeaseTarget(null); setError(''); }}
          width="520px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => decideSubLease(false)} disabled={submitting}>Reject</button>
              <button className="btn-primary" onClick={() => decideSubLease(true)} disabled={submitting}>{submitting ? 'Saving…' : 'Approve'}</button>
            </>
          }
        >
          <p style={{ fontSize: '13px', color: 'var(--neutral-400)', marginBottom: '12px' }}>
            The current renter wants to hand off the rest of this season to a new renter.
            {subLeaseTarget.subLease.newAskingPrice ? ` Proposed price: ${Number(subLeaseTarget.subLease.newAskingPrice).toLocaleString()} TZS.` : ''}
          </p>
          <TextField label="Owner (Farmer) ID — confirms this decision on their behalf" value={subLeaseOwnerId} onChange={setSubLeaseOwnerId} placeholder="farmer-uuid" />
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {transferTarget && (
        <Modal
          title="Transfer ownership"
          subtitle={`Farm ${transferTarget.farm?.farmCode ?? ''}`}
          onClose={() => { setTransferTarget(null); setError(''); }}
          width="520px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setTransferTarget(null)} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submitTransfer} disabled={submitting}>{submitting ? 'Saving…' : 'Transfer'}</button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
            <TextField label="Current owner (Farmer) ID *" value={transferForm.currentOwnerId} onChange={v => setTransferForm(f => ({ ...f, currentOwnerId: v }))} placeholder="farmer-uuid" />
            <TextField label="New owner's phone *" value={transferForm.newOwnerPhone} onChange={v => setTransferForm(f => ({ ...f, newOwnerPhone: v }))} placeholder="0768680433" />
            <TextField label="Reason" value={transferForm.reason} onChange={v => setTransferForm(f => ({ ...f, reason: v }))} placeholder="Sold to a relative" />
          </div>
          <p style={{ fontSize: '11px', color: 'var(--neutral-500)', marginTop: '12px' }}>
            A fixed 10,000/- transfer fee is deducted from the new owner&apos;s next payout. The lease terms carry over unchanged.
          </p>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {bookingsTarget && (
        <Modal
          title="Tractor bookings"
          subtitle={`${bookingsTarget.model || 'Tractor'} · ${bookingsTarget.registrationNo}`}
          onClose={() => setBookingsTarget(null)}
          width="560px"
          footer={<button className="btn-secondary" onClick={() => setBookingsTarget(null)}>Close</button>}
        >
          {bookingsLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>Loading…</div>
          ) : (bookingsTarget.bookings || []).length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No bookings for this tractor yet.</div>
          ) : (
            (bookingsTarget.bookings || []).map(b => (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{b.hectares} ha</div>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{b.status} · {new Date(b.scheduledDate).toLocaleDateString('en-GB')}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {b.status === 'PENDING' && (
                    <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={bookingBusyId === b.id} onClick={() => actOnBooking(b.id, 'confirm')}>
                      Confirm
                    </button>
                  )}
                  {b.status === 'CONFIRMED' && (
                    <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={bookingBusyId === b.id} onClick={() => actOnBooking(b.id, 'complete')}>
                      Complete
                    </button>
                  )}
                  {b.status === 'PENDING' && (
                    <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={bookingBusyId === b.id} onClick={() => actOnBooking(b.id, 'cancel')}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </Modal>
      )}

      {offersTarget && (
        <Modal
          title="Offers"
          subtitle={`Farm ${offersTarget.farm?.farmCode ?? ''} — asking ${Number(offersTarget.askingPrice).toLocaleString()} TZS`}
          onClose={() => { setOffersTarget(null); setError(''); }}
          width="560px"
          footer={<button className="btn-secondary" onClick={() => setOffersTarget(null)}>Close</button>}
        >
          <TextField label="Owner (Farmer) ID — confirms decisions on their behalf" value={offerOwnerId} onChange={setOfferOwnerId} placeholder="farmer-uuid" />
          {offersLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>Loading…</div>
          ) : offers.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No offers yet.</div>
          ) : (
            offers.map(o => (
              <div key={o.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{Number(o.offerAmount).toLocaleString()} TZS</div>
                    <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>
                      {o.farmer ? `${o.farmer.firstName} ${o.farmer.lastName} (${o.farmer.controlNumber})` : o.farmerId} · {o.status}
                    </div>
                  </div>
                  {o.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={submitting} onClick={() => respondToOffer(o.id, 'accept')}>Accept</button>
                      <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={submitting} onClick={() => respondToOffer(o.id, 'reject')}>Reject</button>
                    </div>
                  )}
                </div>
                {o.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <TextField label="Counter amount" value={counterAmounts[o.id] ?? ''} onChange={v => setCounterAmounts(c => ({ ...c, [o.id]: v }))} placeholder="1900000" />
                    </div>
                    <button className="btn-secondary" style={{ fontSize: '11px', padding: '9px 10px' }} disabled={submitting} onClick={() => respondToOffer(o.id, 'counter')}>Counter</button>
                  </div>
                )}
              </div>
            ))
          )}
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {scheduleTarget && (
        <Modal
          title="Rent schedule"
          subtitle={`Farm ${scheduleTarget.farm?.farmCode ?? ''} · ${scheduleTarget.paymentPlan ?? ''} plan`}
          onClose={() => { setScheduleTarget(null); setError(''); }}
          width="520px"
          footer={<button className="btn-secondary" onClick={() => setScheduleTarget(null)}>Close</button>}
        >
          {scheduleLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>Loading…</div>
          ) : !schedule ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No schedule available.</div>
          ) : (
            <>
              {(schedule.years || []).map((y: any) => (
                <div key={y.year} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--neutral-400)' }}>Year {y.year}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {Number(y.amount).toLocaleString()} TZS {y.paid ? '✓' : ''}
                  </span>
                </div>
              ))}
              {schedule.paymentPlan === 'ANNUAL' && schedule.lastInstallmentYear < (schedule.years?.length ?? 0) && (
                <div style={{ marginTop: '16px' }}>
                  <TextField label="Renter (Farmer) ID" value={installmentRenterId} onChange={setInstallmentRenterId} placeholder="farmer-uuid" />
                  <button className="btn-primary" style={{ marginTop: '10px', width: '100%' }} disabled={submitting} onClick={payInstallment}>
                    {submitting ? 'Paying…' : 'Pay next installment'}
                  </button>
                </div>
              )}
            </>
          )}
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading marketplace data…</div>
      ) : (
        <>
          {/* Land Listings */}
          {tab === 'land' && (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {listings.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No land listings posted yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Farm</th>
                        <th>Owner</th>
                        <th>Asking Price</th>
                        <th>AI Price</th>
                        <th>Deal Type</th>
                        <th>Duration</th>
                        <th>Commission</th>
                        <th>Escrow</th>
                        <th>Status</th>
                        <th>Protected</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {listings.map(l => {
                        const latestEscrow = (l.escrowPayments || [])[l.escrowPayments!.length - 1];
                        return (
                          <tr key={l.id}>
                            <td>
                              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 600 }}>{l.farm?.farmCode}</div>
                              <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{l.farm?.socialHectares} ha · Grade {l.farm?.grade}</div>
                            </td>
                            <td>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{l.owner?.firstName} {l.owner?.lastName}</div>
                              <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{l.owner?.controlNumber}</div>
                            </td>
                            <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{Number(l.askingPrice).toLocaleString()} TZS</td>
                            <td style={{ color: 'var(--gold-400)', fontSize: '12px' }}>{l.suggestedPrice ? `${Number(l.suggestedPrice).toLocaleString()} TZS` : '—'}</td>
                            <td>
                              <span className={`badge ${l.isFlashDeal ? 'badge-red' : l.dealType === 'RELATIONSHIP' ? 'badge-blue' : 'badge-gold'}`}>
                                {l.isFlashDeal ? '⚡ Flash' : l.dealType}
                              </span>
                            </td>
                            <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{l.leaseDurationMonths} months</td>
                            <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{(l.commissionRate * 100).toFixed(0)}%</td>
                            <td style={{ fontSize: '11px', color: 'var(--neutral-400)' }}>
                              {latestEscrow ? `${latestEscrow.status}${latestEscrow.payoutStatus ? ` / payout ${latestEscrow.payoutStatus}` : ''}` : '—'}
                            </td>
                            <td>{leaseStatusBadge(l.leaseStatus)}</td>
                            <td>
                              {l.mayodeProtected ? <span className="badge badge-green">✓ Protected</span> : <span className="badge badge-gray">—</span>}
                            </td>
                            <td>
                              {l.leaseStatus === 'DRAFT' && (
                                <button
                                  className="btn-secondary"
                                  style={{ fontSize: '11px', padding: '5px 10px', marginBottom: '4px' }}
                                  onClick={() => openOffers(l)}
                                >
                                  View offers
                                </button>
                              )}
                              {l.leaseStatus === 'PENDING_VERIFICATION' && (
                                <button
                                  className="btn-secondary"
                                  style={{ fontSize: '11px', padding: '5px 10px' }}
                                  disabled={busyId === l.id}
                                  onClick={() => releaseEscrow(l.id)}
                                >
                                  {busyId === l.id ? 'Releasing…' : 'Release escrow'}
                                </button>
                              )}
                              {l.leaseStatus === 'DRAFT' && (
                                <button
                                  className="btn-secondary"
                                  style={{ fontSize: '11px', padding: '5px 10px' }}
                                  disabled={busyId === l.id}
                                  onClick={() => cancelListing(l.id)}
                                >
                                  {busyId === l.id ? 'Cancelling…' : 'Cancel'}
                                </button>
                              )}
                              {l.leaseStatus === 'ACTIVE' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                  {l.agreementPdfUrl && (
                                    <a href={l.agreementPdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent)' }}>
                                      View agreement
                                    </a>
                                  )}
                                  {l.isMultiYear && (
                                    <button
                                      className="btn-secondary"
                                      style={{ fontSize: '11px', padding: '5px 10px' }}
                                      onClick={() => openSchedule(l)}
                                    >
                                      Rent schedule
                                    </button>
                                  )}
                                  {(l.subLeases || []).length > 0 && (
                                    <button
                                      className="btn-secondary"
                                      style={{ fontSize: '11px', padding: '5px 10px' }}
                                      onClick={() => { setSubLeaseTarget({ listing: l, subLease: l.subLeases![0] }); setSubLeaseOwnerId(l.ownerId || ''); }}
                                    >
                                      Review sub-lease
                                    </button>
                                  )}
                                  <button
                                    className="btn-secondary"
                                    style={{ fontSize: '11px', padding: '5px 10px' }}
                                    onClick={() => { setTransferTarget(l); setTransferForm({ currentOwnerId: l.ownerId || '', newOwnerPhone: '', reason: '' }); }}
                                  >
                                    Transfer ownership
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tractors */}
          {tab === 'tractors' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {tractors.length === 0 ? (
                <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px', gridColumn: '1/-1' }}>
                  No tractors registered yet.
                </div>
              ) : tractors.map((t, idx) => (
                <div key={t.id} className="glass-card animate-fade-in" style={{ padding: '20px', animationDelay: `${idx * 0.05}s` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.model || 'Unknown Model'}</div>
                      <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent)', marginTop: '2px' }}>{t.registrationNo}</div>
                    </div>
                    <span className={`badge ${t.isAvailable ? 'badge-green' : 'badge-red'}`}>
                      {t.isAvailable ? '✓ Available' : '✕ Booked'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--neutral-400)' }}>
                    <div>⚡ {t.horsePower ?? '—'} HP</div>
                    <div>📍 {t.location || '—'}</div>
                    <div>👤 {t.owner?.name || '—'}</div>
                    <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {t.pricePerHectare ? `${Number(t.pricePerHectare).toLocaleString()} TZS/ha` : '—'}
                    </div>
                  </div>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '5px 10px', marginTop: '12px', width: '100%' }}
                    onClick={() => openBookings(t)}
                  >
                    Manage bookings
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Market Prices */}
          {tab === 'prices' && (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {prices.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No market prices recorded yet.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Commodity</th>
                      <th>Price (TZS/kg)</th>
                      <th>Market</th>
                      <th>Source</th>
                      <th>Date Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.commodity}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '15px' }}>
                          {Number(p.price).toLocaleString()}
                        </td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{p.market || '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{p.source || '—'}</td>
                        <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
                          {new Date(p.recordedAt).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Farmer Tools: input credit / buy-back eligibility + MAMCOS stability */}
          {tab === 'tools' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  Input Credit &amp; Harvest Buy-Back Eligibility
                </h3>
                <TextField label="Farmer ID" value={tools.farmerId} onChange={v => setTools(f => ({ ...f, farmerId: v }))} placeholder="farmer-uuid" />
                <button className="btn-secondary" style={{ marginTop: '10px' }} disabled={toolsBusy} onClick={runFarmerLookup}>
                  {toolsBusy ? 'Checking…' : 'Check eligibility'}
                </button>
                {toolsResult?.eligibility && (
                  <div style={{ marginTop: '14px', fontSize: '13px' }}>
                    <p><strong>Input credit:</strong> {toolsResult.eligibility.eligible ? '✓ Eligible' : '✕ Not eligible'} — {toolsResult.eligibility.reason}</p>
                    {toolsResult.buyBack && <p style={{ marginTop: '6px' }}><strong>Buy-back:</strong> {toolsResult.buyBack.eligible ? '✓ Eligible' : '✕ Not eligible'} — {toolsResult.buyBack.reason}</p>}
                  </div>
                )}
                {toolsResult?.eligibility?.eligible && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <TextField label="Input credit amount (TZS)" value={tools.creditAmount} onChange={v => setTools(f => ({ ...f, creditAmount: v }))} placeholder="300000" />
                    <button className="btn-primary" style={{ marginTop: '10px' }} disabled={toolsBusy} onClick={issueCredit}>Issue input credit</button>
                  </div>
                )}
                {toolsResult?.error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{toolsResult.error}</div>}
                <p style={{ fontSize: '11px', color: 'var(--neutral-500)', marginTop: '14px' }}>
                  Buy-back is an eligibility signal for Processing staff — MAYODE has no automated milling/purchase pipeline yet, so an eligible farmer&apos;s off-take must still be arranged manually.
                </p>
              </div>

              <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
                  MAMCOS Stability
                </h3>
                <TextField label="MAMCOS ID" value={tools.mamcosId} onChange={v => setTools(f => ({ ...f, mamcosId: v }))} placeholder="mamcos-uuid" />
                <button className="btn-secondary" style={{ marginTop: '10px' }} disabled={toolsBusy} onClick={runMamcosLookup}>
                  {toolsBusy ? 'Checking…' : 'Check stability'}
                </button>
                {toolsResult?.stability && (
                  <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    <div className="stat-card" style={{ padding: '12px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{toolsResult.stability.stabilityPercent}%</div>
                      <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>Farms on M-LAX</div>
                    </div>
                    <div className="stat-card" style={{ padding: '12px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gold-400)' }}>{toolsResult.stability.secretaryStabilityBonus.toLocaleString()}</div>
                      <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>Secretary bonus (TZS)</div>
                    </div>
                    <div className="stat-card" style={{ padding: '12px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{toolsResult.stability.farmsOnMlax}</div>
                      <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>Farms on M-LAX (count)</div>
                    </div>
                    <div className="stat-card" style={{ padding: '12px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{toolsResult.stability.totalFarms}</div>
                      <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>Total farms</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="input-field" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
