'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { MoneyAccountSelect } from '@/screens/dashboard/accounting/controls';
import { chargesApi, communicationsApi, duesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, Filters, FormGrid, LoadError, Notice, PageHeader, Pager, StatCard, TableSkeleton, Tabs,
  errMsg, fmtDate, titleCase, todayISO, useApi, useCan, useDebounced,
} from '@/screens/dashboard/irrigation/ui';

const CATEGORY_LABEL: Record<string, string> = { LEVY: 'Levy', MEMBERSHIP_FEE: 'Membership fee', CANAL_CLEANING: 'Canal cleaning', FERTILISER: 'Fertiliser', OTHER: 'Other' };
const CHARGE_CATEGORIES = ['LEVY', 'MEMBERSHIP_FEE', 'CANAL_CLEANING', 'OTHER'];
const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', MOBILE_MONEY: 'Mobile money', BANK: 'Bank', HARVEST_DEDUCTION: 'Deducted from harvest payment' };
const STATE_LABEL: Record<string, string> = { OPEN: 'Not paid', PARTIAL: 'Part paid', PAID: 'Paid', CANCELLED: 'Cancelled' };
const STATE_TONE: Record<string, string> = { OPEN: 'badge-gold', PARTIAL: 'badge-blue', PAID: 'badge-green', CANCELLED: 'badge-gray' };
const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const cat = (v?: string) => CATEGORY_LABEL[v ?? ''] ?? titleCase(v);
const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '');
const errBox = (m: string) => m && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{m}</div>;

function Footer({ onClose, saving, form, label }: { onClose: () => void; saving: boolean; form: string; label: string }) {
  return <><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form={form} className="btn-primary" disabled={saving}>{saving ? 'Saving…' : label}</button></>;
}

/** Searchable dropdown of the AMCOS's farmers: opens on click, narrows as you type, picks with the mouse or arrow keys. */
function FarmerPicker({ value, onChange, error }: { value: any; onChange: (f: any) => void; error?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const term = useDebounced(q.trim(), 250);
  const found = useApi<any[]>(open ? () => duesApi.farmers(term) : null, [term, open]);
  const list = found.data ?? [];
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const pick = (f: any) => { onChange(f); setOpen(false); setQ(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <Field label="Farmer *" error={error}>
      <div ref={box} style={{ position: 'relative' }}>
        <input className="input-field" role="combobox" aria-controls="farmer-picker-list" aria-expanded={open} aria-autocomplete="list" autoComplete="off"
          value={open ? q : value ? `${value.name} · ${value.memberNumber}` : ''}
          placeholder={value ? `${value.name} · ${value.memberNumber}` : 'Select or search a farmer'}
          onFocus={() => { setOpen(true); setActive(0); }} onClick={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey}
          style={{ cursor: 'pointer', paddingRight: 34 }} />
        <span aria-hidden style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.6, fontSize: 11 }}>▾</span>
        {open && (
          <div id="farmer-picker-list" role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 260, overflowY: 'auto', background: 'var(--surface-1, #111613)', border: '1px solid var(--border-subtle, #2a2f2c)', borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,.35)' }}>
            {found.loading && !list.length ? <div className="muted" style={{ padding: 12, fontSize: 13 }}>Loading farmers…</div>
              : !list.length ? <div className="muted" style={{ padding: 12, fontSize: 13 }}>{term ? 'No farmer of your AMCOS matches.' : 'No farmers registered yet.'}</div>
              : list.map((f, i) => (
                <button key={f.id} type="button" role="option" aria-selected={value?.id === f.id} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(f)}
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 12px', border: 0, borderBottom: '1px solid var(--border-subtle, #2a2f2c)', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', background: i === active ? 'rgba(127,127,127,.14)' : 'none' }}>
                  <span><strong style={{ fontSize: 13.5 }}>{f.name}</strong><span className="muted" style={{ display: 'block', fontSize: 12 }}>{f.memberNumber}{f.phone ? ` · ${f.phone}` : ''}</span></span>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{f.hectares} ha</span>
                </button>
              ))}
            {list.length >= 20 && <div className="muted" style={{ padding: '8px 12px', fontSize: 12 }}>Type to narrow the list…</div>}
          </div>
        )}
      </div>
    </Field>
  );
}

