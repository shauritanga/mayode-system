'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { assetsApi, machineryApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, Filters, FormGrid, LoadError, Notice, PageHeader, Pager, StatCard, TableSkeleton, Tabs,
  errMsg, fmtDate, fmtNum, titleCase, todayISO, useApi, useCan,
} from '@/screens/dashboard/irrigation/ui';
import MoneyInput from '@/components/MoneyInput';

const CATEGORIES = ['MACHINERY_VEHICLE', 'BUILDING_WAREHOUSE', 'MILL_PROCESSING', 'IRRIGATION_STRUCTURE', 'SOLAR_POWER', 'MEASURING_EQUIPMENT', 'TOOLS', 'OFFICE_IT', 'FURNITURE', 'OTHER'];
const LIFE_YEARS: Record<string, number> = { MACHINERY_VEHICLE: 8, BUILDING_WAREHOUSE: 40, MILL_PROCESSING: 12, IRRIGATION_STRUCTURE: 25, SOLAR_POWER: 15, MEASURING_EQUIPMENT: 5, TOOLS: 4, OFFICE_IT: 4, FURNITURE: 8, OTHER: 5 };
const FUNDING = ['AMCOS_FUNDS', 'MEMBER_CONTRIBUTIONS', 'GRANT', 'LOAN', 'DONATION'];
const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'UNDER_REPAIR'];
const STATUSES = ['IN_USE', 'IDLE', 'DISPOSED'];
const WORK_KINDS = ['SERVICE', 'REPAIR', 'INSPECTION', 'CALIBRATION', 'PEST_CONTROL', 'FUEL'];
const DISPOSAL_METHODS = ['SOLD', 'SCRAPPED', 'LOST_STOLEN', 'DONATED'];
const CATEGORY_LABEL: Record<string, string> = {
  MACHINERY_VEHICLE: 'Machinery & vehicles', BUILDING_WAREHOUSE: 'Storage & buildings', MILL_PROCESSING: 'Processing & collection units',
  IRRIGATION_STRUCTURE: 'Irrigation', SOLAR_POWER: 'Solar & power', MEASURING_EQUIPMENT: 'Scales, moisture meters & grading tools',
  TOOLS: 'Tools', OFFICE_IT: 'Office & IT', FURNITURE: 'Furniture', OTHER: 'Other',
};
const cat = (v?: string | null) => CATEGORY_LABEL[v ?? ''] ?? titleCase(v);
const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const STATUS_TONE: Record<string, string> = { IN_USE: 'badge-green', IDLE: 'badge-gold', DISPOSED: 'badge-gray' };
const CONDITION_TONE: Record<string, string> = { NEW: 'badge-green', GOOD: 'badge-green', FAIR: 'badge-gold', POOR: 'badge-red', UNDER_REPAIR: 'badge-red' };
const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

function Submit({ form, saving, label }: { form: string; saving: boolean; label: string }) {
  return <button type="submit" form={form} className="btn-primary" disabled={saving}>{saving ? 'Saving…' : label}</button>;
}

