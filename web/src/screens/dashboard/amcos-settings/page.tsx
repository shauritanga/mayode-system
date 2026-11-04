'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { accountingApi, chargesApi, duesApi, machineryApi } from '@/lib/api';
import {
  Field, LoadError, Notice, PageHeader, TableSkeleton, errMsg, titleCase, useApi, useCan,
} from '@/screens/dashboard/irrigation/ui';

const BASIS_WORDS: Record<string, string> = { FLAT: 'each farmer pays this once', PER_HECTARE: 'per hectare the farmer holds', PER_KG: 'per kilogram', PERCENT: 'percent' };
const KIND_WORDS: Record<string, string> = { LEVY: 'Levy', MEMBERSHIP_FEE: 'Membership fee', CANAL_CLEANING: 'Canal cleaning / water', OTHER: 'Other' };

/** One charge: what it is, where it is used, and its amount with an on/off switch. The save button appears only after a change. */
function ChargeRow({ name, how, usedIn, unit, amount, active, canEdit, extra, onSave, saveLocked }: {
  name: string; how: string; usedIn: string; unit: string; amount: number | null; active?: boolean; canEdit: boolean; extra?: React.ReactNode;
  onSave: (v: { amount: number | null; active: boolean }) => Promise<void>; saveLocked?: string;
}) {
  const [value, setValue] = useState(amount == null ? '' : String(amount));
  const [on, setOn] = useState(active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = value !== (amount == null ? '' : String(amount)) || (active != null && on !== active);
  const save = async () => {
    setBusy(true); setError('');
    try { await onSave({ amount: value === '' ? null : Number(value), active: on }); } catch (e) { setError(errMsg(e, 'Could not save.')); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(200px, 1fr)', gap: 16, padding: '14px 16px', borderTop: '1px solid var(--neutral-100)', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div className="muted" style={{ fontSize: 12 }}>{how}</div>
        <div className="muted" style={{ fontSize: 12 }}>Used in: {usedIn}</div>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 12, marginTop: 4 }}>{error}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input-field" style={{ width: 130 }} type="number" min="0" step="any" aria-label={`${name} amount`} disabled={!canEdit} value={value} placeholder="Not set" onChange={(e) => setValue(e.target.value)} />
        <span className="muted" style={{ fontSize: 12 }}>{unit}</span>
        {active != null && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" disabled={!canEdit} checked={on} onChange={(e) => setOn(e.target.checked)} />{on ? 'On' : 'Off'}</label>}
        {extra}
        {canEdit && changed && <button type="button" className="btn-primary" disabled={busy || !!saveLocked} title={saveLocked} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>}
      </div>
    </div>
  );
}

function Card({ title, subtitle, children, action }: { title: string; subtitle: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="table-panel" style={{ marginBottom: 20 }}>
      <div className="section-toolbar" style={{ alignItems: 'flex-start' }}>
        <div><strong>{title}</strong><div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{subtitle}</div></div>
        {action}
      </div>
      {children}
    </section>
  );
}


const COMMON_MACHINES = ['Tractor', 'Power tiller', 'Combine harvester', 'Thresher', 'Transplanter', 'Sprayer', 'Truck', 'Water pump'];

/** The kinds of machine this AMCOS has. Tools & Equipment offers exactly this list when a machine is registered. */
function MachineTypes({ types, canEdit, onChanged }: { types: any[]; canEdit: boolean; onChanged: (message: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError('');
    try { await fn(); setName(''); setRenaming(null); onChanged(message); } catch (e) { setError(errMsg(e, 'Could not save.')); } finally { setBusy(false); }
  };
  const have = new Set(types.filter((t) => t.isActive).map((t) => t.name.toLowerCase()));
  const suggestions = COMMON_MACHINES.filter((m) => !have.has(m.toLowerCase()));
  return (
    <Card title="Machines & tools" subtitle="The kinds of machine your AMCOS has. When someone registers a machine in Tools & Equipment, they choose from this list.">
      {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, padding: '8px 16px' }}>{error}</div>}
      {types.length === 0
        ? <div className="muted" style={{ padding: 20 }}>No machine types yet. Add the machines your AMCOS has, for example a tractor or a thresher.</div>
        : types.map((t) => {
          const editing = renaming?.id === t.id ? renaming : null;
          return (
          <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--neutral-100)', opacity: t.isActive ? 1 : 0.55 }}>
            {editing
              ? <input className="input-field" style={{ maxWidth: 260 }} autoFocus value={editing.name} onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} aria-label="Machine type name" />
              : <div><strong>{t.name}</strong> <span className="muted" style={{ fontSize: 12 }}>· {t.machines} {t.machines === 1 ? 'machine' : 'machines'}{t.isActive ? '' : ' · switched off'}</span></div>}
            {canEdit && <span style={{ display: 'flex', gap: 8 }}>
              {editing
                ? <><button type="button" className="btn-secondary" onClick={() => setRenaming(null)}>Cancel</button><button type="button" className="btn-primary" disabled={busy || editing.name.trim().length < 2} onClick={() => void run(() => machineryApi.updateType(t.id, { name: editing.name }), 'Name saved.')}>Save</button></>
                : <><button type="button" className="btn-secondary" onClick={() => setRenaming({ id: t.id, name: t.name })}>Rename</button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => machineryApi.updateType(t.id, { isActive: !t.isActive }), t.isActive ? `${t.name} switched off. Existing machines keep it.` : `${t.name} switched on.`)}>{t.isActive ? 'Switch off' : 'Switch on'}</button></>}
            </span>}
          </div>
          );
        })}
      {canEdit && (
        <div style={{ padding: 16, borderTop: '1px solid var(--neutral-100)', display: 'grid', gap: 10 }}>
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void run(() => machineryApi.createType(name), `${name.trim()} added.`); }}>
            <input className="input-field" style={{ maxWidth: 280 }} placeholder="Add a type, e.g. Water pump" value={name} onChange={(e) => setName(e.target.value)} aria-label="New machine type" />
            <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 2}>Add</button>
          </form>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>Common machines:</span>
              {suggestions.map((m) => <button key={m} type="button" className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy} onClick={() => void run(() => machineryApi.createType(m), `${m} added.`)}>+ {m}</button>)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function NewLevyModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ name: '', category: 'LEVY', basis: 'FLAT', rate: '', season: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = f.name.trim() && Number(f.rate) > 0;
  const save = async () => {
    setBusy(true); setError('');
    try { await duesApi.createType({ name: f.name.trim(), category: f.category, basis: f.basis, rate: Number(f.rate), season: f.season.trim() || undefined }); onSaved(`“${f.name.trim()}” added.`); } catch (e) { setError(errMsg(e, 'Could not add the charge.')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add a charge" subtitle="For example an annual levy or a cleaning day. It shows on the Dues page, ready to charge your farmers." onClose={() => !busy && onClose()} width="520px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !valid} onClick={() => void save()}>{busy ? 'Saving…' : 'Add charge'}</button></>}>
      {error && <div role="alert" className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Name" wide><input className="input-field" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Annual levy" /></Field>
        <Field label="Kind"><select className="input-field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['LEVY', 'MEMBERSHIP_FEE', 'CANAL_CLEANING', 'OTHER'].map((k) => <option key={k} value={k}>{KIND_WORDS[k]}</option>)}</select></Field>
        <Field label="How it is charged"><select className="input-field" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })}><option value="FLAT">Same amount for every farmer</option><option value="PER_HECTARE">Per hectare the farmer holds</option></select></Field>
        <Field label={f.basis === 'PER_HECTARE' ? 'Amount per hectare (TZS)' : 'Amount (TZS)'}><input className="input-field" type="number" min="1" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        <Field label="Season (optional)"><input className="input-field" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} placeholder="e.g. 2026/27" /></Field>
      </div>
    </Modal>
  );
}