function PayModal({ due, onClose, onSaved }: { due: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [form, setForm] = useState({ amount: String(due.balance), paidOn: todayISO(), method: 'CASH', cashAccountId: '', reference: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) { setError('Enter the amount paid'); return; }
    if (amount > due.balance) { setError(`Only ${tzs(due.balance)} is still owed`); return; }
    if (form.paidOn > todayISO()) { setError('The payment date cannot be in the future'); return; }
    setSaving(true); setError('');
    try {
      const p: any = (await duesApi.pay(due.id, { amount, paidOn: form.paidOn, method: form.method, cashAccountId: form.cashAccountId || undefined, reference: form.reference.trim() || undefined, note: form.note.trim() || undefined })).data;
      onSaved(`Payment recorded. Receipt ${p.receiptNo}.`);
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Record payment" subtitle={`${due.farmer.name} · ${due.description} · owes ${tzs(due.balance)}`} onClose={() => !saving && onClose()} width="520px"
      footer={<Footer onClose={onClose} saving={saving} form="pay-form" label="Record payment" />}>
      <form id="pay-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Amount (TZS) *"><input type="number" min="1" className="input-field" value={form.amount} onChange={(e) => set('amount', e.target.value)} autoFocus /></Field>
          <Field label="Date"><input type="date" className="input-field" max={todayISO()} min={day(due.issuedOn)} value={form.paidOn} onChange={(e) => set('paidOn', e.target.value)} /></Field>
          <Field label="Paid by"><select className="input-field" value={form.method} onChange={(e) => set('method', e.target.value)}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          {form.method !== 'HARVEST_DEDUCTION' && <MoneyAccountSelect label="Received into" value={form.cashAccountId} onChange={(id) => set('cashAccountId', id)} defaultKind={form.method as 'CASH' | 'BANK' | 'MOBILE_MONEY'} />}
          <Field label="Reference" hint="Mobile money or bank reference"><input className="input-field" value={form.reference} onChange={(e) => set('reference', e.target.value)} /></Field>
          <Field label="Note" wide><input className="input-field" value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
        </FormGrid>
        {errBox(error)}
      </form>
    </Modal>
  );
}

function ChargeFarmerModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [farmer, setFarmer] = useState<any>(null);
  const [form, setForm] = useState({ category: 'LEVY', description: '', amount: '', dueDate: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const save = async () => {
    const found: Record<string, string> = {};
    if (!farmer) found.farmer = 'Choose the farmer';
    if (!form.description.trim()) found.description = 'Say what this is for';
    if (!(Number(form.amount) > 0)) found.amount = 'Enter the amount';
    if (form.dueDate && form.dueDate < todayISO()) found.dueDate = 'Cannot be in the past';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    try { await duesApi.create({ farmerId: farmer.id, category: form.category, description: form.description.trim(), amount: Number(form.amount), dueDate: form.dueDate || undefined }); onSaved('Charge added.'); } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Charge one farmer" subtitle="For a single farmer. To charge everyone, use the Charges tab." onClose={() => !saving && onClose()} width="520px"
      footer={<Footer onClose={onClose} saving={saving} form="due-form" label="Add charge" />}>
      <form id="due-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <div style={{ display: 'grid', gap: 12 }}>
          <FarmerPicker value={farmer} onChange={setFarmer} error={errors.farmer} />
          <FormGrid>
            <Field label="Kind"><select className="input-field" value={form.category} onChange={(e) => set('category', e.target.value)}>{CHARGE_CATEGORIES.map((c) => <option key={c} value={c}>{cat(c)}</option>)}</select></Field>
            <Field label="Amount (TZS) *" error={errors.amount}><input type="number" min="1" className="input-field" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
            <Field label="What for *" error={errors.description} wide><input className="input-field" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <Field label="Pay by" error={errors.dueDate}><input type="date" className="input-field" min={todayISO()} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
          </FormGrid>
        </div>
        {errBox(error)}
      </form>
    </Modal>
  );
}

function FertiliserModal({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const [farmer, setFarmer] = useState<any>(null);
  const [form, setForm] = useState({ itemName: '', quantity: '', unit: 'bags', unitPrice: '', issuedOn: todayISO(), dueDate: '', postToLedger: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const total = Math.round((Number(form.quantity) || 0) * (Number(form.unitPrice) || 0) * 100) / 100;
  const save = async () => {
    const found: Record<string, string> = {};
    if (!farmer) found.farmer = 'Choose the farmer';
    if (!form.itemName.trim()) found.itemName = 'Which fertiliser?';
    if (!(Number(form.quantity) > 0)) found.quantity = 'Enter the quantity';
    if (!(Number(form.unitPrice) > 0)) found.unitPrice = 'Enter the price';
    if (form.issuedOn > todayISO()) found.issuedOn = 'Cannot be in the future';
    if (form.dueDate && form.dueDate < form.issuedOn) found.dueDate = 'Cannot be before the issue date';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    try {
      await duesApi.issueFertiliser({ farmerId: farmer.id, itemName: form.itemName.trim(), quantity: Number(form.quantity), unit: form.unit.trim() || undefined, unitPrice: Number(form.unitPrice), issuedOn: form.issuedOn, dueDate: form.dueDate || undefined, postToLedger: form.postToLedger });
      onSaved('Fertiliser recorded as a debt.');
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Issue fertiliser on credit" subtitle="The farmer repays in cash or from their harvest payment." onClose={() => !saving && onClose()} width="560px"
      footer={<Footer onClose={onClose} saving={saving} form="fert-form" label="Record" />}>
      <form id="fert-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <div style={{ display: 'grid', gap: 12 }}>
          <FarmerPicker value={farmer} onChange={setFarmer} error={errors.farmer} />
          <FormGrid>
            <Field label="Fertiliser *" error={errors.itemName}><input className="input-field" value={form.itemName} onChange={(e) => set('itemName', e.target.value)} placeholder="e.g. Urea" /></Field>
            <Field label="Date issued"><input type="date" className="input-field" max={todayISO()} value={form.issuedOn} onChange={(e) => set('issuedOn', e.target.value)} /></Field>
            <Field label="Quantity *" error={errors.quantity}><input type="number" min="0.01" step="0.01" className="input-field" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
            <Field label="Unit"><input className="input-field" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
            <Field label="Price per unit (TZS) *" error={errors.unitPrice}><input type="number" min="1" className="input-field" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} /></Field>
            <Field label="Repay by" error={errors.dueDate}><input type="date" className="input-field" min={form.issuedOn} value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
          </FormGrid>
          <div style={{ fontSize: 14 }}>Total owed: <strong>{tzs(total)}</strong></div>
          <label className="form-label" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <input type="checkbox" checked={form.postToLedger} onChange={(e) => set('postToLedger', e.target.checked)} />
            <span>Record in the accounts as fertiliser sold on credit. Untick for fertiliser issued before your books started.</span>
          </label>
        </div>
        {errBox(error)}
      </form>
    </Modal>
  );
}

function DueDetail({ id, can, onClose, onChanged }: { id: string; can: (r: string, a: string) => boolean; onClose: () => void; onChanged: () => void }) {
  const { data: d, loading, error, reload } = useApi<any>(() => duesApi.get(id), [id]);
  const [sub, setSub] = useState<'pay' | 'waive' | 'cancel' | { void: any } | null>(null);
  const [message, setMessage] = useState('');
  const done = (m: string) => { setSub(null); setMessage(m); reload(); onChanged(); };
  const live = d && d.state !== 'CANCELLED';
  return (
    <Modal title={d ? `${d.farmer.name} · ${d.description}` : 'Due'} onClose={onClose} width="680px"
      footer={d && live ? (
        <>
          {can('dues', 'DELETE') && <button type="button" className="btn-secondary" onClick={() => setSub('cancel')} disabled={d.paid > 0}>Cancel charge</button>}
          {can('dues', 'DELETE') && <button type="button" className="btn-secondary" onClick={() => setSub('waive')} disabled={d.balance <= 0}>Waive</button>}
          {can('dues', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setSub('pay')} disabled={d.balance <= 0}>Record payment</button>}
        </>
      ) : undefined}>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {loading && !d ? <TableSkeleton rows={3} cols={3} /> : d && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="metric-grid">
            <StatCard label="Charged" value={tzs(d.amount)} />
            <StatCard label="Paid" value={tzs(d.paid)} tone="good" />
            <StatCard label="Balance" value={tzs(d.balance)} tone={d.overdue ? 'warn' : undefined} hint={d.dueDate ? `${d.overdue ? 'Was due' : 'Due'} ${fmtDate(d.dueDate)}` : undefined} />
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {cat(d.category)}{d.hectares != null ? ` · ${d.hectares} ha` : ''}{d.quantity != null ? ` · ${d.quantity} ${d.unit} at ${tzs(d.unitPrice)}` : ''} · charged {fmtDate(d.issuedOn)}
            {d.waivedAmount > 0 && <> · waived {tzs(d.waivedAmount)} ({d.waivedReason})</>}
            {d.state === 'CANCELLED' && <> · cancelled ({d.cancelReason})</>}
          </div>
          <section>
            <strong>Payments</strong>
            {!d.payments.length ? <p className="muted" style={{ fontSize: 13 }}>No payment yet.</p> : (
              <table className="data-table">
                <thead><tr><th>Receipt</th><th>Date</th><th>Paid by</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>
                  {d.payments.map((p: any) => (
                    <tr key={p.id} style={p.voidedAt ? { opacity: 0.55 } : undefined}>
                      <td>{p.receiptNo}{p.reference && <div className="muted" style={{ fontSize: 11 }}>{p.reference}</div>}</td>
                      <td>{fmtDate(p.paidOn)}</td><td>{METHOD_LABEL[p.method]}</td>
                      <td className="num" style={p.voidedAt ? { textDecoration: 'line-through' } : undefined}>{tzs(p.amount)}</td>
                      <td>{p.voidedAt ? <span className="badge badge-gray" title={p.voidReason}>Void</span> : can('dues', 'DELETE') && <button type="button" className="btn-secondary" onClick={() => setSub({ void: p })}>Void</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
      {d && sub === 'pay' && <PayModal due={d} onClose={() => setSub(null)} onSaved={done} />}
      {d && sub === 'waive' && (
        <ConfirmDialog title="Waive the balance" confirmLabel="Waive" askReason reasonLabel="Why is it waived?"
          body={<>{d.farmer.name} will no longer owe the remaining <strong>{tzs(d.balance)}</strong>. This is kept on record with your reason.</>}
          onConfirm={async (reason) => { await duesApi.waive(d.id, { reason }); done('Balance waived.'); }} onClose={() => setSub(null)} />
      )}
      {d && sub === 'cancel' && (
        <ConfirmDialog title="Cancel this charge" confirmLabel="Cancel charge" danger askReason reasonLabel="Why is it cancelled?"
          body={<>Cancel <strong>{d.description}</strong> for {d.farmer.name}? It stops counting as owed. The record stays.</>}
          onConfirm={async (reason) => { await duesApi.cancel(d.id, reason); done('Charge cancelled.'); }} onClose={() => setSub(null)} />
      )}
      {d && sub && typeof sub === 'object' && 'void' in sub && (
        <ConfirmDialog title={`Void receipt ${sub.void.receiptNo}`} confirmLabel="Void payment" danger askReason reasonLabel="Why is it voided?"
          body={<>The {tzs(sub.void.amount)} payment stops counting and the amount is owed again. The receipt stays on record, marked void.</>}
          onConfirm={async (reason) => { await duesApi.voidPayment(sub.void.id, reason); done('Payment voided.'); }} onClose={() => setSub(null)} />
      )}
    </Modal>
  );
}

function Dues({ can }: { can: (r: string, a: string) => boolean }) {
  const [filters, setFilters] = useState({ q: '', category: '', state: '' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<'due' | 'fertiliser' | null>(null);
  const [message, setMessage] = useState('');
  const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 15 };
  const { data, loading, error, reload } = useApi<any>(() => duesApi.list(params), [JSON.stringify(filters), page]);
  const setFilter = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const t = data?.totals;
  const filtered = Object.values(filters).some(Boolean);
  const buttons = can('dues', 'CREATE') ? (
    <span style={{ display: 'flex', gap: 8 }}>
      <button type="button" className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => setForm('fertiliser')}>Issue fertiliser</button>
      <button type="button" className="btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={() => setForm('due')}>Charge a farmer</button>
    </span>
  ) : undefined;
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div className="metric-grid" style={{ marginBottom: 12 }}>
        <StatCard label="Charged" value={t ? tzs(t.charged) : '—'} hint={filtered ? 'For the filters below' : undefined} />
        <StatCard label="Collected" value={t ? tzs(t.collected) : '—'} tone="good" />
        <StatCard label="Still owed" value={t ? tzs(t.outstanding) : '—'} />
        <StatCard label="Overdue" value={t ? tzs(t.overdue) : '—'} tone={t?.overdue ? 'warn' : undefined} />
      </div>
      <section className="table-panel">
        <div className="section-toolbar"><strong>What farmers owe</strong>{buttons}</div>
        <Filters>
          <Field label="Search"><input className="input-field" placeholder="Farmer, member number or charge" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Field>
          <Field label="Kind"><select className="input-field" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}><option value="">All</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Status"><select className="input-field" value={filters.state} onChange={(e) => setFilter('state', e.target.value)}><option value="">All</option><option value="OPEN">Not paid</option><option value="PARTIAL">Part paid</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option></select></Field>
        </Filters>
        {loading && !data ? <TableSkeleton cols={7} /> : !data?.data.length ? (
          <Empty title={filtered ? 'Nothing matches these filters' : 'No charges yet'} hint={filtered ? undefined : 'Set up your levies and fees in the Charges tab, then charge your farmers.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Farmer</th><th>What</th><th className="num">Charged</th><th className="num">Paid</th><th className="num">Balance</th><th>Pay by</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.data.map((d: any) => (
                  <tr key={d.id} onClick={() => setOpenId(d.id)} style={{ cursor: 'pointer' }}>
                    <td><div style={{ fontWeight: 600 }}>{d.farmer.name}</div><div className="muted" style={{ fontSize: 11 }}>{d.farmer.memberNumber}</div></td>
                    <td>{d.description}<div className="muted" style={{ fontSize: 11 }}>{cat(d.category)}{d.hectares != null ? ` · ${d.hectares} ha` : ''}</div></td>
                    <td className="num">{tzs(d.amount)}</td><td className="num">{tzs(d.paid)}</td><td className="num"><strong>{tzs(d.balance)}</strong></td>
                    <td>{d.dueDate ? fmtDate(d.dueDate) : '—'}</td>
                    <td><span className={`badge ${d.overdue ? 'badge-red' : STATE_TONE[d.state]}`}>{d.overdue ? 'Overdue' : STATE_LABEL[d.state]}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>{can('dues', 'CREATE') && d.balance > 0 && d.state !== 'CANCELLED' && <PayButton due={d} onSaved={(m) => { setMessage(m); reload(); }} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {form === 'due' && <ChargeFarmerModal onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setMessage(m); reload(); }} />}
      {form === 'fertiliser' && <FertiliserModal onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setMessage(m); reload(); }} />}
      {openId && <DueDetail id={openId} can={can} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

function PayButton({ due, onSaved }: { due: any; onSaved: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Pay</button>
      {open && <PayModal due={due} onClose={() => setOpen(false)} onSaved={(m) => { setOpen(false); onSaved(m); }} />}
    </>
  );
}

function ChargeEveryone({ type, onClose, onDone }: { type: any; onClose: () => void; onDone: (m: string) => void }) {
  const { data: p, loading, error } = useApi<any>(() => duesApi.previewCharge(type.id), [type.id]);
  return (
    <ConfirmDialog title={`Charge farmers: ${type.name}`} confirmLabel={p ? `Charge ${p.farmers} farmers` : 'Charge'}
      body={loading && !p ? 'Checking who would be charged…' : error ? error : p && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div><strong>{p.farmers}</strong> farmers will be charged, <strong>{tzs(p.total)}</strong> in total.</div>
          {p.alreadyCharged > 0 && <div className="muted">{p.alreadyCharged} farmers were already charged and are skipped.</div>}
          {p.withoutHectares > 0 && <div className="muted">{p.withoutHectares} farmers hold no hectare and are skipped.</div>}
          {p.farmers === 0 && <div style={{ color: 'var(--red-400)' }}>Nobody is left to charge.</div>}
        </div>
      )}
      onConfirm={async () => { if (!p?.farmers) throw new Error('Nobody is left to charge'); const r: any = (await duesApi.charge(type.id)).data; onDone(`${r.charged} farmers charged ${tzs(r.total)}.`); }} onClose={onClose} />
  );
}

/** Charges a fee set in Settings to the farmers it applies to: shows who and how much first, then charges on confirmation. */
function FeeRunModal({ kind, onClose, onDone }: { kind: 'penalties' | 'storage'; onClose: () => void; onDone: (m: string) => void }) {
  const isPenalty = kind === 'penalties';
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const plan = useApi<any>(() => (isPenalty ? chargesApi.previewPenalties() : chargesApi.previewStorage(month)), [kind, month]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows: any[] = plan.data?.rows ?? [];
  const run = async () => {
    setBusy(true); setError('');
    try {
      const r: any = (await (isPenalty ? chargesApi.applyPenalties() : chargesApi.applyStorage(month))).data;
      onDone(`${r.charged} ${r.charged === 1 ? 'farmer was' : 'farmers were'} charged TZS ${Math.round(r.total).toLocaleString('en-US')}.`);
    } catch (e) { setError(errMsg(e, 'Could not charge.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={isPenalty ? 'Apply late payment penalties' : 'Charge storage for a month'}
      subtitle={isPenalty ? 'A percentage of what farmers still owe after the grace days. Check the list, then charge.' : 'For rice the cooperative keeps for farmers. Check the list, then charge.'} onClose={() => !busy && onClose()} width="640px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Close</button><button type="button" className="btn-primary" disabled={busy || !rows.length} onClick={() => void run()}>{busy ? 'Charging…' : rows.length ? `Charge ${rows.length} ${rows.length === 1 ? 'farmer' : 'farmers'}` : 'Nothing to charge'}</button></>}>
      {!isPenalty && <Field label="Month"><input className="input-field" type="month" max={todayISO().slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} /></Field>}
      {(error || plan.error) && <div role="alert" className="alert-box alert-danger" style={{ margin: '12px 0' }}>{error || plan.error}{(error || plan.error).includes('Settings') && <> <a href="/dashboard/amcos-settings">Open Settings</a></>}</div>}
      {plan.data && (
        <>
          <p style={{ fontSize: 13 }}>
            {isPenalty ? `${plan.data.percent}% a month after ${plan.data.graceDays} grace days · ${plan.data.month}` : `TZS ${plan.data.perKg.toLocaleString('en-US')} per kg for ${plan.data.month}`}
            {plan.data.alreadyCharged > 0 && <> · {plan.data.alreadyCharged} already charged</>}
          </p>
          {rows.length === 0 ? <div className="muted" style={{ padding: 16 }}>{isPenalty ? 'No farmer is late beyond the grace days, or this month has already been charged.' : 'Nobody to charge for this month.'}</div> : (
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <table className="data-table"><thead><tr><th>Farmer</th><th>{isPenalty ? 'Owes' : 'Kg stored'}</th><th className="num">Charge</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.dueId ?? r.farmerId}><td>{r.farmer}{isPenalty && <div className="muted" style={{ fontSize: 11 }}>{r.description}</div>}</td><td>{isPenalty ? `TZS ${Math.round(r.balance).toLocaleString('en-US')}` : `${r.kg.toLocaleString('en-US')} kg`}</td><td className="num">TZS {Math.round(r.amount).toLocaleString('en-US')}</td></tr>)}</tbody></table>
            </div>
          )}
          {rows.length > 0 && <p style={{ fontWeight: 600 }}>Total TZS {Math.round(plan.data.total).toLocaleString('en-US')}</p>}
        </>
      )}
    </Modal>
  );
}

function Charges({ can }: { can: (r: string, a: string) => boolean }) {
  const [showAll, setShowAll] = useState(false);
  const { data, loading, error, reload } = useApi<any[]>(() => duesApi.types({ includeInactive: showAll ? 'true' : undefined }), [showAll]);
  const [charging, setCharging] = useState<any>(null);
  const [message, setMessage] = useState('');
  // Amounts are set in one place, the Settings page; this page applies them to farmers.
  const [feeRun, setFeeRun] = useState<'penalties' | 'storage' | null>(null);
  const add = <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {can('dues', 'CREATE') && <button type="button" className="btn-secondary" onClick={() => setFeeRun('storage')}>Charge storage…</button>}
    {can('dues', 'CREATE') && <button type="button" className="btn-secondary" onClick={() => setFeeRun('penalties')}>Apply late penalties…</button>}
    <a className="btn-secondary" href="/dashboard/amcos-settings">Change amounts in Settings</a>
  </span>;
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <div className="section-toolbar">
          <strong>Levies and fees your AMCOS charges</strong>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label className="muted" style={{ fontSize: 12 }}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show switched off</label>{add}
          </span>
        </div>
        {loading && !data ? <TableSkeleton cols={7} /> : !data?.length ? (
          <Empty title="No charges set up" hint="Create your levy, membership fee and canal cleaning fee once, then charge all farmers in one step." action={add} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Charge</th><th>Kind</th><th className="num">Rate</th><th>Pay by</th><th className="num">Farmers</th><th className="num">Charged</th><th className="num">Collected</th><th /></tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.6 }}>
                    <td><div style={{ fontWeight: 600 }}>{c.name}</div>{c.season && <div className="muted" style={{ fontSize: 11 }}>{c.season}</div>}</td>
                    <td>{cat(c.category)}</td>
                    <td className="num">{tzs(c.rate)}<div className="muted" style={{ fontSize: 11 }}>{c.basis === 'PER_HECTARE' ? 'per hectare' : 'per farmer'}</div></td>
                    <td>{c.dueDate ? fmtDate(c.dueDate) : '—'}</td>
                    <td className="num">{c.farmersCharged}</td><td className="num">{tzs(c.charged)}</td><td className="num">{tzs(c.collected)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {can('dues', 'CREATE') && c.isActive && <button type="button" className="btn-primary" onClick={() => setCharging(c)}>Charge farmers</button>}{' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {feeRun && <FeeRunModal kind={feeRun} onClose={() => setFeeRun(null)} onDone={(m) => { setFeeRun(null); setMessage(m); reload(); }} />}
      {charging && <ChargeEveryone type={charging} onClose={() => setCharging(null)} onDone={(m) => { setMessage(m); reload(); }} />}
    </>
  );
}

function Statement({ farmerId, onClose }: { farmerId: string; onClose: () => void }) {
  const { data: s, loading, error, reload } = useApi<any>(() => duesApi.statement(farmerId), [farmerId]);
  return (
    <Modal title={s ? `${s.farmer.name} · account` : 'Account'} subtitle={s ? `${s.farmer.memberNumber}${s.farmer.phone ? ` · ${s.farmer.phone}` : ''}` : undefined} onClose={onClose} width="720px"
      footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <LoadError message={error} onRetry={reload} />
      {loading && !s ? <TableSkeleton rows={4} cols={5} /> : s && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="metric-grid">
            <StatCard label="Charged" value={tzs(s.totals.charged)} /><StatCard label="Paid" value={tzs(s.totals.paid)} tone="good" /><StatCard label="Still owed" value={tzs(s.totals.outstanding)} tone={s.totals.outstanding ? 'warn' : undefined} />
          </div>
          <table className="data-table">
            <thead><tr><th>Charge</th><th>Date</th><th className="num">Charged</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {s.dues.map((d: any) => (
                <tr key={d.id} style={d.state === 'CANCELLED' ? { opacity: 0.5 } : undefined}>
                  <td>{d.description}<div className="muted" style={{ fontSize: 11 }}>{cat(d.category)}{d.state === 'CANCELLED' ? ' · cancelled' : ''}</div></td>
                  <td>{fmtDate(d.issuedOn)}</td><td className="num">{tzs(d.amount)}</td><td className="num">{tzs(d.paid)}</td><td className="num"><strong>{tzs(d.balance)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Debts({ can }: { can: (r: string, a: string) => boolean }) {
  const [category, setCategory] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => duesApi.arrears({ category: category || undefined }), [category]);
  const [statement, setStatement] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reminding, setReminding] = useState(false);
  const [message, setMessage] = useState('');
  const items: any[] = data?.items ?? [];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = items.length > 0 && selected.size === items.length;
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div className="metric-grid" style={{ marginBottom: 12 }}>
        <StatCard label="Farmers with debts" value={data ? String(data.farmers) : '—'} />
        <StatCard label="Total debts" value={data ? tzs(data.outstanding) : '—'} />
        <StatCard label="Overdue debts" value={data ? tzs(data.overdue) : '—'} tone={data?.overdue ? 'warn' : undefined} />
      </div>
      <section className="table-panel">
        <div className="section-toolbar">
          <strong>Farmers with debts</strong>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <select className="input-field" style={{ width: 'auto' }} value={category} onChange={(e) => { setCategory(e.target.value); setSelected(new Set()); }} aria-label="Kind"><option value="">All kinds</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {can('communication', 'CREATE') && <button type="button" className="btn-primary" style={{ whiteSpace: 'nowrap' }} disabled={!selected.size} onClick={() => setReminding(true)}>{selected.size ? `Remind ${selected.size} by SMS` : 'Remind by SMS'}</button>}
          </span>
        </div>
        {loading && !data ? <TableSkeleton cols={6} /> : !items.length ? <Empty title="No debts" hint="Farmers with an unpaid debt are listed here, the most overdue first." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>{can('communication', 'CREATE') && <th><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(items.map((i) => i.farmer.id)))} aria-label="Select all" /></th>}<th>Farmer</th><th>Phone</th><th className="num">Charges</th><th className="num">Debt</th><th className="num">Overdue</th><th /></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.farmer.id}>
                    {can('communication', 'CREATE') && <td><input type="checkbox" checked={selected.has(i.farmer.id)} onChange={() => toggle(i.farmer.id)} aria-label={`Select ${i.farmer.name}`} /></td>}
                    <td><div style={{ fontWeight: 600 }}>{i.farmer.name}</div><div className="muted" style={{ fontSize: 11 }}>{i.farmer.memberNumber}</div></td>
                    <td>{i.farmer.phone ?? '—'}</td><td className="num">{i.dues}</td><td className="num"><strong>{tzs(i.balance)}</strong></td>
                    <td className="num" style={i.overdue ? { color: 'var(--red-400)' } : undefined}>{i.overdue ? tzs(i.overdue) : '—'}</td>
                    <td><button type="button" className="btn-secondary" onClick={() => setStatement(i.farmer.id)}>Account</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {statement && <Statement farmerId={statement} onClose={() => setStatement(null)} />}
      {reminding && (
        <ConfirmDialog title="Send payment reminder" confirmLabel={`Send to ${selected.size}`}
          body={<>An SMS will be sent to <strong>{selected.size}</strong> farmer{selected.size === 1 ? '' : 's'}: “Habari {'{name}'}, tafadhali lipa deni lako kwa AMCOS. Wasiliana na ofisi kwa maelezo.” Charges for SMS may apply.</>}
          onConfirm={async () => {
            await communicationsApi.send({ audience: 'SELECTED', channel: 'SMS', farmerIds: [...selected], body: 'Habari {name}, tafadhali lipa deni lako kwa AMCOS. Wasiliana na ofisi kwa maelezo.' });
            setMessage('Reminder sent.'); setSelected(new Set());
          }} onClose={() => setReminding(false)} />
      )}
    </>
  );
}

/** AMCOS Charges: levies, membership and canal cleaning fees, and fertiliser repayments, with what each farmer has paid. */
export default function DuesPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<'dues' | 'charges' | 'debts'>('dues');
  if (!user?.mamcosId) {
    return <><PageHeader title="AMCOS Charges" /><Empty title="AMCOS charges belong to an AMCOS" hint="Sign in with an AMCOS account to see what its farmers owe." /></>;
  }
  return (
    <div>
      <PageHeader title="AMCOS Charges" subtitle="Levies, membership and canal cleaning fees, and fertiliser repayments: what each farmer owes, what they have paid, and who is behind." />
      <Tabs tabs={[{ id: 'dues', label: 'Dues & payments' }, { id: 'charges', label: 'Charges' }, { id: 'debts', label: 'Debts' }]} active={tab} onChange={setTab} />
      {tab === 'dues' && <Dues can={can} />}
      {tab === 'charges' && <Charges can={can} />}
      {tab === 'debts' && <Debts can={can} />}
    </div>
  );
}