function AssetModal({ canLinkMachines, onClose, onSaved }: { canLinkMachines: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const machines = useApi<any[]>(canLinkMachines ? () => machineryApi.equipment({}) : null, []);
  const [form, setForm] = useState({
    name: '', category: 'MACHINERY_VEHICLE', make: '', model: '', serialNo: '', purchaseDate: todayISO(), cost: '', fundingSource: 'AMCOS_FUNDS',
    supplier: '', location: '', condition: 'NEW', usefulLifeYears: '', salvageValue: '', custodianName: '', warrantyExpiresOn: '', insuranceExpiresOn: '',
    serviceIntervalDays: '', equipmentId: '', notes: '', postToLedger: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const linkable = (machines.data ?? []).filter((m) => m.ownership === 'AMCOS' && m.isActive);

  const save = async () => {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = 'Give the asset a name';
    if (!form.purchaseDate) found.purchaseDate = 'Choose the purchase date';
    else if (form.purchaseDate > todayISO()) found.purchaseDate = 'Cannot be in the future';
    if (form.cost === '' || !(Number(form.cost) >= 0)) found.cost = 'Enter the cost';
    if (form.salvageValue !== '' && Number(form.salvageValue) > Number(form.cost)) found.salvageValue = 'Cannot be more than the cost';
    if (form.usefulLifeYears !== '' && !(Number(form.usefulLifeYears) >= 1)) found.usefulLifeYears = 'At least 1 year';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    const n = (v: string) => (v === '' ? undefined : Number(v));
    try {
      await assetsApi.create({
        name: form.name.trim(), category: form.category, make: form.make.trim() || undefined, model: form.model.trim() || undefined,
        serialNo: form.serialNo.trim() || undefined, purchaseDate: form.purchaseDate, cost: Number(form.cost), fundingSource: form.fundingSource,
        supplier: form.supplier.trim() || undefined, location: form.location.trim() || undefined, condition: form.condition,
        usefulLifeYears: n(form.usefulLifeYears), salvageValue: n(form.salvageValue), custodianName: form.custodianName.trim() || undefined,
        warrantyExpiresOn: form.warrantyExpiresOn || undefined, insuranceExpiresOn: form.insuranceExpiresOn || undefined,
        serviceIntervalDays: n(form.serviceIntervalDays), equipmentId: form.equipmentId || undefined, notes: form.notes.trim() || undefined,
        postToLedger: form.postToLedger && form.fundingSource === 'AMCOS_FUNDS' ? true : undefined,
      });
      onSaved('Asset registered.');
    } catch (e) { setError(errMsg(e, 'Could not register this asset.')); setSaving(false); }
  };

  return (
    <Modal title="Register an asset" subtitle="Something your AMCOS owns and keeps on its books." onClose={() => !saving && onClose()} width="720px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><Submit form="asset-form" saving={saving} label="Register asset" /></>}>
      <form id="asset-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Name *" error={errors.name}><input className="input-field" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tractor MF-385" /></Field>
          <Field label="Category *"><select className="input-field" value={form.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{cat(c)}</option>)}</select></Field>
          <Field label="Purchase date *" error={errors.purchaseDate}><input type="date" className="input-field" max={todayISO()} value={form.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} /></Field>
          <Field label="Cost (TZS) *" error={errors.cost}><MoneyInput min="0" className="input-field" value={form.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
          <Field label="Held by"><input className="input-field" value={form.custodianName} onChange={(e) => set('custodianName', e.target.value)} placeholder="Person responsible" /></Field>
          <Field label="Where it is kept"><input className="input-field" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
        </FormGrid>
        <button type="button" className="btn-secondary" style={{ marginTop: 12 }} onClick={() => setMore((v) => !v)}>{more ? 'Hide extra details' : 'Add more details (make, life, service, warranty…)'}</button>
        {more && (<div style={{ marginTop: 12 }}><FormGrid>
          <Field label="Make"><input className="input-field" value={form.make} onChange={(e) => set('make', e.target.value)} /></Field>
          <Field label="Model"><input className="input-field" value={form.model} onChange={(e) => set('model', e.target.value)} /></Field>
          <Field label="Serial / registration no."><input className="input-field" value={form.serialNo} onChange={(e) => set('serialNo', e.target.value)} /></Field>
          <Field label="Paid for by"><select className="input-field" value={form.fundingSource} onChange={(e) => set('fundingSource', e.target.value)}>{FUNDING.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
          <Field label="Supplier"><input className="input-field" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} /></Field>
          <Field label="Useful life (years)" error={errors.usefulLifeYears} hint={`Leave empty for the usual ${LIFE_YEARS[form.category]} years`}><input type="number" min="1" className="input-field" value={form.usefulLifeYears} onChange={(e) => set('usefulLifeYears', e.target.value)} /></Field>
          <Field label="Value left at the end (TZS)" error={errors.salvageValue} hint="Salvage value; empty means fully written off"><MoneyInput min="0" className="input-field" value={form.salvageValue} onChange={(e) => set('salvageValue', e.target.value)} /></Field>
          <Field label="Condition"><select className="input-field" value={form.condition} onChange={(e) => set('condition', e.target.value)}>{CONDITIONS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
          <Field label="Service every (days)"><input type="number" min="1" className="input-field" value={form.serviceIntervalDays} onChange={(e) => set('serviceIntervalDays', e.target.value)} /></Field>
          <Field label="Warranty ends"><input type="date" className="input-field" value={form.warrantyExpiresOn} onChange={(e) => set('warrantyExpiresOn', e.target.value)} /></Field>
          <Field label="Insurance ends"><input type="date" className="input-field" value={form.insuranceExpiresOn} onChange={(e) => set('insuranceExpiresOn', e.target.value)} /></Field>
          {canLinkMachines && linkable.length > 0 && (
            <Field label="Same as machine in Tools & Equipment" hint="Shows the machine's jobs and hectares beside this asset">
              <select className="input-field" value={form.equipmentId} onChange={(e) => set('equipmentId', e.target.value)}><option value="">Not a Tools & Equipment machine</option>{linkable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            </Field>
          )}
          <Field label="Notes" wide><textarea className="input-field" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </FormGrid></div>)}
        {form.fundingSource === 'AMCOS_FUNDS' && Number(form.cost) > 0 && (
          <label className="form-label" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={form.postToLedger} onChange={(e) => set('postToLedger', e.target.checked)} />
            <span>Record this purchase in the accounts now (property up, cash down). Leave unticked for assets bought before your books started.</span>
          </label>
        )}
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function EditModal({ asset, onClose, onSaved }: { asset: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [form, setForm] = useState({ name: asset.name, location: asset.location ?? '', condition: asset.condition, status: asset.status, warrantyExpiresOn: day(asset.warrantyExpiresOn), insuranceExpiresOn: day(asset.insuranceExpiresOn), serviceIntervalDays: asset.serviceIntervalDays ? String(asset.serviceIntervalDays) : '', notes: asset.notes ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name.trim()) { setError('Give the asset a name'); return; }
    setSaving(true); setError('');
    try {
      await assetsApi.update(asset.id, {
        name: form.name.trim(), location: form.location.trim(), condition: form.condition, status: form.status, notes: form.notes.trim(),
        ...(form.warrantyExpiresOn ? { warrantyExpiresOn: form.warrantyExpiresOn } : {}), ...(form.insuranceExpiresOn ? { insuranceExpiresOn: form.insuranceExpiresOn } : {}),
        ...(form.serviceIntervalDays ? { serviceIntervalDays: Number(form.serviceIntervalDays) } : {}),
      });
      onSaved('Asset updated.');
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title={`Edit ${asset.tag}`} subtitle="Cost and purchase details are fixed once recorded." onClose={() => !saving && onClose()} width="600px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><Submit form="asset-edit-form" saving={saving} label="Save asset" /></>}>
      <form id="asset-edit-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Name *"><input className="input-field" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Where it is kept"><input className="input-field" value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="Condition"><select className="input-field" value={form.condition} onChange={(e) => set('condition', e.target.value)}>{CONDITIONS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
          <Field label="Use"><select className="input-field" value={form.status} onChange={(e) => set('status', e.target.value)}><option value="IN_USE">In use</option><option value="IDLE">Idle</option></select></Field>
          <Field label="Warranty ends"><input type="date" className="input-field" value={form.warrantyExpiresOn} onChange={(e) => set('warrantyExpiresOn', e.target.value)} /></Field>
          <Field label="Insurance ends"><input type="date" className="input-field" value={form.insuranceExpiresOn} onChange={(e) => set('insuranceExpiresOn', e.target.value)} /></Field>
          <Field label="Service every (days)"><input type="number" min="1" className="input-field" value={form.serviceIntervalDays} onChange={(e) => set('serviceIntervalDays', e.target.value)} /></Field>
          <Field label="Notes" wide><textarea className="input-field" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </FormGrid>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function MaintenanceModal({ asset, onClose, onSaved }: { asset: { id: string; name: string; tag: string }; onClose: () => void; onSaved: (m: string) => void }) {
  const [form, setForm] = useState({ kind: 'SERVICE', doneOn: todayISO(), cost: '', performedBy: '', nextDueOn: '', notes: '', postToLedger: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.doneOn || form.doneOn > todayISO()) { setError('Choose the date the work was done (not in the future)'); return; }
    if (form.nextDueOn && form.nextDueOn <= form.doneOn) { setError('The next due date must be after the work date'); return; }
    setSaving(true); setError('');
    try {
      await assetsApi.addMaintenance(asset.id, {
        kind: form.kind, doneOn: form.doneOn, cost: form.cost === '' ? undefined : Number(form.cost), performedBy: form.performedBy.trim() || undefined,
        nextDueOn: form.nextDueOn || undefined, notes: form.notes.trim() || undefined, postToLedger: form.postToLedger && Number(form.cost) > 0 ? true : undefined,
      });
      onSaved('Work recorded.');
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Record maintenance" subtitle={`${asset.tag} · ${asset.name}`} onClose={() => !saving && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><Submit form="maintenance-form" saving={saving} label="Record work" /></>}>
      <form id="maintenance-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Kind of work"><select className="input-field" value={form.kind} onChange={(e) => set('kind', e.target.value)}>{WORK_KINDS.map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select></Field>
          <Field label="Date done *"><input type="date" className="input-field" max={todayISO()} value={form.doneOn} onChange={(e) => set('doneOn', e.target.value)} /></Field>
          <Field label="Cost (TZS)"><MoneyInput min="0" className="input-field" value={form.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
          <Field label="Done by"><input className="input-field" value={form.performedBy} onChange={(e) => set('performedBy', e.target.value)} placeholder="Workshop or person" /></Field>
          <Field label="Next due" hint="Empty keeps the usual service interval"><input type="date" className="input-field" value={form.nextDueOn} onChange={(e) => set('nextDueOn', e.target.value)} /></Field>
          <Field label="Notes" wide><textarea className="input-field" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </FormGrid>
        {Number(form.cost) > 0 && (
          <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={form.postToLedger} onChange={(e) => set('postToLedger', e.target.checked)} />Record this cost in the accounts as repairs and maintenance
          </label>
        )}
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function CustodyModal({ asset, onClose, onSaved }: { asset: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [toName, setToName] = useState('');
  const [assignedOn, setAssignedOn] = useState(todayISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!toName.trim()) { setError('Who is taking the asset?'); return; }
    setSaving(true); setError('');
    try { await assetsApi.reassign(asset.id, { toName: toName.trim(), assignedOn, note: note.trim() || undefined }); onSaved('Asset handed over.'); } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Hand the asset to someone" subtitle={`${asset.tag} · ${asset.name}${asset.custodianName ? ` · now with ${asset.custodianName}` : ''}`} onClose={() => !saving && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><Submit form="custody-form" saving={saving} label="Hand over" /></>}>
      <form id="custody-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="New holder *"><input className="input-field" value={toName} onChange={(e) => setToName(e.target.value)} autoFocus /></Field>
          <Field label="Date"><input type="date" className="input-field" max={todayISO()} value={assignedOn} onChange={(e) => setAssignedOn(e.target.value)} /></Field>
          <Field label="Note" wide><textarea className="input-field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </FormGrid>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function DisposeModal({ asset, onClose, onSaved }: { asset: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [form, setForm] = useState({ disposedOn: todayISO(), method: 'SOLD', proceeds: '', reason: '', postToLedger: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const proceeds = form.method === 'SOLD' ? Number(form.proceeds) || 0 : 0;
  const gainLoss = proceeds - asset.bookValue;
  const save = async () => {
    if (!form.disposedOn || form.disposedOn > todayISO()) { setError('Choose the disposal date (not in the future)'); return; }
    setSaving(true); setError('');
    try {
      await assetsApi.dispose(asset.id, { disposedOn: form.disposedOn, method: form.method, proceeds: form.method === 'SOLD' ? proceeds : undefined, reason: form.reason.trim() || undefined, postToLedger: form.postToLedger });
      onSaved('Asset disposed of.');
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Dispose of this asset" subtitle={`${asset.tag} · ${asset.name} · book value ${tzs(asset.bookValue)}`} onClose={() => !saving && onClose()} width="520px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><Submit form="dispose-form" saving={saving} label="Dispose" /></>}>
      <form id="dispose-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="What happened"><select className="input-field" value={form.method} onChange={(e) => set('method', e.target.value)}>{DISPOSAL_METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</select></Field>
          <Field label="Date"><input type="date" className="input-field" max={todayISO()} value={form.disposedOn} onChange={(e) => set('disposedOn', e.target.value)} /></Field>
          {form.method === 'SOLD' && <Field label="Sale proceeds (TZS)"><MoneyInput min="0" className="input-field" value={form.proceeds} onChange={(e) => set('proceeds', e.target.value)} /></Field>}
          <Field label="Reason" wide><textarea className="input-field" rows={2} value={form.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
        </FormGrid>
        <p style={{ fontSize: 13, margin: '12px 0 0' }}>{gainLoss >= 0 ? 'Gain' : 'Loss'} on disposal: <strong style={{ color: gainLoss >= 0 ? 'var(--green-500)' : 'var(--red-400)' }}>{tzs(Math.abs(gainLoss))}</strong></p>
        <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <input type="checkbox" checked={form.postToLedger} onChange={(e) => set('postToLedger', e.target.checked)} />Record this in the accounts
        </label>
        <p className="muted" style={{ fontSize: 12 }}>A disposed asset can no longer be changed, maintained or depreciated. It stays in the history.</p>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function AssetDetail({ id, can, onClose, onChanged }: { id: string; can: (r: string, a: string) => boolean; onClose: () => void; onChanged: () => void }) {
  const { data: a, loading, error, reload } = useApi<any>(() => assetsApi.get(id), [id]);
  const [sub, setSub] = useState<'edit' | 'maintenance' | 'custody' | 'dispose' | null>(null);
  const [message, setMessage] = useState('');
  const done = (m: string) => { setSub(null); setMessage(m); reload(); onChanged(); };
  const open = a && a.status !== 'DISPOSED';
  const fact = (label: string, value: any) => <div><div className="muted" style={{ fontSize: 11 }}>{label}</div><div style={{ fontSize: 14 }}>{value || '—'}</div></div>;
  return (
    <Modal title={a ? `${a.tag} · ${a.name}` : 'Asset'} onClose={onClose} width="860px"
      footer={a && can('assets', 'EDIT') ? (
        <>
          <button type="button" className="btn-secondary" onClick={() => setSub('edit')} disabled={!open}>Edit</button>
          <button type="button" className="btn-secondary" onClick={() => setSub('custody')} disabled={!open}>Hand over</button>
          <button type="button" className="btn-secondary" onClick={() => setSub('dispose')} disabled={!open}>Dispose</button>
          <button type="button" className="btn-primary" onClick={() => setSub('maintenance')} disabled={!open}>Record maintenance</button>
        </>
      ) : undefined}>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {loading && !a ? <TableSkeleton rows={4} cols={3} /> : a && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="metric-grid">
            <StatCard label="Cost" value={tzs(a.cost)} />
            <StatCard label="Written off so far" value={tzs(a.accumulatedDepreciation)} />
            <StatCard label="Book value" value={tzs(a.bookValue)} tone="good" />
            <StatCard label="Spent on upkeep" value={tzs(a.upkeepCost)} hint={a.costPerHectare != null ? `${tzs(a.costPerHectare)} per hectare worked` : undefined} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
            {fact('Category', cat(a.category))}{fact('Make / model', [a.make, a.model].filter(Boolean).join(' '))}{fact('Serial no.', a.serialNo)}
            {fact('Bought', fmtDate(a.purchaseDate))}{fact('Paid by', titleCase(a.fundingSource))}{fact('Supplier', a.supplier)}
            {fact('Kept at', a.location)}{fact('Held by', a.custodianName)}
            {fact('Condition', <span className={`badge ${CONDITION_TONE[a.condition]}`}>{titleCase(a.condition)}</span>)}
            {fact('Status', <span className={`badge ${STATUS_TONE[a.status]}`}>{titleCase(a.status)}</span>)}
            {fact('Life', `${a.usefulLifeYears} years, value left ${tzs(a.salvageValue)}`)}
            {fact('Next service', a.nextServiceDue ? fmtDate(a.nextServiceDue) : '')}{fact('Warranty ends', a.warrantyExpiresOn ? fmtDate(a.warrantyExpiresOn) : '')}{fact('Insurance ends', a.insuranceExpiresOn ? fmtDate(a.insuranceExpiresOn) : '')}
            {a.usage && fact('Machine work', `${a.usage.jobs} jobs · ${fmtNum(a.usage.hectares, 1)} ha · fees ${tzs(a.usage.feesEarned)}`)}
          </div>
          {a.disposal && <Notice tone="success">Disposed of ({titleCase(a.disposal.method)}) on {fmtDate(a.disposal.disposedOn)} for {tzs(a.disposal.proceeds)}. {a.disposal.gainLoss >= 0 ? 'Gain' : 'Loss'}: {tzs(Math.abs(a.disposal.gainLoss))}.</Notice>}
          <section>
            <strong>Maintenance history</strong>
            {!a.maintenance.length ? <p className="muted" style={{ fontSize: 13 }}>No work recorded yet.</p> : (
              <table className="data-table"><thead><tr><th>Date</th><th>Work</th><th>By</th><th className="num">Cost</th><th>Notes</th></tr></thead>
                <tbody>{a.maintenance.map((m: any) => <tr key={m.id}><td>{fmtDate(m.doneOn)}</td><td>{titleCase(m.kind)}</td><td>{m.performedBy ?? '—'}</td><td className="num">{m.cost ? tzs(m.cost) : '—'}</td><td>{m.notes ?? ''}</td></tr>)}</tbody></table>
            )}
          </section>
          <section>
            <strong>Who has held it</strong>
            <table className="data-table"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Note</th></tr></thead>
              <tbody>{a.custodyLog.map((c: any) => <tr key={c.id}><td>{fmtDate(c.assignedOn)}</td><td>{c.fromName ?? '—'}</td><td>{c.toName}</td><td>{c.note ?? ''}</td></tr>)}</tbody></table>
            {!a.custodyLog.length && <p className="muted" style={{ fontSize: 13 }}>No holder recorded.</p>}
          </section>
          <section>
            <strong>Depreciation posted</strong>
            {!a.schedule.length ? <p className="muted" style={{ fontSize: 13 }}>Nothing posted yet. Use the Depreciation tab to post a month.</p> : (
              <table className="data-table"><thead><tr><th>Month</th><th className="num">Written off</th></tr></thead>
                <tbody>{a.schedule.map((s: any) => <tr key={s.period}><td>{s.period}</td><td className="num">{tzs(s.amount)}</td></tr>)}</tbody></table>
            )}
          </section>
        </div>
      )}
      {a && sub === 'edit' && <EditModal asset={a} onClose={() => setSub(null)} onSaved={done} />}
      {a && sub === 'maintenance' && <MaintenanceModal asset={a} onClose={() => setSub(null)} onSaved={done} />}
      {a && sub === 'custody' && <CustodyModal asset={a} onClose={() => setSub(null)} onSaved={done} />}
      {a && sub === 'dispose' && <DisposeModal asset={a} onClose={() => setSub(null)} onSaved={done} />}
    </Modal>
  );
}

function Register({ can }: { can: (r: string, a: string) => boolean }) {
  const [filters, setFilters] = useState({ q: '', category: '', status: '', condition: '', custodian: '' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 15 };
  const { data, loading, error, reload } = useApi<any>(() => assetsApi.list(params), [JSON.stringify(filters), page]);
  const setFilter = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const t = data?.totals;
  const filtered = Object.values(filters).some(Boolean);
  const add = can('assets', 'CREATE') ? <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Register asset</button> : undefined;
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div className="metric-grid" style={{ marginBottom: 12 }}>
        <StatCard label="Assets" value={t ? fmtNum(t.count) : '—'} hint={filtered ? 'For the filters below' : undefined} />
        <StatCard label="Bought for" value={t ? tzs(t.cost) : '—'} />
        <StatCard label="Written off so far" value={t ? tzs(t.accumulatedDepreciation) : '—'} />
        <StatCard label="Book value" value={t ? tzs(t.bookValue) : '—'} tone="good" />
      </div>
      <section className="table-panel">
        <div className="section-toolbar"><strong>Asset register</strong>{add}</div>
        <Filters>
          <Field label="Search"><input className="input-field" placeholder="Name, tag, serial no., place" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Field>
          <Field label="Category"><select className="input-field" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}><option value="">All</option>{CATEGORIES.map((c) => <option key={c} value={c}>{cat(c)}</option>)}</select></Field>
          <Field label="Status"><select className="input-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">All</option>{STATUSES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
          <Field label="Condition"><select className="input-field" value={filters.condition} onChange={(e) => setFilter('condition', e.target.value)}><option value="">All</option>{CONDITIONS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</select></Field>
          <Field label="Held by"><input className="input-field" value={filters.custodian} onChange={(e) => setFilter('custodian', e.target.value)} /></Field>
        </Filters>
        {loading && !data ? <TableSkeleton cols={8} /> : !data?.items.length ? (
          <Empty title={filtered ? 'No assets match these filters' : 'No assets registered yet'} hint={filtered ? undefined : 'Register the machines, buildings, mills and tools your AMCOS owns to track their value, upkeep and who holds them.'} action={!filtered ? add : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Tag</th><th>Asset</th><th>Category</th><th>Held by</th><th>Condition</th><th className="num">Cost</th><th className="num">Book value</th><th>Status</th></tr></thead>
              <tbody>
                {data.items.map((a: any) => (
                  <tr key={a.id} onClick={() => setOpenId(a.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.tag}</td>
                    <td><div style={{ fontWeight: 600 }}>{a.name}</div>{a.location && <div className="muted" style={{ fontSize: 11 }}>{a.location}</div>}</td>
                    <td>{cat(a.category)}</td><td>{a.custodianName ?? '—'}</td>
                    <td><span className={`badge ${CONDITION_TONE[a.condition]}`}>{titleCase(a.condition)}</span></td>
                    <td className="num">{tzs(a.cost)}</td><td className="num">{tzs(a.bookValue)}</td>
                    <td><span className={`badge ${STATUS_TONE[a.status]}`}>{titleCase(a.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data ? { total: data.total, page: data.page, pageSize: data.pageSize, pages: Math.max(1, Math.ceil(data.total / data.pageSize)) } : undefined} onPage={setPage} />
      </section>
      {adding && <AssetModal canLinkMachines={can('machinery', 'VIEW')} onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); setMessage(m); reload(); }} />}
      {openId && <AssetDetail id={openId} can={can} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

const DUE_LABEL: Record<string, string> = { SERVICE: 'Service due', WARRANTY: 'Warranty ends', INSURANCE: 'Insurance ends' };

function Maintenance({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useApi<any>(() => assetsApi.due({ days: 60 }), []);
  const [working, setWorking] = useState<any>(null);
  const [message, setMessage] = useState('');
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <div className="section-toolbar"><strong>Needs attention in the next 60 days</strong>{data?.overdue > 0 && <span className="badge badge-red">{data.overdue} overdue</span>}</div>
        {loading && !data ? <TableSkeleton cols={6} /> : !data?.items.length ? (
          <Empty title="Nothing is due" hint="Services, warranties and insurance that are overdue or ending soon will appear here." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Asset</th><th>What</th><th>Date</th><th>Held by</th><th /></tr></thead>
              <tbody>
                {data.items.map((i: any) => (
                  <tr key={`${i.assetId}-${i.kind}`}>
                    <td><strong>{i.tag}</strong> {i.name}</td>
                    <td>{DUE_LABEL[i.kind]}</td>
                    <td>{fmtDate(i.dueOn)} <span className={`badge ${i.overdue ? 'badge-red' : 'badge-gold'}`}>{i.overdue ? `${Math.abs(i.daysLeft)} days overdue` : i.daysLeft === 0 ? 'Today' : `in ${i.daysLeft} days`}</span></td>
                    <td>{i.custodianName ?? '—'}</td>
                    <td>{canWrite && i.kind === 'SERVICE' && <button type="button" className="btn-primary" onClick={() => setWorking(i)}>Record service</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {working && <MaintenanceModal asset={{ id: working.assetId, name: working.name, tag: working.tag }} onClose={() => setWorking(null)} onSaved={(m) => { setWorking(null); setMessage(m); reload(); }} />}
    </>
  );
}

function Depreciation({ canPost }: { canPost: boolean }) {
  const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const [period, setPeriod] = useState(lastMonth);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= todayISO().slice(0, 7);
  const preview = useApi<any>(valid ? () => assetsApi.depreciationPreview(period) : null, [period]);
  const runs = useApi<any[]>(() => assetsApi.depreciationRuns(), []);
  const p = preview.data;
  const refresh = () => { preview.reload(); runs.reload(); };
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={preview.error || runs.error} onRetry={refresh} />
      <section className="table-panel" style={{ marginBottom: 14 }}>
        <div className="section-toolbar">
          <strong>Post a month&apos;s depreciation</strong>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="month" className="input-field" max={todayISO().slice(0, 7)} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Month" />
            {canPost && <button type="button" className="btn-primary" disabled={!valid || !p || p.alreadyPosted || !p.lines.length} onClick={() => setConfirming(true)}>Post to the accounts</button>}
          </span>
        </div>
        {!valid ? <Empty title="Choose a month" hint="Pick a month that has started." /> : preview.loading && !p ? <TableSkeleton cols={4} /> : p && (
          <>
            {p.alreadyPosted && <div style={{ padding: '10px 16px' }}><Notice tone="success">Depreciation for {p.period} is already posted.</Notice></div>}
            {!p.lines.length ? <Empty title="Nothing to depreciate" hint="No asset has value left to write off for this month." /> : (
              <table className="data-table">
                <thead><tr><th>Asset</th><th className="num">This month</th><th className="num">Written off after</th><th className="num">Book value after</th></tr></thead>
                <tbody>
                  {p.lines.map((l: any) => <tr key={l.assetId}><td><strong>{l.tag}</strong> {l.name}</td><td className="num">{tzs(l.amount)}</td><td className="num">{tzs(l.accumulatedAfter)}</td><td className="num">{tzs(l.bookValueAfter)}</td></tr>)}
                  <tr><td><strong>Total</strong></td><td className="num"><strong>{tzs(p.total)}</strong></td><td /><td /></tr>
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
      <section className="table-panel">
        <div className="section-toolbar"><strong>Months already posted</strong></div>
        {runs.loading && !runs.data ? <TableSkeleton cols={4} rows={3} /> : !runs.data?.length ? <Empty title="No depreciation posted yet" /> : (
          <table className="data-table"><thead><tr><th>Month</th><th className="num">Assets</th><th className="num">Total</th><th>Posted</th></tr></thead>
            <tbody>{runs.data.map((r: any) => <tr key={r.id}><td>{r.period}</td><td className="num">{r.assets}</td><td className="num">{tzs(r.total)}</td><td>{fmtDate(r.postedAt)}</td></tr>)}</tbody></table>
        )}
      </section>
      {confirming && p && (
        <ConfirmDialog title={`Post depreciation for ${p.period}`} confirmLabel="Post"
          body={<>This writes off <strong>{tzs(p.total)}</strong> across {p.lines.length} asset{p.lines.length === 1 ? '' : 's'} and records it in your accounts as depreciation expense. A month can only be posted once.</>}
          onConfirm={async () => { await assetsApi.runDepreciation(p.period); setMessage(`Depreciation for ${p.period} posted.`); refresh(); }}
          onClose={() => setConfirming(false)} />
      )}
    </>
  );
}

function Disposals() {
  const { data, loading, error, reload } = useApi<any[]>(() => assetsApi.disposals(), []);
  return (
    <>
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <div className="section-toolbar"><strong>Assets sold, scrapped or lost</strong></div>
        {loading && !data ? <TableSkeleton cols={6} /> : !data?.length ? <Empty title="No disposals" hint="Assets you sell, scrap, donate or lose are listed here with the gain or loss." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Asset</th><th>How</th><th className="num">Book value</th><th className="num">Proceeds</th><th className="num">Gain / loss</th><th>Reason</th></tr></thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td>{fmtDate(d.disposedOn)}</td><td><strong>{d.asset.tag}</strong> {d.asset.name}</td><td>{titleCase(d.method)}</td>
                    <td className="num">{tzs(d.bookValue)}</td><td className="num">{tzs(d.proceeds)}</td>
                    <td className="num" style={{ color: d.gainLoss >= 0 ? 'var(--green-500)' : 'var(--red-400)' }}>{d.gainLoss >= 0 ? '+' : '−'}{tzs(Math.abs(d.gainLoss))}</td>
                    <td>{d.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** Asset Management: what the AMCOS owns, its upkeep, who holds it, and its value on the books. */
export default function AssetsPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<'register' | 'maintenance' | 'depreciation' | 'disposals'>('register');
  if (!user?.mamcosId) {
    return <><PageHeader title="Assets Management" /><Empty title="Assets belong to an AMCOS" hint="Sign in with an AMCOS account to see its assets." /></>;
  }
  return (
    <div>
      <PageHeader title="Assets Management" subtitle="Machines, buildings, mills and tools your AMCOS owns: their value, upkeep, who holds them, and the depreciation recorded in your accounts." />
      <Tabs tabs={[{ id: 'register', label: 'Register' }, { id: 'maintenance', label: 'Maintenance' }, { id: 'depreciation', label: 'Depreciation' }, { id: 'disposals', label: 'Disposals' }]} active={tab} onChange={setTab} />
      {tab === 'register' && <Register can={can} />}
      {tab === 'maintenance' && <Maintenance canWrite={can('assets', 'EDIT')} />}
      {tab === 'depreciation' && <Depreciation canPost={can('assets', 'EDIT')} />}
      {tab === 'disposals' && <Disposals />}
    </div>
  );
}