export default function AmcosSettingsPage() {
  const can = useCan();
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const types = useApi<any[]>(() => duesApi.types({ includeInactive: 'true' }), []);
  const rates = useApi<any>(() => machineryApi.rates(), []);
  const machineTypes = useApi<any[]>(() => machineryApi.types({ includeInactive: 'true' }), []);
  const charges = useApi<any[]>(() => chargesApi.list(), []);
  const tax = useApi<any>(() => accountingApi.taxSettings(), []);
  const canCharges = can('amcos_settings', 'EDIT');
  const canDues = can('dues', 'EDIT');
  const canTools = can('machinery', 'EDIT');
  const canTax = can('accounting', 'EDIT');
  const byCode = (code: string) => (charges.data ?? []).find((c) => c.code === code);
  const done = (m: string) => setMessage(m);
  const loading = types.loading || rates.loading || charges.loading || tax.loading;
  const error = types.error || rates.error || charges.error || tax.error || machineTypes.error;

  const saveCharge = (code: string, label: string, extra: object = {}) => async (v: { amount: number | null; active: boolean }) => {
    await chargesApi.update(code, { amount: v.amount ?? 0, isActive: v.active, ...extra });
    done(`${label} saved. It applies from now on.`);
    charges.reload();
  };

  if (loading && !charges.data) return <><PageHeader title="Charges & Settings" subtitle="Set every charge your AMCOS makes in one place." /><TableSkeleton rows={8} cols={2} /></>;

  return (
    <>
      <PageHeader title="Charges & Settings" subtitle="Set every charge your AMCOS makes, once. Dues, tools, orders and the warehouse all take their amounts from here." />
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={() => { types.reload(); rates.reload(); charges.reload(); tax.reload(); machineTypes.reload(); }} />
      {!canCharges && <p className="muted" style={{ marginTop: 0 }}>You can see these amounts but not change them.</p>}

      <Card title="Membership & levies" subtitle="Charged to your farmers from the Dues page. A new amount applies to farmers charged from now on; what was already charged does not change."
        action={canDues && <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>Add a charge</button>}>
        {(types.data ?? []).filter((t) => t.category !== 'FERTILISER').length === 0
          ? <div className="muted" style={{ padding: 20 }}>No charges yet. Add your membership fee, annual levy or canal cleaning charge.</div>
          : (types.data ?? []).filter((t) => t.category !== 'FERTILISER').map((t) => (
            <ChargeRow key={`${t.id}-${t.rate}-${t.isActive}`} name={t.name} how={`${KIND_WORDS[t.category] ?? titleCase(t.category)} · ${BASIS_WORDS[t.basis]}${t.season ? ` · ${t.season}` : ''}`}
              usedIn="Dues → Charge farmers" unit={t.basis === 'PER_HECTARE' ? 'TZS per hectare' : 'TZS each'} amount={Number(t.rate)} active={t.isActive} canEdit={canDues}
              onSave={async (v) => { await duesApi.updateType(t.id, { rate: v.amount ?? undefined, isActive: v.active }); done(`${t.name} saved. It applies to farmers charged from now on.`); types.reload(); }} />
          ))}
      </Card>

      <MachineTypes types={machineTypes.data ?? []} canEdit={canTools} onChanged={(m) => { done(m); machineTypes.reload(); }} />

      <Card title="Tool fees" subtitle="For machines and tools registered with your AMCOS. A tool can still have its own rate; this is the standard.">
        <ChargeRow key={`reg-${rates.data?.toolRegistrationFee}`} name="Registration fee" how="Paid once by the owner of a tool that is not the AMCOS's" usedIn="Tools & Equipment → registering a tool" unit="TZS once"
          amount={rates.data?.toolRegistrationFee ?? null} canEdit={canTools}
          onSave={async (v) => { await machineryApi.updateRates({ toolRegistrationFee: v.amount }); done('Registration fee saved. It applies to tools registered from now on.'); rates.reload(); }} />
        <ChargeRow key={`ha-${rates.data?.toolFeePerHectare}`} name="Contribution per hectare" how="Paid on each hectare a tool works, whoever owns it" usedIn="Tools & Equipment → recording a job" unit="TZS per hectare"
          amount={rates.data?.toolFeePerHectare ?? null} canEdit={canTools}
          onSave={async (v) => { await machineryApi.updateRates({ toolFeePerHectare: v.amount }); done('Contribution saved. It applies to jobs recorded from now on.'); rates.reload(); }} />
      </Card>

      <Card title="Warehouse & milling" subtitle="Fees for the services your warehouse gives. Each starts switched off; turn one on once you have set its amount.">
        {(['MILLING_FEE', 'STORAGE_FEE', 'DELIVERY_FEE'] as const).map((code) => {
          const c = byCode(code);
          if (!c) return null;
          const meta = {
            MILLING_FEE: { how: 'Charged to a farmer when you mill their rice', usedIn: 'Mill paddy → each run for a farmer’s rice (appears in Dues)', unit: 'TZS per kg milled' },
            STORAGE_FEE: { how: 'Charged to a farmer for rice you keep for them', usedIn: 'Dues → Charge storage for a month', unit: 'TZS per kg, per month' },
            DELIVERY_FEE: { how: 'Added to a customer order that is for delivery', usedIn: 'Orders & Sales → new order, invoice', unit: 'TZS per delivery' },
          }[code];
          return <ChargeRow key={`${code}-${c.amount}-${c.isActive}`} name={c.name} how={meta.how} usedIn={meta.usedIn} unit={meta.unit} amount={c.amount} active={c.isActive} canEdit={canCharges}
            onSave={saveCharge(code, c.name)} />;
        })}
      </Card>

      <Card title="Penalties & tax" subtitle="What happens when payment is late, and the VAT rate on your sales and purchases.">
        {byCode('LATE_PENALTY') && (() => {
          const c = byCode('LATE_PENALTY');
          return <ChargeRow key={`pen-${c.amount}-${c.isActive}-${c.graceDays}`} name={c.name} how="Added to what a farmer still owes after the grace days, once a month" usedIn="Dues → Apply late penalties" unit="% of the amount owed" amount={c.amount} active={c.isActive} canEdit={canCharges}
            extra={<GraceDays value={c.graceDays} disabled={!canCharges} onChange={(g) => void chargesApi.update('LATE_PENALTY', { graceDays: g }).then(() => { done('Grace days saved.'); charges.reload(); }).catch((e) => setMessage(errMsg(e, 'Could not save.')))} />}
            onSave={saveCharge('LATE_PENALTY', c.name)} />;
        })()}
        <ChargeRow key={`vat-${tax.data?.vatRate}`} name="VAT rate" how={tax.data?.vatRegistered ? 'Added to your invoices and bills' : 'Used once your AMCOS is registered for VAT'} usedIn="Accounting → invoices, bills, VAT return"
          unit="%" amount={tax.data ? Number(tax.data.vatRate) : null} canEdit={canTax}
          extra={<Link href="/dashboard/accounting/tax-compliance/tax-settings" className="muted" style={{ fontSize: 12 }}>TIN, VRN and VAT registration →</Link>}
          onSave={async (v) => { await accountingApi.updateTaxSettings({ vatRate: v.amount ?? 0 }); done('VAT rate saved.'); tax.reload(); }} />
      </Card>

      {adding && <NewLevyModal onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); done(m); types.reload(); }} />}
    </>
  );
}

function GraceDays({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (days: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      after
      <input className="input-field" style={{ width: 64 }} type="number" min="0" max="365" disabled={disabled} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== String(value) && v !== '') onChange(Number(v)); }} aria-label="Grace days" />
      days
    </label>
  );
}
