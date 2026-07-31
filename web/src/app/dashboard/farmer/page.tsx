'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  InsightPanel,
  MetricTile,
  RoleHero,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';
import {
  activitiesApi,
  cropCyclesApi,
  farmAlertsApi,
  farmersApi,
  farmsApi,
  financeApi,
  governanceApi,
  marketplaceApi,
  membershipsApi,
  notificationsApi,
  registryApi,
  rewardsApi,
  riceProtocolsApi,
} from '@/lib/api';

const tabs = [
  'Overview',
  'Farms',
  'Crop Cycles',
  'Rice Tasks',
  'Finance',
  'Membership',
  'Votes',
  'Alerts',
  'Marketplace',
  'Consent',
] as const;

type Tab = (typeof tabs)[number];

const today = () => new Date().toISOString().slice(0, 10);
const toIso = (date?: string) => (date ? new Date(date).toISOString() : undefined);
const splitUrls = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

export default function FarmerDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [farmer, setFarmer] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [farms, setFarms] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [membership, setMembership] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [registryRecords, setRegistryRecords] = useState<any[]>([]);
  const [landListings, setLandListings] = useState<any[]>([]);
  const [tractors, setTractors] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadFarmer = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const farmerResult = await farmersApi.getMe();
      const currentFarmer = farmerResult.data;
      setFarmer(currentFarmer);
      const farmList = currentFarmer.farms || (await farmsApi.getByFarmerId(currentFarmer.id)).data || [];
      setFarms(farmList);
      const cycleResults = await Promise.allSettled(farmList.map((farm: any) => cropCyclesApi.getByFarmId(farm.id)));
      const nextCycles = cycleResults.flatMap((result) => result.status === 'fulfilled' ? result.value.data || [] : []);
      setCycles(nextCycles);
      setSelectedFarmId((current) => current || farmList[0]?.id || '');
      setSelectedCycleId((current) => current || nextCycles[0]?.id || '');

      const [
        profileResult,
        activityResult,
        alertResult,
        notificationResult,
        membershipResult,
        plansResult,
        votesResult,
        rewardsResult,
        registryResult,
        listingsResult,
        tractorsResult,
        consentResult,
      ] = await Promise.allSettled([
        farmersApi.financialProfile(currentFarmer.id),
        activitiesApi.recentForFarmer(currentFarmer.id, 12),
        farmAlertsApi.getAll(),
        notificationsApi.list(false),
        membershipsApi.me(),
        membershipsApi.listPlans(),
        governanceApi.votes(),
        rewardsApi.mine(),
        registryApi.mine(),
        marketplaceApi.getLandListings(),
        marketplaceApi.getTractors(),
        farmersApi.listConsents(currentFarmer.id),
      ]);

      if (profileResult.status === 'fulfilled') setProfile(profileResult.value.data);
      if (activityResult.status === 'fulfilled') setActivities(activityResult.value.data || []);
      if (alertResult.status === 'fulfilled') setAlerts(alertResult.value.data || []);
      if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value.data || []);
      if (membershipResult.status === 'fulfilled') setMembership(membershipResult.value.data);
      if (plansResult.status === 'fulfilled') setPlans(plansResult.value.data || []);
      if (votesResult.status === 'fulfilled') setVotes(votesResult.value.data || []);
      if (rewardsResult.status === 'fulfilled') setRewards(rewardsResult.value.data || []);
      if (registryResult.status === 'fulfilled') setRegistryRecords(registryResult.value.data || []);
      if (listingsResult.status === 'fulfilled') setLandListings(listingsResult.value.data || []);
      if (tractorsResult.status === 'fulfilled') setTractors(tractorsResult.value.data || []);
      if (consentResult.status === 'fulfilled') setConsents(consentResult.value.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No farmer profile is linked to this login yet. Ask MAYOData staff to link/register your farmer profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async (cycleId: string) => {
    if (!cycleId) {
      setTasks([]);
      return;
    }
    try {
      const result = await riceProtocolsApi.tasks(cycleId);
      setTasks(result.data || []);
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => { void loadFarmer(); }, [loadFarmer]);
  useEffect(() => { void loadTasks(selectedCycleId); }, [selectedCycleId, loadTasks]);

  const farmsById = useMemo(() => new Map(farms.map((farm) => [farm.id, farm])), [farms]);
  const cycleOptions = cycles.map((cycle) => ({
    ...cycle,
    label: `${cycle.season} · ${farmsById.get(cycle.farmId)?.farmCode || cycle.farm?.farmCode || 'Farm'}`,
  }));

  const run = async (action: () => Promise<unknown>, success: string) => {
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(success);
      await loadFarmer();
      if (selectedCycleId) await loadTasks(selectedCycleId);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Action failed. Check the fields and try again.');
    }
  };

  if (error && !farmer) {
    return <div className="role-dashboard">
      <RoleHero eyebrow="Farmer workspace" title="Your farm business" subtitle="Personal records, payments, crop performance and consent status." />
      <EmptyState>{error}</EmptyState>
    </div>;
  }

  const finance = profile?.finance;
  const production = profile?.production;
  const payments = profile?.recentPayments || [];
  const openVotes = votes.filter((vote) => vote.status === 'OPEN');

  return <div className="role-dashboard">
    <RoleHero
      eyebrow="Farmer workspace"
      title={farmer ? `${farmer.firstName} ${farmer.lastName}` : 'Your farm business'}
      subtitle="A complete farmer web portal for records, crop cycles, finance, membership, votes, alerts, marketplace actions and consent. Mobile remains best for GPS, camera and offline field capture."
    />

    {message && <div className="alert-box alert-success">{message}</div>}
    {error && <div className="alert-box alert-danger">{error}</div>}

    <div className="role-grid">
      <MetricTile label="Registered farms" value={farms.length || (loading ? '—' : 0)} hint="Linked to your profile" />
      <MetricTile label="Crop cycles" value={cycles.length || 0} hint="Seasonal production records" tone="blue" />
      <MetricTile label="Total yield" value={`${Math.round(production?.totalYieldKg || 0).toLocaleString()} kg`} hint={`${production?.harvestedCycles || 0} harvested cycles`} tone="gold" />
      <MetricTile label="Net farm income" value={money(finance?.netProfit)} hint="Revenue less costs" tone={finance?.netProfit >= 0 ? 'green' : 'red'} />
      <MetricTile label="Credit score" value={profile?.credit?.creditScore ?? '—'} hint={profile?.credit?.creditReady ? 'Credit ready' : 'Building track record'} tone="purple" />
      <MetricTile label="Open alerts" value={alerts.filter((alert) => alert.status !== 'COMPLETED').length} hint="Recommendations and reminders" tone="red" />
    </div>

    <nav className="farmer-tabbar" aria-label="Farmer dashboard sections">
      {tabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
    </nav>

    {activeTab === 'Overview' && <div className="role-two-col">
      <InsightPanel title="Recent activity" subtitle="Latest farm records and notifications.">
        <div className="role-list">
          {activities.slice(0, 6).map((activity) => <div className="role-list-item" key={activity.id}>
            <div><strong>{activity.activityType}</strong><p>{activity.description || 'No description'} · {new Date(activity.activityDate).toLocaleDateString()}</p></div>
            <span>{activity.cropCycle?.season || ''}</span>
          </div>)}
          {!activities.length && <EmptyState>No recent farming activities.</EmptyState>}
        </div>
      </InsightPanel>
      <InsightPanel title="Recent payments and messages" subtitle="Payment position and in-app notifications.">
        <div className="role-list">
          {payments.slice(0, 4).map((payment: any) => <div className="role-list-item" key={payment.id}>
            <div><strong>{money(payment.netAmount ?? payment.amount)}</strong><p>{payment.description || 'Farmer payment'} · {payment.status}</p></div>
            <small>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : 'Pending'}</small>
          </div>)}
          {notifications.slice(0, 4).map((item) => <div className="role-list-item" key={item.id}>
            <div><strong>{item.title}</strong><p>{item.message || item.body}</p></div>
            <span className={`badge ${item.isRead ? 'badge-blue' : 'badge-gold'}`}>{item.isRead ? 'Read' : 'New'}</span>
          </div>)}
          {!payments.length && !notifications.length && <EmptyState>No payment or notification records yet.</EmptyState>}
        </div>
      </InsightPanel>
    </div>}

    {activeTab === 'Farms' && <div className="role-two-col">
      <InsightPanel title="My farms" subtitle="View farms and add browser-upload/manual evidence.">
        <div className="role-list">
          {farms.map((farm) => <div className="role-list-item" key={farm.id}>
            <div><strong>{farm.farmCode}</strong><p>{farm.name} · {farm.socialHectares} ha · {farm.village || 'Village missing'}</p></div>
            <span className={`badge ${farm.isVerified ? 'badge-green' : 'badge-gold'}`}>{farm.isVerified ? 'Verified' : 'Pending'}</span>
          </div>)}
          {!farms.length && <EmptyState>No farms registered yet.</EmptyState>}
        </div>
      </InsightPanel>
      <FarmForm farmer={farmer} onSubmit={(payload) => run(() => farmsApi.create(payload), 'Farm submitted for registration.')} />
      <FarmEvidenceForm farms={farms} onSubmit={(farmId, payload) => run(() => farmsApi.addPhoto(farmId, payload), 'Farm photo/evidence added.')} />
      <InsightPanel title="Claim pre-registered farms" subtitle="AMCOS-created records waiting for owner confirmation.">
        <div className="role-list">
          {registryRecords.map((record) => <div className="role-list-item" key={record.id}>
            <div><strong>{record.farmCode || record.name}</strong><p>{record.village || 'Location pending'} · {record.status}</p></div>
            <div style={{ display: 'flex', gap: 8 }}><button className="btn-secondary" onClick={() => run(() => registryApi.claim(record.id), 'Farm claim submitted.')}>Claim</button><button className="btn-secondary" onClick={() => run(() => registryApi.reject(record.id), 'Farm claim rejected.')}>Reject</button></div>
          </div>)}
          {!registryRecords.length && <EmptyState>No farm claims waiting.</EmptyState>}
        </div>
      </InsightPanel>
    </div>}

    {activeTab === 'Crop Cycles' && <div className="role-two-col">
      <InsightPanel title="Crop cycles" subtitle="Seasonal rice production records.">
        <div className="role-list">
          {cycleOptions.map((cycle) => <div className="role-list-item" key={cycle.id}>
            <div><strong>{cycle.season}</strong><p>{cycle.riceVariety || 'Variety missing'} · {cycle.label}</p></div>
            <span className="badge badge-blue">{cycle.status}</span>
          </div>)}
          {!cycles.length && <EmptyState>No crop cycles yet.</EmptyState>}
        </div>
      </InsightPanel>
      <CropCycleForm farms={farms} onSubmit={(payload) => run(() => cropCyclesApi.create(payload), 'Crop cycle created.')} />
      <ActivityForm cycles={cycleOptions} onSubmit={(payload) => run(() => cropCyclesApi.logActivity(payload), 'Activity logged.')} />
    </div>}

    {activeTab === 'Rice Tasks' && <div className="role-two-col">
      <InsightPanel title="Mbalari rice calendar tasks" subtitle="Complete practical web tasks with measurements and evidence URLs.">
        <label className="form-label">Crop cycle<select className="input-field" value={selectedCycleId} onChange={(event) => setSelectedCycleId(event.target.value)}>
          <option value="">Select crop cycle</option>
          {cycleOptions.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.label}</option>)}
        </select></label>
        <div className="role-list" style={{ marginTop: 14 }}>
          {tasks.map((task) => <div className="role-list-item" key={task.id}>
            <div><strong>{task.title}</strong><p>{task.guidance} · Due {new Date(task.dueDate).toLocaleDateString()}</p></div>
            <span className={`badge ${task.status === 'COMPLETED' ? 'badge-green' : 'badge-gold'}`}>{task.status}</span>
          </div>)}
          {!tasks.length && <EmptyState>No rice calendar tasks loaded for this cycle.</EmptyState>}
        </div>
      </InsightPanel>
      <TaskCompletionForm tasks={tasks.filter((task) => task.status !== 'COMPLETED')} onSubmit={(taskId, payload) => run(() => riceProtocolsApi.completeTask(taskId, payload), 'Rice calendar task completed.')} />
    </div>}

    {activeTab === 'Finance' && <div className="role-two-col">
      <InsightPanel title="Payments, loans and profit" subtitle="Farmer financial position from recorded production.">
        <div className="role-grid">
          <MetricTile label="Revenue" value={money(finance?.totalRevenue)} hint="Recorded crop revenue" />
          <MetricTile label="Costs" value={money(finance?.totalCosts)} hint="Input/labor/other costs" tone="gold" />
          <MetricTile label="Outstanding loans" value={money(finance?.totalLoanOutstanding)} hint={`${finance?.activeLoanCount || 0} active loans`} tone="red" />
        </div>
        <div className="role-list" style={{ marginTop: 14 }}>
          {payments.slice(0, 8).map((payment: any) => <div className="role-list-item" key={payment.id}><div><strong>{money(payment.netAmount ?? payment.amount)}</strong><p>Deduction {money(payment.loanDeduction)} · {payment.status}</p></div><small>{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : 'Pending'}</small></div>)}
        </div>
      </InsightPanel>
      <CostForm cycles={cycleOptions} onSubmit={(payload) => run(() => financeApi.addCost(payload), 'Expense recorded.')} />
      <RevenueForm cycles={cycleOptions} onSubmit={(payload) => run(() => financeApi.addRevenue(payload), 'Revenue recorded.')} />
    </div>}

    {activeTab === 'Membership' && <div className="role-two-col">
      <InsightPanel title="Membership status" subtitle="Premium access unlocks deeper recommendations and services.">
        <div className="role-list">
          <div className="role-list-item"><strong>Active</strong><span className={`badge ${membership?.active ? 'badge-green' : 'badge-gold'}`}>{membership?.active ? 'Yes' : 'No'}</span></div>
          <div className="role-list-item"><strong>Latest status</strong><span>{membership?.latest?.status || 'No membership yet'}</span></div>
          <div className="role-list-item"><strong>Payment status</strong><span>{membership?.latest?.paymentStatus || '—'}</span></div>
        </div>
      </InsightPanel>
      <MembershipForm plans={plans} onStart={(payload) => run(() => membershipsApi.start(payload), 'Membership payment started/submitted.')} onReconcile={() => run(() => membershipsApi.reconcile(), 'Membership payment status refreshed.')} />
    </div>}

    {activeTab === 'Votes' && <InsightPanel title="Member voting" subtitle="Open governance votes for cooperative decisions.">
      <div className="role-list">
        {openVotes.map((vote) => <div className="role-list-item" key={vote.id}>
          <div><strong>{vote.title}</strong><p>{vote.description || 'No description'}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{vote.options?.map((option: any) => <button key={option.id} className="btn-secondary" onClick={() => run(() => governanceApi.respond(vote.id, option.id), 'Vote recorded.')}>{option.label}</button>)}</div></div>
          <span className="badge badge-green">Open</span>
        </div>)}
        {!openVotes.length && <EmptyState>There are no open votes right now.</EmptyState>}
      </div>
    </InsightPanel>}

    {activeTab === 'Alerts' && <div className="role-two-col">
      <InsightPanel title="Alerts and recommendations" subtitle="Rule-based farm reminders and action prompts.">
        <div className="role-list">
          {alerts.map((alert) => <div className="role-list-item" key={alert.id}>
            <div><strong>{alert.title}</strong><p>{alert.message || alert.recommendation || 'Review this alert.'}</p></div>
            <button className="btn-secondary" onClick={() => run(() => farmAlertsApi.complete(alert.id), 'Alert marked complete.')}>Complete</button>
          </div>)}
          {!alerts.length && <EmptyState>No alerts right now.</EmptyState>}
        </div>
      </InsightPanel>
      <InsightPanel title="Rewards" subtitle="Farmer incentives and confirmed prizes.">
        <div className="role-list">
          {rewards.map((reward) => <div className="role-list-item" key={reward.id}>
            <div><strong>{reward.campaign?.name || reward.rewardName || 'Reward'}</strong><p>{reward.status || 'Announced'}</p></div>
            <button className="btn-secondary" onClick={() => run(() => rewardsApi.confirmReceipt(reward.id), 'Reward receipt confirmed.')}>Confirm receipt</button>
          </div>)}
          {!rewards.length && <EmptyState>No rewards announced for you yet.</EmptyState>}
        </div>
      </InsightPanel>
    </div>}

    {activeTab === 'Marketplace' && <div className="role-two-col">
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
    </div>}

    {activeTab === 'Consent' && <div className="role-two-col">
      <InsightPanel title="Consent records" subtitle="Formal data sharing and privacy records.">
        <div className="role-list">
          <div className="role-list-item"><strong>Financial provider sharing</strong><span className={`badge ${profile?.consent?.financialProviderSharing ? 'badge-green' : 'badge-gold'}`}>{profile?.consent?.financialProviderSharing ? 'Allowed' : 'Not shared'}</span></div>
          {consents.map((record) => <div className="role-list-item" key={record.id}><div><strong>{record.scope}</strong><p>{record.formVersion} · {record.language}</p></div><small>{new Date(record.capturedAt).toLocaleDateString()}</small></div>)}
        </div>
      </InsightPanel>
      <ConsentForm onSubmit={(payload) => run(() => farmersApi.captureConsent(farmer.id, payload), 'Consent record captured.')} />
    </div>}
  </div>;
}

