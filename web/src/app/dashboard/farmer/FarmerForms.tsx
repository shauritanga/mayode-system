'use client';
import { useEffect, useState } from 'react';
import {
  EmptyState,
  InsightPanel,
  MetricTile,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';
import { suppliersApi } from '@/lib/api';
import { today, toIso, splitUrls } from './FarmerDataContext';

export function SelectFarm({ farms, value, onChange }: { farms: any[]; value: string; onChange: (value: string) => void }) {
  return <label className="form-label">Farm<select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select farm</option>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.farmCode} · {farm.name}</option>)}</select></label>;
}

export function SelectCycle({ cycles, value, onChange }: { cycles: any[]; value: string; onChange: (value: string) => void }) {
  return <label className="form-label">Crop cycle<select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select cycle</option>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.label || cycle.season}</option>)}</select></label>;
}

export function FarmForm({ farmer, onSubmit }: { farmer: any; onSubmit: (payload: any) => void }) {
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

export function FarmEvidenceForm({ farms, onSubmit }: { farms: any[]; onSubmit: (farmId: string, payload: any) => void }) {
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

export function CropCycleForm({ farms, onSubmit }: { farms: any[]; onSubmit: (payload: any) => void }) {
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

export function ActivityForm({ cycles, onSubmit }: { cycles: any[]; onSubmit: (payload: any) => void }) {
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

export function TaskCompletionForm({ tasks, onSubmit }: { tasks: any[]; onSubmit: (taskId: string, payload: any) => void }) {
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

export function CostForm({ cycles, onSubmit }: { cycles: any[]; onSubmit: (payload: any) => void }) {
  const [cropCycleId, setCropCycleId] = useState('');
  const [category, setCategory] = useState('FERTILIZER');
  const [itemName, setItemName] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('PENDING');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  useEffect(() => { suppliersApi.getAll().then((res) => setSuppliers(res.data || [])).catch(() => setSuppliers([])); }, []);
  return <InsightPanel title="Add expense" subtitle="Record input/labor/production cost.">
    <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSubmit({ cropCycleId, category, itemName, totalCost: Number(totalCost), receiptUrl: receiptUrl || undefined, supplierId: supplierId || undefined, paymentStatus, dateIncurred: new Date().toISOString() }); }}>
      <SelectCycle cycles={cycles} value={cropCycleId} onChange={setCropCycleId} />
      <label className="form-label">Category<select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}><option>SEEDS</option><option>FERTILIZER</option><option>PESTICIDE</option><option>LABOR</option><option>EQUIPMENT</option><option>IRRIGATION</option><option>TRANSPORT</option><option>OTHER</option></select></label>
      <label className="form-label">Item<input className="input-field" required value={itemName} onChange={(e) => setItemName(e.target.value)} /></label>
      <label className="form-label">Total TZS<input className="input-field" required type="number" min="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} /></label>
      <label className="form-label">Supplier<select className="input-field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Not specified</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="form-label">Payment status<select className="input-field" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}><option value="PENDING">Pending</option><option value="PARTIAL">Partial</option><option value="PAID">Paid</option></select></label>
      <label className="form-label form-grid-wide">Receipt URL<input className="input-field" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} /></label>
      <button className="btn-primary" type="submit" disabled={!cropCycleId}>Save expense</button>
    </form>
  </InsightPanel>;
}

export function RevenueForm({ cycles, onSubmit }: { cycles: any[]; onSubmit: (payload: any) => void }) {
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

export function MembershipForm({ plans, onStart, onReconcile }: { plans: any[]; onStart: (payload: any) => void; onReconcile: () => void }) {
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

export function LandListingForm({ farms, farmerId, onSubmit }: { farms: any[]; farmerId: string; onSubmit: (payload: any) => void }) {
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

export function ConsentForm({ onSubmit }: { onSubmit: (payload: any) => void }) {
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

export function MakeOfferButton({ farmerId, listingId, onOffer }: { farmerId: string; listingId: string; onOffer: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  return <form style={{ display: 'flex', gap: 8 }} onSubmit={(event) => { event.preventDefault(); onOffer(Number(amount)); }}>
    <input className="input-field" style={{ width: 120 }} type="number" min="0" placeholder="Offer" value={amount} onChange={(e) => setAmount(e.target.value)} />
    <button className="btn-secondary" type="submit" disabled={!farmerId || !listingId || !amount}>Offer</button>
  </form>;
}

export { EmptyState, InsightPanel, MetricTile, money };
