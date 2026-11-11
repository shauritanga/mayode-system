'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { Clock, LayoutList, Package, Percent, Sprout, Tractor, Users, Warehouse } from 'lucide-react';
import Modal from '@/components/Modal';
import MoneyInput from '@/components/MoneyInput';
import { accountingApi, chargesApi, duesApi, machineryApi } from '@/lib/api';
import { FarmInputsPanel, RiceTypesPanel } from './farm-setup';
import { Field, LoadError, Notice, TableSkeleton, errMsg, titleCase, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const KIND_WORDS: Record<string, string> = { LEVY: 'Levy', MEMBERSHIP_FEE: 'Membership fee', CANAL_CLEANING: 'Canal cleaning / water', OTHER: 'Other' };

type Section = 'overview' | 'levies' | 'tools' | 'warehouse' | 'penalties' | 'tax' | 'rice' | 'inputs';
const SECTIONS: { id: Section; slug: string; label: string; description: string; icon: typeof Users }[] = [
  { id: 'overview', slug: 'overview', label: 'Price list', description: 'Every amount your AMCOS charges, on one page.', icon: LayoutList },
  { id: 'levies', slug: 'membership-levies', label: 'Membership & levies', description: 'What farmers pay the AMCOS: membership fee, levies and canal cleaning.', icon: Users },
  { id: 'tools', slug: 'tools-machines', label: 'Tools & machines', description: 'The machines your AMCOS has, and what tools pay to be registered and to work.', icon: Tractor },
  { id: 'warehouse', slug: 'warehouse-milling', label: 'Warehouse & milling', description: 'Fees for milling, storing and delivering rice.', icon: Warehouse },
  { id: 'penalties', slug: 'late-payments', label: 'Late payments', description: 'What happens when a farmer pays late.', icon: Clock },
  { id: 'rice', slug: 'rice-types', label: 'Rice types', description: 'The rice your farmers grow and sell. Every screen that asks for a rice type offers this list.', icon: Sprout },
  { id: 'inputs', slug: 'farm-inputs', label: 'Farm inputs', description: 'The kinds of input you give farmers, the inputs under each, and the stock you hold.', icon: Package },
  { id: 'tax', slug: 'vat', label: 'VAT & tax numbers', description: 'VAT registration and rate, and the AMCOS’s tax numbers.', icon: Percent },
];

/** One line of the price list: a charge, how it works, where it takes effect, and its amount. */
interface Row {
  key: string; name: string; how: string; usedIn: string; amount: string; on: boolean | null; section: Section; edit?: () => void;
}

// ───────────────────────── editing one charge ─────────────────────────
function EditAmountModal({ title, subtitle, unit, amount, active, graceDays, graceMax = 365, graceHint, note, onClose, onSave }: {
  title: string; subtitle: string; unit: string; amount: number | null; active?: boolean; graceDays?: number; graceMax?: number; graceHint?: string; note?: string;
  onClose: () => void; onSave: (v: { amount: number | null; active: boolean; graceDays?: number }) => Promise<void>;
}) {
  const [value, setValue] = useState(amount == null ? '' : String(amount));
  const [on, setOn] = useState(active ?? true);
  const [grace, setGrace] = useState(graceDays == null ? '' : String(graceDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await onSave({ amount: value === '' ? null : Number(value), active: on, ...(graceDays != null ? { graceDays: Number(grace || 0) } : {}) }); } catch (e) { setError(errMsg(e, 'Could not save.')); setBusy(false); }
  };
  return (
    <Modal title={title} subtitle={subtitle} onClose={() => !busy && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="amount-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="amount-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 14 }}>
        {error && <div role="alert" className="alert-box alert-danger">{error}</div>}
        <Field label={`Amount (${unit})`}>{unit.startsWith('TZS') ? <MoneyInput className="input-field" min="0" autoFocus value={value} placeholder="Not set" onChange={(e) => setValue(e.target.value)} /> : <input className="input-field" type="number" min="0" step="any" autoFocus value={value} placeholder="Not set" onChange={(e) => setValue(e.target.value)} />}</Field>
        {graceDays != null && <Field label="Grace period (days)" hint={graceHint ?? "A late payment is charged only after this many days past the due date."}><input className="input-field" type="number" min="0" max={graceMax} value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>}
        {active != null && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
            <input type="checkbox" style={{ marginTop: 3 }} checked={on} onChange={(e) => setOn(e.target.checked)} />
            <span><strong>{on ? 'Switched on' : 'Switched off'}</strong><span className="muted" style={{ display: 'block', fontSize: 12 }}>{on ? 'This charge is applied from now on.' : 'Nothing is charged while this is off.'}</span></span>
          </label>
        )}
        {note && <p className="muted" style={{ margin: 0, fontSize: 12 }}>{note}</p>}
      </form>
    </Modal>
  );
}

function NewLevyModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ name: '', category: 'LEVY', basis: 'FLAT', rate: '', season: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = f.name.trim() && Number(f.rate) > 0;
  const save = async () => {
    setBusy(true); setError('');
    try { await duesApi.createType({ name: f.name.trim(), category: f.category, basis: f.basis, rate: Number(f.rate), season: f.season.trim() || undefined }); onSaved(`“${f.name.trim()}” added.`); } catch (e) { setError(errMsg(e, 'Could not add the charge.')); setBusy(false); }
  };
  return (
    <Modal title="Add a charge" subtitle="For example an annual levy or a cleaning day. It shows on the Dues page, ready to charge your farmers." onClose={() => !busy && onClose()} width="520px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !valid} onClick={() => void save()}>{busy ? 'Saving…' : 'Add charge'}</button></>}>
      {error && <div role="alert" className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Name" wide><input className="input-field" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Annual levy" /></Field>
        <Field label="Kind"><select className="input-field" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['LEVY', 'MEMBERSHIP_FEE', 'CANAL_CLEANING', 'OTHER'].map((k) => <option key={k} value={k}>{KIND_WORDS[k]}</option>)}</select></Field>
        <Field label="How it is charged"><select className="input-field" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })}><option value="FLAT">Same amount for every farmer</option><option value="PER_HECTARE">Per hectare the farmer holds</option></select></Field>
        <Field label={f.basis === 'PER_HECTARE' ? 'Amount per hectare (TZS)' : 'Amount (TZS)'}><MoneyInput className="input-field" min="1" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        <Field label="Season (optional)"><input className="input-field" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} placeholder="e.g. 2026/27" /></Field>
      </div>
    </Modal>
  );
}

// ───────────────────────── tax details ─────────────────────────
function TaxDetailsModal({ tax, onClose, onSaved }: { tax: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ tin: tax.tin ?? '', vrn: tax.vrn ?? '', vatRegistered: !!tax.vatRegistered, vatRate: String(tax.vatRate ?? 18) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await accountingApi.updateTaxSettings({ tin: f.tin, vrn: f.vrn, vatRegistered: f.vatRegistered, vatRate: Number(f.vatRate) }); onSaved('Tax details saved.'); } catch (e) { setError(errMsg(e, 'Could not save the tax details.')); setBusy(false); }
  };
  return (
    <Modal title="Tax details" subtitle="TIN, VAT registration and the VAT rate" onClose={() => !busy && onClose()} width="520px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="tax-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="tax-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 14 }}>
        {error && <div role="alert" className="alert-box alert-danger">{error}</div>}
        <Field label="TIN (taxpayer number)"><input className="input-field" autoFocus value={f.tin} onChange={(e) => setF({ ...f, tin: e.target.value })} /></Field>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
          <input type="checkbox" style={{ marginTop: 3 }} checked={f.vatRegistered} onChange={(e) => setF({ ...f, vatRegistered: e.target.checked })} />
          <span><strong>This AMCOS is registered for VAT</strong><span className="muted" style={{ display: 'block', fontSize: 12 }}>VAT is added to invoices and bills only when this is ticked.</span></span>
        </label>
        <Field label="VRN (VAT registration number)" hint={f.vatRegistered ? 'Required for a VAT-registered AMCOS.' : undefined}><input className="input-field" value={f.vrn} onChange={(e) => setF({ ...f, vrn: e.target.value })} /></Field>
        <Field label="VAT rate (%)"><input className="input-field" type="number" min="0" max="100" step="0.01" value={f.vatRate} onChange={(e) => setF({ ...f, vatRate: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

// ───────────────────────── machine types ─────────────────────────
const COMMON_MACHINES = ['Tractor', 'Power tiller', 'Combine harvester', 'Thresher', 'Transplanter', 'Sprayer', 'Truck', 'Water pump'];

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
    <section className="table-panel" style={{ marginBottom: 20 }}>
      <div className="section-toolbar"><div><strong>Types of machine</strong><div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>When a machine is registered in Tools & Equipment, it is chosen from this list.</div></div></div>
      {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, padding: '8px 16px' }}>{error}</div>}
      {types.length === 0
        ? <div className="muted" style={{ padding: 20 }}>No machine types yet. Add the machines your AMCOS has, for example a tractor or a thresher.</div>
        : <table className="data-table"><thead><tr><th>Type</th><th className="num">Machines</th><th>Status</th><th /></tr></thead><tbody>
          {types.map((t) => {
            const editing = renaming?.id === t.id ? renaming : null;
            return (
              <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.55 }}>
                <td>{editing ? <input className="input-field" style={{ maxWidth: 260 }} autoFocus value={editing.name} onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} aria-label="Machine type name" /> : <strong>{t.name}</strong>}</td>
                <td className="num">{t.machines}</td>
                <td>{t.isActive ? <span className="badge badge-green">In use</span> : <span className="badge badge-gray">Switched off</span>}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{canEdit && (editing
                  ? <><button type="button" className="btn-secondary" onClick={() => setRenaming(null)}>Cancel</button>{' '}<button type="button" className="btn-primary" disabled={busy || editing.name.trim().length < 2} onClick={() => void run(() => machineryApi.updateType(t.id, { name: editing.name }), 'Name saved.')}>Save</button></>
                  : <><button type="button" className="btn-secondary" onClick={() => setRenaming({ id: t.id, name: t.name })}>Rename</button>{' '}
                    <button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => machineryApi.updateType(t.id, { isActive: !t.isActive }), t.isActive ? `${t.name} switched off. Existing machines keep it.` : `${t.name} switched on.`)}>{t.isActive ? 'Switch off' : 'Switch on'}</button></>)}</td>
              </tr>
            );
          })}
        </tbody></table>}
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
    </section>
  );
}