function FarmForm({ farmer, onSubmit }: { farmer: any; onSubmit: (payload: any) => void }) {
  const [name, setName] = useState('');
  const [village, setVillage] = useState('');
  const [hectares, setHectares] = useState('');
  return <InsightPanel title="Register farm" subtitle="Browser equivalent for farm registration; GPS boundary still works best on mobile.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ farmerId: farmer.id, mamcosId: farmer.mamcosId, name, village, district: farmer.district || 'Mbarali', region: farmer.region || 'Mbeya', socialHectares: Number(hectares), ownershipType: 'OWNED' }); }}>
      <label className="form-label">Farm name<input className="input-field" required value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="form-label">Village<input className="input-field" value={village} onChange={(e) => setVillage(e.target.value)} /></label>
      <label className="form-label">Social hectares<input className="input-field" required type="number" min="0.1" step="0.1" value={hectares} onChange={(e) => setHectares(e.target.value)} /></label>
      <button className="btn-primary" type="submit">Submit farm</button>
    </form>
  </InsightPanel>;
}

function FarmEvidenceForm({ farms, onSubmit }: { farms: any[]; onSubmit: (farmId: string, payload: any) => void }) {
  const [farmId, setFarmId] = useState('');
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  return <InsightPanel title="Add farm photo/evidence" subtitle="Paste uploaded file/photo URL from browser storage or external upload.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(farmId, { url, caption }); }}>
      <SelectFarm farms={farms} value={farmId} onChange={setFarmId} />
      <label className="form-label">Photo/evidence URL<input className="input-field" required value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <label className="form-label">Caption<input className="input-field" value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!farmId}>Add evidence</button>
    </form>
  </InsightPanel>;
}

