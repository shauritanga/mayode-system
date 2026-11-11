'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the rest of the settings screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import MoneyInput from '@/components/MoneyInput';
import { inputSetupApi, riceVarietiesApi } from '@/lib/api';
import { refreshRiceTypes } from '@/components/RiceTypeSelect';
import { Field, LoadError, errMsg, useApi } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

interface NameRow { id: string; name: string; isActive: boolean; count?: number; platform?: boolean }

/** A list of names the AMCOS can add to, rename and switch off; everything that offers the list reads from it. */
function NameList({ title, hint, countLabel, rows, canEdit, placeholder, suggestions = [], onCreate, onRename, onToggle, empty }: {
  title: string; hint: string; countLabel?: string; rows: NameRow[]; canEdit: boolean; placeholder: string; suggestions?: string[]; empty: string;
  onCreate: (name: string) => Promise<unknown>; onRename: (id: string, name: string) => Promise<unknown>; onToggle: (row: NameRow) => Promise<unknown>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); setName(''); setRenaming(null); } catch (e) { setError(errMsg(e, 'Could not save.')); } finally { setBusy(false); }
  };
  const have = new Set(rows.filter((r) => r.isActive).map((r) => r.name.toLowerCase()));
  const offer = suggestions.filter((m) => !have.has(m.toLowerCase()));
  return (
    <section className="table-panel" style={{ marginBottom: 20 }}>
      <div className="section-toolbar"><div><strong>{title}</strong><div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{hint}</div></div></div>
      {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, padding: '8px 16px' }}>{error}</div>}
      {rows.length === 0 ? <div className="muted" style={{ padding: 20 }}>{empty}</div> : (
        <table className="data-table"><thead><tr><th>Name</th>{countLabel && <th className="num">{countLabel}</th>}<th>Status</th><th /></tr></thead><tbody>
          {rows.map((r) => {
            const editing = renaming?.id === r.id ? renaming : null;
            return (
              <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.55 }}>
                <td>{editing ? <input className="input-field" style={{ maxWidth: 260 }} autoFocus value={editing.name} onChange={(e) => setRenaming({ id: r.id, name: e.target.value })} aria-label="Name" /> : <><strong>{r.name}</strong>{r.platform && <span className="badge badge-gray" style={{ marginLeft: 8 }} title="Set by the platform for every cooperative">Standard</span>}</>}</td>
                {countLabel && <td className="num">{r.count ?? 0}</td>}
                <td>{r.isActive ? <span className="badge badge-green">In use</span> : <span className="badge badge-gray">Switched off</span>}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{canEdit && !r.platform && (editing
                  ? <><button type="button" className="btn-secondary" onClick={() => setRenaming(null)}>Cancel</button>{' '}<button type="button" className="btn-primary" disabled={busy || editing.name.trim().length < 2} onClick={() => void run(() => onRename(r.id, editing.name.trim()))}>Save</button></>
                  : <><button type="button" className="btn-secondary" onClick={() => setRenaming({ id: r.id, name: r.name })}>Rename</button>{' '}<button type="button" className="btn-secondary" disabled={busy} onClick={() => void run(() => onToggle(r))}>{r.isActive ? 'Switch off' : 'Switch on'}</button></>)}</td>
              </tr>
            );
          })}
        </tbody></table>
      )}
      {canEdit && (
        <div style={{ padding: 16, borderTop: '1px solid var(--neutral-100)', display: 'grid', gap: 10 }}>
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) void run(() => onCreate(name.trim())); }}>
            <input className="input-field" style={{ maxWidth: 280 }} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} aria-label={`New ${title.toLowerCase()}`} />
            <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 2}>Add</button>
          </form>
          {offer.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>Common:</span>
              {offer.map((m) => <button key={m} type="button" className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy} onClick={() => void run(() => onCreate(m))}>+ {m}</button>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── rice types ─────────────────────────
export function RiceTypesPanel({ canEdit, onChanged }: { canEdit: boolean; onChanged: (m: string) => void }) {
  const list = useApi<any>(() => riceVarietiesApi.list(true), []);
  const rows: NameRow[] = (Array.isArray(list.data) ? list.data : list.data?.data ?? []).map((v: any) => ({ id: v.id, name: v.name, isActive: v.isActive, count: v.cropCycleCount, platform: !v.mamcosId }));
  const after = (m: string) => { refreshRiceTypes(); onChanged(m); list.reload(); };
  return (
    <>
      <LoadError message={list.error} onRetry={list.reload} />
      <NameList title="Rice types" hint="Every screen that asks for a rice type, such as harvest payments, lots, orders and farms, offers this list." countLabel="Crop cycles"
        rows={rows} canEdit={canEdit} placeholder="Add a rice type, e.g. Super" empty="No rice types yet. Add the rice your farmers grow." suggestions={['Super', 'Saro 5', 'Kilombero', 'Komboka', 'TXD 306']}
        onCreate={async (name) => { await riceVarietiesApi.create({ name }); after(`${name} added.`); }}
        onRename={async (id, name) => { await riceVarietiesApi.update(id, { name }); after('Renamed.'); }}
        onToggle={async (r) => { await riceVarietiesApi.update(r.id, { isActive: !r.isActive }); after(r.isActive ? `${r.name} switched off. It no longer appears in the lists.` : `${r.name} is back in the lists.`); }} />
    </>
  );
}

// ───────────────────────── farm inputs ─────────────────────────
function InputModal({ item, types, onClose, onSaved }: { item?: any; types: any[]; onClose: () => void; onSaved: (m: string) => void }) {
  const editing = !!item;
  const [f, setF] = useState({ name: item?.name ?? '', inputTypeId: item?.inputTypeId ?? '', unit: item?.unit ?? 'kg', unitCost: item?.unitCost != null ? String(item.unitCost) : '', reorderLevel: item?.reorderLevel != null ? String(item.reorderLevel) : '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const problems: Record<string, string> = {};
  if (f.name.trim().length < 2) problems.name = 'Enter the name of the input';
  if (!f.inputTypeId) problems.inputTypeId = 'Choose the type of input';
  const show = (k: string) => (tried ? problems[k] : undefined);
  const save = async () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    setBusy(true); setError('');
    const body = { name: f.name.trim(), inputTypeId: f.inputTypeId, unit: f.unit.trim() || 'kg', unitCost: f.unitCost === '' ? null : Number(f.unitCost), reorderLevel: f.reorderLevel === '' ? null : Number(f.reorderLevel) };
    try { if (editing) await inputSetupApi.updateItem(item.id, body); else await inputSetupApi.createItem(body); onSaved(editing ? `${f.name.trim()} updated.` : `${f.name.trim()} added. Add stock to start giving it to farmers.`); }
    catch (e) { setError(errMsg(e, 'Could not save the input.')); setBusy(false); }
  };
  return (
    <Modal title={editing ? 'Edit input' : 'Add an input'} subtitle="Something your AMCOS gives farmers on credit." width="560px" onClose={() => !busy && onClose()}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="input-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add input'}</button></>}>
      <form id="input-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 14 }}>
        {error && <div role="alert" className="alert-box alert-danger">{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Name *" error={show('name')}><input className="input-field" autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Urea" /></Field>
          <Field label="Type of input *" error={show('inputTypeId')}><select className="input-field" value={f.inputTypeId} onChange={(e) => set('inputTypeId', e.target.value)}><option value="">Choose…</option>{types.filter((t) => t.isActive || t.id === item?.inputTypeId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Unit" hint="How it is counted: kg, litre, bag…"><input className="input-field" value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
          <Field label="Price per unit (TZS)" hint="What a farmer is charged; can be changed when giving"><MoneyInput className="input-field" min="0" value={f.unitCost} onChange={(e) => set('unitCost', e.target.value)} /></Field>
          <Field label="Warn when stock is at or below" hint="Optional"><input type="number" min={0} step="any" className="input-field" value={f.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} /></Field>
        </div>
      </form>
    </Modal>
  );
}

function StockModal({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [qty, setQty] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await inputSetupApi.addStock(item.id, { quantity: Number(qty), note: note.trim() || undefined }); onSaved(`${qty} ${item.unit} of ${item.name} added to stock.`); }
    catch (e) { setError(errMsg(e, 'Could not add the stock.')); setBusy(false); }
  };
  return (
    <Modal title={`Add stock · ${item.name}`} subtitle={`In stock now: ${item.balance} ${item.unit}`} width="460px" onClose={() => !busy && onClose()}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="stock-form" className="btn-primary" disabled={busy || !(Number(qty) > 0)}>{busy ? 'Saving…' : 'Add stock'}</button></>}>
      <form id="stock-form" noValidate onSubmit={(e) => { e.preventDefault(); if (Number(qty) > 0) void save(); }} style={{ display: 'grid', gap: 12 }}>
        {error && <div role="alert" className="alert-box alert-danger">{error}</div>}
        <Field label={`Quantity received (${item.unit}) *`}><input type="number" min={0} step="any" autoFocus className="input-field" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Note" hint="Optional: supplier, delivery note…"><input className="input-field" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {Number(qty) > 0 && <div className="muted" style={{ fontSize: 13 }}>After this: <strong>{Math.round((item.balance + Number(qty)) * 1000) / 1000} {item.unit}</strong> in stock</div>}
      </form>
    </Modal>
  );
}

export function FarmInputsPanel({ canEdit, onChanged }: { canEdit: boolean; onChanged: (m: string) => void }) {
  const types = useApi<any>(() => inputSetupApi.types(), []);
  const items = useApi<any>(() => inputSetupApi.items(), []);
  const [modal, setModal] = useState<null | { item?: any }>(null);
  const [stock, setStock] = useState<any>(null);
  const typeRows: NameRow[] = (types.data?.data ?? []).map((t: any) => ({ id: t.id, name: t.name, isActive: t.isActive, count: t.inputs }));
  const list: any[] = items.data?.data ?? [];
  const after = (m: string) => { onChanged(m); types.reload(); items.reload(); };
  return (
    <>
      <LoadError message={types.error || items.error} onRetry={() => { types.reload(); items.reload(); }} />
      <NameList title="Types of input" hint="The kinds of input your AMCOS gives farmers. Each input below is filed under one of these." countLabel="Inputs"
        rows={typeRows} canEdit={canEdit} placeholder="Add a type, e.g. Soil conditioner" empty="No input types yet." suggestions={['Seed', 'Fertiliser', 'Pesticide', 'Herbicide', 'Fuel', 'Packaging bags']}
        onCreate={async (name) => { await inputSetupApi.createType(name); after(`${name} added.`); }}
        onRename={async (id, name) => { await inputSetupApi.updateType(id, { name }); after('Renamed.'); }}
        onToggle={async (r) => { await inputSetupApi.updateType(r.id, { isActive: !r.isActive }); after(r.isActive ? `${r.name} switched off.` : `${r.name} switched on.`); }} />

      <section className="table-panel">
        <div className="section-toolbar" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div><strong>Inputs</strong><div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>What appears in “Give inputs to a farmer” on the Input Distribution page, with its price and stock.</div></div>
          {canEdit && <button type="button" className="btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({})}>Add an input</button>}
        </div>
        {items.loading && !items.data ? <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div> : list.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <strong>No inputs yet</strong>
            <p className="muted" style={{ margin: '8px 0 14px' }}>Add what you give farmers, such as Urea or seed, then add stock. Until then nothing can be chosen on the Input Distribution page.</p>
            {canEdit && <button type="button" className="btn-primary" onClick={() => setModal({})}>Add the first input</button>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Input</th><th>Type</th><th className="num">Price</th><th className="num">In stock</th><th>Status</th><th /></tr></thead><tbody>
            {list.map((i) => (
              <tr key={i.id} style={{ opacity: i.isActive ? 1 : 0.55 }}>
                <td><strong>{i.name}</strong><div className="muted" style={{ fontSize: 12 }}>per {i.unit}</div></td>
                <td>{i.typeName ?? '—'}</td>
                <td className="num">{i.unitCost ? tzs(i.unitCost) : <span className="muted">Not set</span>}</td>
                <td className="num" style={{ color: i.low ? 'var(--gold-400)' : undefined }}>{i.balance} {i.unit}{i.low && <div style={{ fontSize: 11 }}>Running low</div>}</td>
                <td>{i.isActive ? <span className="badge badge-green">In use</span> : <span className="badge badge-gray">Switched off</span>}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{canEdit && <>
                  <button type="button" className="btn-secondary" onClick={() => setStock(i)}>Add stock</button>{' '}
                  <button type="button" className="btn-secondary" onClick={() => setModal({ item: i })}>Edit</button>{' '}
                  <button type="button" className="btn-secondary" onClick={async () => { try { await inputSetupApi.updateItem(i.id, { isActive: !i.isActive }); after(i.isActive ? `${i.name} switched off.` : `${i.name} switched on.`); } catch (e) { onChanged(errMsg(e, 'Could not change it.')); } }}>{i.isActive ? 'Switch off' : 'Switch on'}</button></>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      {modal && <InputModal item={modal.item} types={types.data?.data ?? []} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); after(m); }} />}
      {stock && <StockModal item={stock} onClose={() => setStock(null)} onSaved={(m) => { setStock(null); after(m); }} />}
    </>
  );
}