// ───────────────────────── the table every section uses ─────────────────────────
function ChargeTable({ rows, empty, showSection = false, onOpen }: { rows: Row[]; empty: string; showSection?: boolean; onOpen?: (s: Section) => void }) {
  if (!rows.length) return <div className="table-panel"><div className="muted" style={{ padding: 28, textAlign: 'center' }}>{empty}</div></div>;
  return (
    <div className="table-panel" style={{ marginBottom: 20 }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Charge</th><th>Amount</th><th>Status</th><th>Where it is used</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={{ whiteSpace: 'normal', minWidth: 200 }}><strong>{r.name}</strong><div className="muted" style={{ fontSize: 12 }}>{r.how}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}><strong>{r.amount}</strong></td>
                <td>{r.on == null ? <span className="muted">—</span> : r.on ? <span className="badge badge-green">On</span> : <span className="badge badge-gray">Off</span>}</td>
                <td className="muted" style={{ whiteSpace: 'normal', fontSize: 13 }}>{r.usedIn}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {r.edit && <button type="button" className="btn-secondary" onClick={r.edit}>Edit</button>}
                  {showSection && onOpen && !r.edit && <button type="button" className="btn-secondary" onClick={() => onOpen(r.section)}>Open</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── the page ─────────────────────────
export default function AmcosSettingsPage() {
  const params = useParams<{ slug?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const can = useCan();
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    title: string; subtitle: string; unit: string; amount: number | null; active?: boolean; graceDays?: number; graceMax?: number; graceHint?: string; note?: string;
    save: (v: { amount: number | null; active: boolean; graceDays?: number }) => Promise<void>;
  }>(null);
  const types = useApi<any[]>(() => duesApi.types({ includeInactive: 'true' }), []);
  const rates = useApi<any>(() => machineryApi.rates(), []);
  const charges = useApi<any[]>(() => chargesApi.list(), []);
  const tax = useApi<any>(() => accountingApi.taxSettings(), []);
  const machineTypes = useApi<any[]>(() => machineryApi.types({ includeInactive: 'true' }), []);
  const canCharges = can('amcos_settings', 'EDIT');
  const canDues = can('dues', 'EDIT');
  const canTools = can('machinery', 'EDIT');
  const canTax = can('accounting', 'EDIT');

  const requested = params?.slug?.[0];
  const selected = SECTIONS.find((s) => s.slug === requested) ?? SECTIONS[0];
  useEffect(() => {
    if (requested && !SECTIONS.some((s) => s.slug === requested)) router.replace('/dashboard/amcos-settings/overview');
  }, [requested, router]);
  const go = (id: Section) => router.push(`/dashboard/amcos-settings/${SECTIONS.find((s) => s.id === id)!.slug}`);

  const loading = types.loading || rates.loading || charges.loading || tax.loading || machineTypes.loading;
  const error = types.error || rates.error || charges.error || tax.error || machineTypes.error;
  const reloadAll = () => { types.reload(); rates.reload(); charges.reload(); tax.reload(); machineTypes.reload(); };
  const done = (m: string) => setMessage(m);
  const byCode = (code: string) => (charges.data ?? []).find((c) => c.code === code);

  // ───── the rows of every section ─────
  const open = (e: NonNullable<typeof editing>) => setEditing(e);
  const levyRows: Row[] = (types.data ?? []).filter((t) => t.category !== 'FERTILISER').map((t) => ({
    key: t.id, section: 'levies', name: t.name, how: `${KIND_WORDS[t.category] ?? titleCase(t.category)} · ${t.basis === 'PER_HECTARE' ? 'per hectare the farmer holds' : 'same for every farmer'}${t.season ? ` · ${t.season}` : ''}`,
    usedIn: 'Dues → Charge farmers', amount: `${tzs(Number(t.rate))}${t.basis === 'PER_HECTARE' ? ' / hectare' : ''}`, on: t.isActive,
    edit: canDues ? () => open({
      title: t.name, subtitle: 'Membership & levies', unit: t.basis === 'PER_HECTARE' ? 'TZS per hectare' : 'TZS each', amount: Number(t.rate), active: t.isActive,
      note: 'A new amount applies to farmers charged from now on. Farmers already charged keep what they were charged.',
      save: async (v) => { await duesApi.updateType(t.id, { rate: v.amount ?? undefined, isActive: v.active }); done(`${t.name} saved.`); types.reload(); setEditing(null); },
    }) : undefined,
  }));
  const toolRows: Row[] = [
    {
      key: 'reg', section: 'tools', name: 'Registration fee', how: 'Paid once by the owner of a tool that is not the AMCOS’s', usedIn: 'Tools & Equipment → registering a tool',
      amount: rates.data?.toolRegistrationFee ? tzs(rates.data.toolRegistrationFee) : 'Not set', on: null,
      edit: canTools ? () => open({ title: 'Registration fee', subtitle: 'Tools & machines', unit: 'TZS once per tool', amount: rates.data?.toolRegistrationFee ?? null, note: 'Applies to tools registered from now on. A tool can be given its own fee when it is registered.',
        save: async (v) => { await machineryApi.updateRates({ toolRegistrationFee: v.amount }); done('Registration fee saved.'); rates.reload(); setEditing(null); } }) : undefined,
    },
    {
      key: 'ha', section: 'tools', name: 'Contribution per hectare', how: 'Paid on each hectare a tool works, whoever owns it', usedIn: 'Tools & Equipment → recording a job',
      amount: rates.data?.toolFeePerHectare ? `${tzs(rates.data.toolFeePerHectare)} / hectare` : 'Not set', on: null,
      edit: canTools ? () => open({ title: 'Contribution per hectare', subtitle: 'Tools & machines', unit: 'TZS per hectare', amount: rates.data?.toolFeePerHectare ?? null, note: 'Applies to jobs recorded from now on. A tool can have its own rate instead.',
        save: async (v) => { await machineryApi.updateRates({ toolFeePerHectare: v.amount }); done('Contribution saved.'); rates.reload(); setEditing(null); } }) : undefined,
    },
  ];
  const WAREHOUSE_META: Record<string, { how: string; usedIn: string; unit: string; suffix: string }> = {
    MILLING_FEE: { how: 'Charged to a farmer when you mill their rice', usedIn: 'Mill paddy → each run for a farmer’s rice (appears in Dues)', unit: 'TZS per kg milled', suffix: ' / kg' },
    STORAGE_FEE: { how: 'Charged to a farmer for rice you keep for them', usedIn: 'Dues → Charge storage', unit: 'TZS per kg, per month', suffix: ' / kg / month' },
    DELIVERY_FEE: { how: 'Added to a customer order that is for delivery', usedIn: 'Orders & Sales → new order and invoice', unit: 'TZS per delivery', suffix: ' / delivery' },
  };
  const chargeRow = (code: string, section: Section, usedInOverride?: string): Row | null => {
    const c = byCode(code);
    if (!c) return null;
    const m = WAREHOUSE_META[code];
    return {
      key: code, section, name: c.name, how: m.how, usedIn: usedInOverride ?? m.usedIn, amount: c.amount > 0 ? `${tzs(c.amount)}${m.suffix}` : 'Not set', on: c.isActive,
      edit: canCharges ? () => open({ title: c.name, subtitle: 'Warehouse & milling', unit: m.unit, amount: c.amount, active: c.isActive, note: 'Starts switched off. Set an amount, then switch it on.',
        save: async (v) => { await chargesApi.update(code, { amount: v.amount ?? 0, isActive: v.active }); done(`${c.name} saved.`); charges.reload(); setEditing(null); } }) : undefined,
    };
  };
  const warehouseRows = ['MILLING_FEE', 'STORAGE_FEE', 'DELIVERY_FEE'].map((c) => chargeRow(c, 'warehouse')).filter((r): r is Row => !!r);
  const penaltyCharge = byCode('LATE_PENALTY');
  const penaltyRows: Row[] = penaltyCharge ? [{
    key: 'LATE_PENALTY', section: 'penalties', name: penaltyCharge.name, how: `Added to what a farmer still owes after ${penaltyCharge.graceDays} days, once a month`, usedIn: 'Dues → Apply late penalties',
    amount: penaltyCharge.amount > 0 ? `${penaltyCharge.amount}% of the amount owed` : 'Not set', on: penaltyCharge.isActive,
    edit: canCharges ? () => open({ title: penaltyCharge.name, subtitle: 'Late payments', unit: '% of the amount owed', amount: penaltyCharge.amount, active: penaltyCharge.isActive, graceDays: penaltyCharge.graceDays,
      note: 'For example 5% with a 30 day grace period: a farmer who still owes 100,000 thirty days after the due date is charged 5,000 each month. You choose when to apply it, from the Dues page.',
      save: async (v) => { await chargesApi.update('LATE_PENALTY', { amount: v.amount ?? 0, isActive: v.active, graceDays: v.graceDays }); done('Late payment penalty saved.'); charges.reload(); setEditing(null); } }) : undefined,
  }] : [];
  const defaultCharge = byCode('DEFAULT_PENALTY');
  if (defaultCharge) penaltyRows.push({
    key: 'DEFAULT_PENALTY', section: 'penalties', name: defaultCharge.name, how: `When a debt passes its due date the farmer's farms are blocked and run by the AMCOS for ${defaultCharge.graceDays} days. If it is still unpaid, the farms go to M-LAX and this penalty is added`, usedIn: 'Farms under administration',
    amount: defaultCharge.amount > 0 ? `TZS ${Number(defaultCharge.amount).toLocaleString('en-US')} once` : 'Not set', on: defaultCharge.isActive,
    edit: canCharges ? () => open({ title: defaultCharge.name, subtitle: 'Overdue debts and farms', unit: 'TZS', amount: defaultCharge.amount, active: defaultCharge.isActive, graceDays: defaultCharge.graceDays, graceMax: 30,
      graceHint: 'How many days the farmer has to pay, with the farms under AMCOS administration, before they go to M-LAX. 1 to 30.',
      note: 'When this is switched on, every morning the system finds farmers with a debt past its due date, blocks their farms from leasing and tells them by SMS. During the grace period they can pay and keep the farms, or another farmer can pay and farm them. Two days before it ends they get a last warning; then the farms go to M-LAX, this penalty is added, and the farmer receives nothing from the lease.',
      save: async (v) => { await chargesApi.update('DEFAULT_PENALTY', { amount: v.amount ?? 0, isActive: v.active, graceDays: v.graceDays }); done('Overdue-debt penalty saved.'); charges.reload(); setEditing(null); } }) : undefined,
  });
  const taxRows: Row[] = tax.data ? [
    {
      key: 'VAT', section: 'tax', name: 'VAT', how: tax.data.vatRegistered ? 'The AMCOS is registered for VAT: it is added to invoices and bills' : 'Not registered for VAT: no VAT is added', usedIn: 'Accounting → invoices, bills and the VAT return',
      amount: `${Number(tax.data.vatRate)}%`, on: tax.data.vatRegistered, edit: canTax ? () => setTaxOpen(true) : undefined,
    },
    {
      key: 'TAXNOS', section: 'tax', name: 'Tax numbers', how: 'Printed on invoices and used in the VAT return', usedIn: 'Accounting → invoices and the VAT return',
      amount: `TIN ${tax.data.tin || 'not set'} · VRN ${tax.data.vrn || 'not set'}`, on: null, edit: canTax ? () => setTaxOpen(true) : undefined,
    },
  ] : [];

  const allRows = [...levyRows, ...toolRows, ...warehouseRows, ...penaltyRows, ...taxRows];
  const counts: Record<Section, string> = {
    overview: '',
    levies: `${levyRows.length}`,
    tools: `${(machineTypes.data ?? []).filter((t) => t.isActive).length} types`,
    warehouse: `${warehouseRows.filter((r) => r.on).length} on`,
    penalties: penaltyRows[0]?.on ? 'On' : 'Off',
    tax: taxRows[0] ? (tax.data?.vatRegistered ? taxRows[0].amount : 'Not on VAT') : '',
    rice: '',
    inputs: '',
  };

  return (
    <main>
      <div className="warehouse-layout">
        <aside className="warehouse-subsidebar" aria-label="Settings sections">
          <div className="warehouse-subsidebar-heading">Settings</div>
          <nav aria-label="Settings sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const href = `/dashboard/amcos-settings/${s.slug}`;
              const active = selected.id === s.id || pathname === href;
              return (
                <Link key={s.id} href={href} aria-current={selected.id === s.id ? 'page' : undefined} className={`warehouse-nav-link ${active ? 'is-active' : ''}`}>
                  <Icon size={17} strokeWidth={1.8} /><span style={{ flex: 1 }}>{s.label}</span>
                  {counts[s.id] && <span className="muted" style={{ fontSize: 11 }}>{counts[s.id]}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="warehouse-workspace">
          <header className="warehouse-section-heading">
            <span className="warehouse-section-icon"><selected.icon size={21} /></span>
            <div><span className="warehouse-section-kicker">Settings</span><h2>{selected.label}</h2><p>{selected.description}</p></div>
          </header>

          {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
          <LoadError message={error} onRetry={reloadAll} />
          {!canCharges && !canDues && !canTools && !canTax && <p className="muted" style={{ marginTop: 0 }}>You can see these amounts but not change them.</p>}

          {loading && !charges.data ? <TableSkeleton rows={6} cols={4} /> : (
            <>
              {selected.id === 'overview' && (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>{allRows.filter((r) => r.on).length} of {allRows.filter((r) => r.on != null).length} switchable charges are on. Pick a section on the left to change an amount.</p>
                  <ChargeTable rows={allRows} empty="Nothing set up yet." showSection onOpen={go} />
                </>
              )}

              {selected.id === 'levies' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span className="muted" style={{ fontSize: 13 }}>Farmers are charged from the Dues page. A new amount applies to farmers charged from now on.</span>
                    {canDues && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add a charge</button>}
                  </div>
                  <ChargeTable rows={levyRows} empty="No charges yet. Add your membership fee, annual levy or canal cleaning charge." />
                </>
              )}

              {selected.id === 'tools' && (
                <>
                  <MachineTypes types={machineTypes.data ?? []} canEdit={canTools} onChanged={(m) => { done(m); machineTypes.reload(); }} />
                  <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Tool fees</h3>
                  <ChargeTable rows={toolRows} empty="" />
                </>
              )}

              {selected.id === 'rice' && <RiceTypesPanel canEdit={canCharges} onChanged={done} />}
              {selected.id === 'inputs' && <FarmInputsPanel canEdit={canCharges} onChanged={done} />}
              {selected.id === 'warehouse' && <ChargeTable rows={warehouseRows} empty="Not available." />}
              {selected.id === 'penalties' && (
                <>
                  <ChargeTable rows={penaltyRows} empty="Not available." />
                  <p className="muted" style={{ fontSize: 13 }}>When it is on, open <Link href="/dashboard/dues">Dues</Link> and choose “Apply late penalties” to see who is late and what they would be charged before anything happens.</p>
                </>
              )}
              {selected.id === 'tax' && (
                <>
                  <ChargeTable rows={taxRows} empty="Not available." />
                </>
              )}
            </>
          )}
        </section>
      </div>

      {taxOpen && tax.data && <TaxDetailsModal tax={tax.data} onClose={() => setTaxOpen(false)} onSaved={(m) => { setTaxOpen(false); done(m); tax.reload(); }} />}
      {adding && <NewLevyModal onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); done(m); types.reload(); }} />}
      {editing && <EditAmountModal title={editing.title} subtitle={editing.subtitle} unit={editing.unit} amount={editing.amount} active={editing.active} graceDays={editing.graceDays} graceMax={editing.graceMax} graceHint={editing.graceHint} note={editing.note} onClose={() => setEditing(null)} onSave={editing.save} />}
    </main>
  );
}