function CropCycleForm({ farms, onSubmit }: { farms: any[]; onSubmit: (payload: any) => void }) {
  const [farmId, setFarmId] = useState('');
  const [season, setSeason] = useState('');
  const [variety, setVariety] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [expectedHarvest, setExpectedHarvest] = useState('');
  return <InsightPanel title="Create crop cycle" subtitle="Start a seasonal production record.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ farmId, season, riceVariety: variety || undefined, plantingDate: toIso(plantingDate), expectedHarvest: toIso(expectedHarvest) }); }}>
      <SelectFarm farms={farms} value={farmId} onChange={setFarmId} />
      <label className="form-label">Season<input className="input-field" required placeholder="2026/2027 Masika" value={season} onChange={(e) => setSeason(e.target.value)} /></label>
      <label className="form-label">Rice variety<input className="input-field" value={variety} onChange={(e) => setVariety(e.target.value)} /></label>
      <label className="form-label">Planting date<input className="input-field" type="date" value={plantingDate} onChange={(e) => setPlantingDate(e.target.value)} /></label>
      <label className="form-label">Expected harvest<input className="input-field" type="date" value={expectedHarvest} onChange={(e) => setExpectedHarvest(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!farmId}>Create cycle</button>
    </form>
  </InsightPanel>;
}

function ActivityForm({ cycles, onSubmit }: { cycles: any[]; onSubmit: (payload: any) => void }) {
  const [cropCycleId, setCropCycleId] = useState('');
  const [activityType, setActivityType] = useState('LAND_PREPARATION');
  const [activityDate, setActivityDate] = useState(today());
  const [description, setDescription] = useState('');
  const [photoUrls, setPhotoUrls] = useState('');
  return <InsightPanel title="Log activity" subtitle="Manual browser equivalent for farming records.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ cropCycleId, activityType, activityDate: toIso(activityDate), description, photoUrls: splitUrls(photoUrls) }); }}>
      <SelectCycle cycles={cycles} value={cropCycleId} onChange={setCropCycleId} />
      <label className="form-label">Activity<select className="input-field" value={activityType} onChange={(e) => setActivityType(e.target.value)}><option>LAND_PREPARATION</option><option>PLANTING</option><option>FERTILIZING</option><option>WEEDING</option><option>PEST_CONTROL</option><option>HARVESTING</option><option>DRYING</option><option>STORAGE</option></select></label>
      <label className="form-label">Date<input className="input-field" type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} /></label>
      <label className="form-label form-grid-wide">Description<textarea className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="form-label form-grid-wide">Photo URLs, comma-separated<input className="input-field" value={photoUrls} onChange={(e) => setPhotoUrls(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!cropCycleId}>Log activity</button>
    </form>
  </InsightPanel>;
}

function TaskCompletionForm({ tasks, onSubmit }: { tasks: any[]; onSubmit: (taskId: string, payload: any) => void }) {
  const [taskId, setTaskId] = useState('');
  const [measurements, setMeasurements] = useState('{}');
  const [photoUrls, setPhotoUrls] = useState('');
  const [description, setDescription] = useState('');
  return <InsightPanel title="Complete task" subtitle='Measurements are JSON, e.g. {"dryingMoisturePct":13}.'>
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit(taskId, { measurements: JSON.parse(measurements || '{}'), photoUrls: splitUrls(photoUrls), description }); }}>
      <label className="form-label form-grid-wide">Task<select className="input-field" value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">Select task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      <label className="form-label form-grid-wide">Measurements JSON<textarea className="input-field" value={measurements} onChange={(e) => setMeasurements(e.target.value)} /></label>
      <label className="form-label form-grid-wide">Photo URLs<input className="input-field" value={photoUrls} onChange={(e) => setPhotoUrls(e.target.value)} /></label>
      <label className="form-label form-grid-wide">Description<textarea className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!taskId}>Complete task</button>
    </form>
  </InsightPanel>;
}

