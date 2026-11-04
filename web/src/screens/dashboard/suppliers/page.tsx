'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useMemo, useState } from 'react';
import { Building2, User } from 'lucide-react';
import Modal from '@/components/Modal';
import { suppliersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Field, LoadError, Notice, PageHeader, TableSkeleton, Tabs, errMsg, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

type Kind = 'INDIVIDUAL' | 'COMPANY';

interface Supplier {
  id: string;
  mamcosId: string | null;
  kind: Kind;
  name: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  tin?: string | null;
  idNumber?: string | null;
  businessRegNo?: string | null;
  address?: string | null;
  notes?: string | null;
  itemsSupplied: string[];
  isActive: boolean;
  _count?: { inputCosts: number };
  inputCosts?: any[];
}

const COMMON_ITEMS = ['Fertiliser', 'Seeds', 'Pesticide', 'Herbicide', 'Fuel', 'Packaging bags', 'Machinery hire', 'Transport', 'Spare parts'];

// ───────────────────────── add / edit a supplier ─────────────────────────
function SupplierModal({ supplier, onClose, onSaved }: { supplier?: Supplier; onClose: () => void; onSaved: (message: string) => void }) {
  const editing = !!supplier;
  const [kind, setKind] = useState<Kind>(supplier?.kind ?? 'COMPANY');
  const [f, setF] = useState({
    name: supplier?.name ?? '', contactPerson: supplier?.contactPerson ?? '', phone: supplier?.contactPhone ?? '', email: supplier?.contactEmail ?? '',
    tin: supplier?.tin ?? '', idNumber: supplier?.idNumber ?? '', businessRegNo: supplier?.businessRegNo ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '',
  });
  const [items, setItems] = useState<string[]>(supplier?.itemsSupplied ?? []);
  const [itemText, setItemText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const person = kind === 'INDIVIDUAL';

  const addItem = (raw: string) => {
    const v = raw.trim();
    if (v && !items.some((i) => i.toLowerCase() === v.toLowerCase())) setItems((x) => [...x, v]);
    setItemText('');
  };
  const problems: Record<string, string> = {};
  if (f.name.trim().length < 2) problems.name = person ? 'Enter the person’s full name' : 'Enter the company name';
  if (!person && !f.contactPerson.trim()) problems.contactPerson = 'Who should we contact at the company?';
  if (!f.phone.trim()) problems.phone = 'Enter a phone number';
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) problems.email = 'That email does not look right';

  const save = async () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    setBusy(true); setError('');
    const pending = itemText.trim();
    const itemsSupplied = pending && !items.some((i) => i.toLowerCase() === pending.toLowerCase()) ? [...items, pending] : items;
    const body: Record<string, unknown> = {
      kind, name: f.name.trim(), contactPhone: f.phone.trim(), contactEmail: f.email.trim() || undefined, tin: f.tin.trim() || undefined, address: f.address.trim() || undefined,
      notes: f.notes.trim() || undefined, itemsSupplied,
      ...(person ? { idNumber: f.idNumber.trim() || undefined } : { contactPerson: f.contactPerson.trim(), businessRegNo: f.businessRegNo.trim() || undefined }),
    };
    try {
      if (editing) await suppliersApi.update(supplier!.id, body); else await suppliersApi.create(body);
      onSaved(editing ? `${f.name.trim()} updated.` : `${f.name.trim()} added.`);
    } catch (e) { setError(errMsg(e, 'Could not save the supplier.')); setBusy(false); }
  };

  const choice = (value: Kind, title: string, hint: string, Icon: typeof User) => {
    const on = kind === value;
    return (
      <button type="button" onClick={() => setKind(value)} aria-pressed={on} style={{
        display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', width: '100%',
        border: `2px solid ${on ? 'var(--green-500, #16a36a)' : 'var(--neutral-200, #2a2f3a)'}`, background: on ? 'var(--surface-tint, rgba(22,163,106,0.08))' : 'transparent', color: 'inherit',
      }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: on ? 'var(--green-500, #16a36a)' : 'var(--neutral-100, #1d222c)', color: on ? '#fff' : 'inherit', flex: 'none' }}><Icon size={19} /></span>
        <span><strong style={{ display: 'block' }}>{title}</strong><span className="muted" style={{ fontSize: 12 }}>{hint}</span></span>
      </button>
    );
  };
  const show = (k: string) => (tried && problems[k] ? problems[k] : undefined);

  return (
    <Modal title={editing ? 'Edit supplier' : 'Add a supplier'} subtitle={editing ? supplier!.name : 'Someone you buy inputs or services from.'} onClose={() => !busy && onClose()} width="680px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="supplier-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}</button></>}>
      <form id="supplier-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 16 }}>
        {error && <div role="alert" className="alert-box alert-danger">{error}</div>}

        <div>
          <div className="form-label" style={{ marginBottom: 6 }}>Who is the supplier?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {choice('INDIVIDUAL', 'Individual', 'A person, such as a trader or a farmer', User)}
            {choice('COMPANY', 'Company', 'A business, shop or organisation', Building2)}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <Field label={person ? 'Full name *' : 'Company name *'} error={show('name')} wide>
            <input className="input-field" autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={person ? 'e.g. Juma Hassan' : 'e.g. Agro Supplies Ltd'} />
          </Field>
          {!person && <Field label="Contact person *" error={show('contactPerson')}><input className="input-field" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} placeholder="e.g. Neema Mushi" /></Field>}
          <Field label="Phone *" error={show('phone')}><input className="input-field" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. 0712 345 678" /></Field>
          <Field label="Email" error={show('email')}><input className="input-field" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          {person
            ? <Field label="National ID number" hint="Optional"><input className="input-field" value={f.idNumber} onChange={(e) => set('idNumber', e.target.value)} /></Field>
            : <Field label="Business registration number" hint="Optional"><input className="input-field" value={f.businessRegNo} onChange={(e) => set('businessRegNo', e.target.value)} /></Field>}
          <Field label="TIN" hint="Optional"><input className="input-field" value={f.tin} onChange={(e) => set('tin', e.target.value)} /></Field>
          <Field label="Address or location" wide><input className="input-field" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="e.g. Madibira, near the market" /></Field>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 6 }}>What do they supply?</div>
          {items.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {items.map((i) => <span key={i} className="badge badge-blue" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{i}<button type="button" aria-label={`Remove ${i}`} onClick={() => setItems((x) => x.filter((y) => y !== i))} style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button></span>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input-field" value={itemText} placeholder="Type an item and press Enter" onChange={(e) => setItemText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addItem(itemText); } }} />
            <button type="button" className="btn-secondary" onClick={() => addItem(itemText)} disabled={!itemText.trim()}>Add</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>Common:</span>
            {COMMON_ITEMS.filter((c) => !items.some((i) => i.toLowerCase() === c.toLowerCase())).map((c) => <button key={c} type="button" className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => addItem(c)}>+ {c}</button>)}
          </div>
        </div>

        <Field label="Notes" hint="Optional: prices agreed, payment terms, anything worth remembering"><textarea className="input-field" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

// ───────────────────────── the page ─────────────────────────
export default function SuppliersPage() {
  const can = useCan();
  const isSuperAdmin = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const list = useApi<Supplier[]>(() => suppliersApi.getAll(), []);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'ALL' | Kind>('ALL');
  const [modal, setModal] = useState<{ supplier?: Supplier } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const detail = useApi<Supplier>(selectedId ? () => suppliersApi.getOne(selectedId) : null, [selectedId]);
  // A supplier that was deleted or hidden by a reload simply closes its panel.
  const panelOpen = !!selectedId && (list.loading || (list.data ?? []).some((x) => x.id === selectedId));

  const canCreate = can('suppliers', 'CREATE');
  const canEdit = can('suppliers', 'EDIT');
  const canDelete = can('suppliers', 'DELETE');
  const all = useMemo(() => list.data ?? [], [list.data]);
  const counts = useMemo(() => ({ ALL: all.length, INDIVIDUAL: all.filter((s) => s.kind === 'INDIVIDUAL').length, COMPANY: all.filter((s) => s.kind === 'COMPANY').length }), [all]);
  const q = search.trim().toLowerCase();
  const rows = all.filter((s) => (type === 'ALL' || s.kind === type) && (!q || [s.name, s.contactPerson, s.contactPhone, s.contactEmail, ...(s.itemsSupplied ?? [])].some((v) => v?.toLowerCase().includes(q))));
  const mine = (s: Supplier) => isSuperAdmin || s.mamcosId != null;

  const toggle = async (s: Supplier) => {
    try { await suppliersApi.update(s.id, { isActive: !s.isActive }); setMessage({ tone: 'success', text: `${s.name} ${s.isActive ? 'switched off' : 'switched on'}.` }); list.reload(); } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'Could not change the supplier.') }); }
  };

  const d = panelOpen ? detail.data : null;
  return (
    <div className="page-shell">
      <PageHeader title="Suppliers" subtitle="The people and companies you buy inputs and services from."
        actions={<>
          <input type="search" className="input-field" style={{ width: 260 }} placeholder="Search name, phone or item…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search suppliers" />
          {canCreate && <button type="button" className="btn-primary" onClick={() => setModal({})}>Add supplier</button>}
        </>} />
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      <LoadError message={list.error} onRetry={list.reload} />

      <Tabs tabs={[{ id: 'ALL', label: `All · ${counts.ALL}` }, { id: 'COMPANY', label: `Companies · ${counts.COMPANY}` }, { id: 'INDIVIDUAL', label: `Individuals · ${counts.INDIVIDUAL}` }]} active={type} onChange={(v) => setType(v as 'ALL' | Kind)} />

      <div style={{ display: 'grid', gridTemplateColumns: panelOpen ? 'minmax(0,1.3fr) minmax(300px,0.9fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <div className="table-panel">
          {list.loading && !list.data ? <TableSkeleton rows={6} cols={5} /> : rows.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <strong>{all.length === 0 ? 'No suppliers yet' : 'No supplier matches'}</strong>
              <p className="muted" style={{ margin: '8px 0 16px' }}>{all.length === 0 ? 'Add the people and companies you buy from, so costs and bills can be linked to them.' : 'Try a different name, or switch the filter above.'}</p>
              {all.length === 0 && canCreate && <button type="button" className="btn-primary" onClick={() => setModal({})}>Add the first supplier</button>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Supplier</th><th>Contact</th><th>Supplies</th><th className="num">Costs</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} onClick={() => setSelectedId(s.id)} style={{ cursor: 'pointer', background: selectedId === s.id ? 'var(--surface-tint)' : undefined, opacity: s.isActive ? 1 : 0.6 }}>
                      <td style={{ whiteSpace: 'normal', minWidth: 190 }}>
                        <strong>{s.name}</strong>
                        <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                          <span className={`badge ${s.kind === 'INDIVIDUAL' ? 'badge-gray' : 'badge-blue'}`}>{s.kind === 'INDIVIDUAL' ? 'Individual' : 'Company'}</span>
                          {s.mamcosId == null && !isSuperAdmin && <span className="badge badge-gray" title="Shared with every cooperative; only the platform administrator can change it">Shared</span>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'normal', fontSize: 13 }}>
                        {s.kind === 'COMPANY' && s.contactPerson ? <div>{s.contactPerson}</div> : null}
                        <div className="muted">{s.contactPhone || '—'}</div>
                      </td>
                      <td style={{ whiteSpace: 'normal', fontSize: 12 }}>
                        {s.itemsSupplied?.length ? <>{s.itemsSupplied.slice(0, 3).join(', ')}{s.itemsSupplied.length > 3 ? <span className="muted"> +{s.itemsSupplied.length - 3} more</span> : null}</> : <span className="muted">—</span>}
                      </td>
                      <td className="num">{s._count?.inputCosts ?? 0}</td>
                      <td><span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>{s.isActive ? 'Active' : 'Switched off'}</span></td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        {mine(s) && canEdit && <button type="button" className="btn-secondary" onClick={() => setModal({ supplier: s })}>Edit</button>}{' '}
                        {mine(s) && canEdit && <button type="button" className="btn-secondary" onClick={() => void toggle(s)}>{s.isActive ? 'Switch off' : 'Switch on'}</button>}{' '}
                        {mine(s) && canDelete && <button type="button" className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => setDeleting(s)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {panelOpen && (
          <aside className="action-panel" aria-label="Supplier details">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{d?.name ?? 'Supplier'}</h2>
                {d && <p className="panel-copy">{d.kind === 'INDIVIDUAL' ? 'Individual' : 'Company'}{d.isActive ? '' : ' · switched off'}</p>}
              </div>
              <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setSelectedId(null)}>Close</button>
            </div>
            {detail.loading && !d ? <p className="muted">Loading…</p> : d && (
              <div style={{ display: 'grid', gap: 14 }}>
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: 0, fontSize: 13 }}>
                  {([
                    ['Contact person', d.kind === 'COMPANY' ? d.contactPerson : null], ['Phone', d.contactPhone], ['Email', d.contactEmail], ['TIN', d.tin],
                    [d.kind === 'INDIVIDUAL' ? 'National ID' : 'Business registration', d.kind === 'INDIVIDUAL' ? d.idNumber : d.businessRegNo], ['Address', d.address],
                  ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="muted">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
                </dl>
                {d.itemsSupplied?.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{d.itemsSupplied.map((i) => <span key={i} className="badge badge-blue">{i}</span>)}</div>}
                {d.notes && <p style={{ margin: 0, fontSize: 13 }}><span className="muted">Notes: </span>{d.notes}</p>}
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Farm costs linked to this supplier</h3>
                  {!d.inputCosts?.length ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>None yet. Farmers can pick this supplier when they record input costs.</p> : (
                    <div style={{ display: 'grid', gap: 8, maxHeight: 360, overflow: 'auto' }}>
                      {d.inputCosts.map((cost) => (
                        <div key={cost.id} style={{ padding: 10, background: 'var(--surface-tint)', borderRadius: 8 }}>
                          <div style={{ fontWeight: 600 }}>{cost.itemName} · TZS {Math.round(cost.totalCost).toLocaleString('en-US')}</div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                            {cost.category.replace(/_/g, ' ')}{cost.quantity != null ? ` · ${cost.quantity}${cost.unit ? ` ${cost.unit}` : ''}` : ''} · {new Date(cost.dateIncurred).toLocaleDateString('en-GB')}
                          </div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {cost.cropCycle?.farm?.farmCode || 'Farm'}{cost.cropCycle?.season ? ` · ${cost.cropCycle.season}` : ''}
                            {cost.cropCycle?.farmer ? ` · ${cost.cropCycle.farmer.firstName} ${cost.cropCycle.farmer.lastName}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {modal && <SupplierModal supplier={modal.supplier} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); setMessage({ tone: 'success', text }); list.reload(); if (selectedId) detail.reload(); }} />}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete" danger
          body={<>This removes the supplier from your list. A supplier with recorded costs or bills cannot be deleted; switch it off instead.</>}
          onConfirm={async () => { try { await suppliersApi.remove(deleting.id); setMessage({ tone: 'success', text: `${deleting.name} deleted.` }); if (selectedId === deleting.id) setSelectedId(null); list.reload(); } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'Could not delete the supplier.') }); } }}
          onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