function CostForm({ cycles, onSubmit }: { cycles: any[]; onSubmit: (payload: any) => void }) {
  const [cropCycleId, setCropCycleId] = useState('');
  const [category, setCategory] = useState('FERTILIZER');
  const [itemName, setItemName] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  return <InsightPanel title="Add expense" subtitle="Record input/labor/production cost.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ cropCycleId, category, itemName, totalCost: Number(totalCost), receiptUrl: receiptUrl || undefined, dateIncurred: new Date().toISOString() }); }}>
      <SelectCycle cycles={cycles} value={cropCycleId} onChange={setCropCycleId} />
      <label className="form-label">Category<select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}><option>SEEDS</option><option>FERTILIZER</option><option>PESTICIDE</option><option>LABOR</option><option>EQUIPMENT</option><option>IRRIGATION</option><option>TRANSPORT</option><option>OTHER</option></select></label>
      <label className="form-label">Item<input className="input-field" required value={itemName} onChange={(e) => setItemName(e.target.value)} /></label>
      <label className="form-label">Total TZS<input className="input-field" required type="number" min="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} /></label>
      <label className="form-label form-grid-wide">Receipt URL<input className="input-field" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!cropCycleId}>Save expense</button>
    </form>
  </InsightPanel>;
}

function RevenueForm({ cycles, onSubmit }: { cycles: any[]; onSubmit: (payload: any) => void }) {
  const [cropCycleId, setCropCycleId] = useState('');
  const [quantityKg, setQuantityKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const total = Number(quantityKg || 0) * Number(pricePerKg || 0);
  return <InsightPanel title="Add revenue" subtitle="Self-report harvest sales where applicable.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ cropCycleId, revenueType: 'LOCAL_SALE', quantityKg: Number(quantityKg), pricePerKg: Number(pricePerKg), totalRevenue: total, saleDate: new Date().toISOString() }); }}>
      <SelectCycle cycles={cycles} value={cropCycleId} onChange={setCropCycleId} />
      <label className="form-label">Quantity kg<input className="input-field" required type="number" min="0" value={quantityKg} onChange={(e) => setQuantityKg(e.target.value)} /></label>
      <label className="form-label">Price/kg<input className="input-field" required type="number" min="0" value={pricePerKg} onChange={(e) => setPricePerKg(e.target.value)} /></label>
      <MetricTile label="Calculated total" value={money(total)} hint="Quantity × price/kg" />
      <button className="btn-primary" type="submit" disabled={!cropCycleId}>Save revenue</button>
    </form>
  </InsightPanel>;
}

function MembershipForm({ plans, onStart, onReconcile }: { plans: any[]; onStart: (payload: any) => void; onReconcile: () => void }) {
  const [planId, setPlanId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  return <InsightPanel title="Start or refresh membership" subtitle="Use mobile-money number if payment provider is configured.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onStart({ planId, phoneNumber: phoneNumber || undefined }); }}>
      <label className="form-label">Plan<select className="input-field" value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Select plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.priceTzs ?? plan.amountTzs ?? plan.price)}</option>)}</select></label>
      <label className="form-label">Payment phone<input className="input-field" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!planId}>Start membership</button>
      <button className="btn-secondary" type="button" onClick={onReconcile}>Refresh payment</button>
    </form>
  </InsightPanel>;
}

function LandListingForm({ farms, farmerId, onSubmit }: { farms: any[]; farmerId: string; onSubmit: (payload: any) => void }) {
  const [farmId, setFarmId] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  return <InsightPanel title="List my land" subtitle="Create a marketplace listing for an eligible farm.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ farmId, ownerId: farmerId, askingPrice: Number(askingPrice), title: farms.find((farm) => farm.id === farmId)?.farmCode || 'Farm listing' }); }}>
      <SelectFarm farms={farms} value={farmId} onChange={setFarmId} />
      <label className="form-label">Asking price TZS<input className="input-field" required type="number" min="0" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!farmId || !farmerId}>Create listing</button>
    </form>
  </InsightPanel>;
}

function ConsentForm({ onSubmit }: { onSubmit: (payload: any) => void }) {
  const [scope, setScope] = useState('FINANCIAL_PROVIDERS');
  const [granted, setGranted] = useState(true);
  const [signatureUrl, setSignatureUrl] = useState('');
  return <InsightPanel title="Capture consent" subtitle="Formal consent/revocation record.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ scope, granted, language: 'sw', signatureUrl: signatureUrl || undefined }); }}>
      <label className="form-label">Scope<select className="input-field" value={scope} onChange={(e) => setScope(e.target.value)}><option>FINANCIAL_PROVIDERS</option><option>BUYER_TRACEABILITY</option><option>COOPERATIVE_OPERATIONS</option></select></label>
      <label className="form-label">Decision<select className="input-field" value={String(granted)} onChange={(e) => setGranted(e.target.value === 'true')}><option value="true">Grant consent</option><option value="false">Revoke consent</option></select></label>
      <label className="form-label form-grid-wide">Signature URL<input className="input-field" value={signatureUrl} onChange={(e) => setSignatureUrl(e.target.value)} /></label>
      <button className="btn-primary" type="submit">Save consent</button>
    </form>
  </InsightPanel>;
}

function MakeOfferButton({ farmerId, listingId, onOffer }: { farmerId: string; listingId: string; onOffer: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  return <form style={{ display: 'flex', gap: 8 }} onSubmit={(event) => { event.preventDefault(); onOffer(Number(amount)); }}>
    <input className="input-field" style={{ width: 120 }} type="number" min="0" placeholder="Offer" value={amount} onChange={(e) => setAmount(e.target.value)} />
    <button className="btn-secondary" type="submit" disabled={!farmerId || !listingId || !amount}>Offer</button>
  </form>;
}

function SelectFarm({ farms, value, onChange }: { farms: any[]; value: string; onChange: (value: string) => void }) {
  return <label className="form-label">Farm<select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select farm</option>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.farmCode} · {farm.name}</option>)}</select></label>;
}

function SelectCycle({ cycles, value, onChange }: { cycles: any[]; value: string; onChange: (value: string) => void }) {
  return <label className="form-label">Crop cycle<select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select cycle</option>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.label || cycle.season}</option>)}</select></label>;
}
