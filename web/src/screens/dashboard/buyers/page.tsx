'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useMemo, useState } from 'react';
import { BadgeCheck, Building2 } from 'lucide-react';
import Modal from '@/components/Modal';
import { buyersApi, riceVarietiesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { ConfirmDialog, Field, LoadError, Notice, PageHeader, TableSkeleton, Tabs, errMsg, useApi } from '@/screens/dashboard/irrigation/ui';
import { BUSINESS_TYPES, businessTypeLabel, day, kg, tzs } from '../market/format';

interface Buyer {
  id: string;
  mamcosId: string | null;
  name: string;
  fairtradeCertNumber?: string | null;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isCertified: boolean;
  businessType?: string | null;
  region?: string | null;
  district?: string | null;
  location?: string | null;
  deliveryLocation?: string | null;
  preferredVarieties: string[];
  notes?: string | null;
  stats?: { sales: number; soldKg: number; soldValue: number; outstanding: number; openOrders: number; requiredKg: number; activeAgreements: number };
  recentSales?: { id: string; saleDate: string; quantityKg: number; pricePerKg: number; totalRevenue: number; paymentReceived: boolean }[];
}
type Filter = 'ALL' | 'CERTIFIED' | 'NOT_CERTIFIED' | 'OWING';

// ───────────────────────── add / edit a buyer ─────────────────────────
function BuyerModal({ buyer, onClose, onSaved }: { buyer?: Buyer; onClose: () => void; onSaved: (message: string) => void }) {
  const editing = !!buyer;
  const [f, setF] = useState({
    name: buyer?.name ?? '', businessType: buyer?.businessType ?? '', contactPerson: buyer?.contactPerson ?? '', phone: buyer?.contactPhone ?? '', email: buyer?.contactEmail ?? '',
    region: buyer?.region ?? '', district: buyer?.district ?? '', location: buyer?.location ?? '', deliveryLocation: buyer?.deliveryLocation ?? '',
    cert: buyer?.fairtradeCertNumber ?? '', notes: buyer?.notes ?? '',
  });
  const [certified, setCertified] = useState(!!buyer?.isCertified);
  const [items, setItems] = useState<string[]>(buyer?.preferredVarieties ?? []);
  const [itemText, setItemText] = useState('');
  const rice = useApi<any>(() => riceVarietiesApi.list(), []);
  const common: string[] = (Array.isArray(rice.data) ? rice.data : rice.data?.data ?? []).filter((v: any) => v.isActive !== false).map((v: any) => v.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const addItem = (raw: string) => {
    const v = raw.trim();
    if (v && !items.some((i) => i.toLowerCase() === v.toLowerCase())) setItems((x) => [...x, v]);
    setItemText('');
  };
  const problems: Record<string, string> = {};
  if (f.name.trim().length < 2) problems.name = 'Enter the buyer’s or business name';
  if (!f.contactPerson.trim()) problems.contactPerson = 'Who should we contact?';
  if (!f.phone.trim()) problems.phone = 'Enter a phone number';
  if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) problems.email = 'That email does not look right';
  const show = (k: string) => (tried && problems[k] ? problems[k] : undefined);

  const save = async () => {
    setTried(true);
    if (Object.keys(problems).length) return;
    setBusy(true); setError('');
    const pending = itemText.trim();
    const preferredVarieties = pending && !items.some((i) => i.toLowerCase() === pending.toLowerCase()) ? [...items, pending] : items;
    const body: Record<string, unknown> = {
      name: f.name.trim(), contactPerson: f.contactPerson.trim(), contactPhone: f.phone.trim(), contactEmail: f.email.trim() || undefined,
      businessType: f.businessType || undefined, region: f.region.trim() || undefined, district: f.district.trim() || undefined, location: f.location.trim() || undefined,
      deliveryLocation: f.deliveryLocation.trim() || undefined, notes: f.notes.trim() || undefined, preferredVarieties,
      isCertified: certified, fairtradeCertNumber: certified ? f.cert.trim() || undefined : undefined,
    };
    try {
      if (editing) await buyersApi.update(buyer!.id, body); else await buyersApi.create(body);
      onSaved(editing ? `${f.name.trim()} updated.` : `${f.name.trim()} added.`);
    } catch (e) { setError(errMsg(e, 'Could not save the buyer.')); setBusy(false); }
  };

  const choice = (value: boolean, title: string, hint: string, Icon: typeof Building2) => {
    const on = certified === value;
    return (
      <button type="button" onClick={() => setCertified(value)} aria-pressed={on} style={{
        display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', width: '100%',
        border: `2px solid ${on ? 'var(--green-500, #16a36a)' : 'var(--neutral-200, #2a2f3a)'}`, background: on ? 'var(--surface-tint, rgba(22,163,106,0.08))' : 'transparent', color: 'inherit',
      }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: on ? 'var(--green-500, #16a36a)' : 'var(--neutral-100, #1d222c)', color: on ? '#fff' : 'inherit', flex: 'none' }}><Icon size={19} /></span>
        <span><strong style={{ display: 'block' }}>{title}</strong><span className="muted" style={{ fontSize: 12 }}>{hint}</span></span>
      </button>
    );
  };

  return (
    <Modal title={editing ? 'Edit buyer' : 'Add a buyer'} subtitle={editing ? buyer!.name : 'Someone you sell rice to.'} onClose={() => !busy && onClose()} width="680px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="buyer-form" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add buyer'}</button></>}>
      <form id="buyer-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 16 }}>
        {error && <div role="alert" className="alert-box alert-danger">{error}</div>}

        <div>
          <div className="form-label" style={{ marginBottom: 6 }}>Fairtrade status</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {choice(true, 'Fairtrade certified', 'The buyer holds a Fairtrade certificate', BadgeCheck)}
            {choice(false, 'Not certified', 'An ordinary buyer, trader or business', Building2)}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Buyer / business name *" error={show('name')} wide>
            <input className="input-field" autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Mbeya Rice Millers Ltd" />
          </Field>
          <Field label="Business type"><select className="input-field" value={f.businessType} onChange={(e) => set('businessType', e.target.value)}><option value="">Choose…</option>{BUSINESS_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {certified
            ? <Field label="Fairtrade certificate number" hint="Optional"><input className="input-field" value={f.cert} onChange={(e) => set('cert', e.target.value)} /></Field>
            : <div />}
          <Field label="Contact person *" error={show('contactPerson')}><input className="input-field" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} placeholder="e.g. Neema Mushi" /></Field>
          <Field label="Phone *" error={show('phone')}><input className="input-field" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="e.g. 0712 345 678" /></Field>
          <Field label="Email" error={show('email')} wide><input className="input-field" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Region"><input className="input-field" value={f.region} onChange={(e) => set('region', e.target.value)} placeholder="e.g. Mbeya" /></Field>
          <Field label="District"><input className="input-field" value={f.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Mbarali" /></Field>
          <Field label="Town or address" wide><input className="input-field" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Rujewa, near the market" /></Field>
          <Field label="Usual delivery location" hint="Where they normally take delivery; orders can override it" wide><input className="input-field" value={f.deliveryLocation} onChange={(e) => set('deliveryLocation', e.target.value)} /></Field>
        </div>

        <div>
          <div className="form-label" style={{ marginBottom: 6 }}>Which rice do they prefer?</div>
          {items.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {items.map((i) => <span key={i} className="badge badge-blue" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{i}<button type="button" aria-label={`Remove ${i}`} onClick={() => setItems((x) => x.filter((y) => y !== i))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>×</button></span>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input-field" value={itemText} placeholder="Type a variety and press Enter" onChange={(e) => setItemText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addItem(itemText); } }} />
            <button type="button" className="btn-secondary" onClick={() => addItem(itemText)} disabled={!itemText.trim()}>Add</button>
          </div>
          {common.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12 }}>Common:</span>
              {common.filter((c) => !items.some((i) => i.toLowerCase() === c.toLowerCase())).map((c) => <button key={c} type="button" className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => addItem(c)}>+ {c}</button>)}
            </div>
          )}
        </div>

        <Field label="Notes" hint="Optional: prices agreed, payment terms, anything worth remembering"><textarea className="input-field" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

// ───────────────────────── the page ─────────────────────────
export default function BuyersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, 'buyers', 'CREATE');
  const canEdit = hasPermission(user, 'buyers', 'EDIT');
  const canDelete = hasPermission(user, 'buyers', 'DELETE');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const list = useApi<Buyer[]>(() => buyersApi.list(), []);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [modal, setModal] = useState<{ buyer?: Buyer } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Buyer | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const detail = useApi<Buyer>(selectedId ? () => buyersApi.getOne(selectedId) : null, [selectedId]);
  // A buyer that was deleted or hidden by a reload simply closes its panel.
  const panelOpen = !!selectedId && (list.loading || (list.data ?? []).some((x) => x.id === selectedId));

  const all = useMemo(() => list.data ?? [], [list.data]);
  const counts = useMemo(() => ({
    ALL: all.length, CERTIFIED: all.filter((b) => b.isCertified).length, NOT_CERTIFIED: all.filter((b) => !b.isCertified).length, OWING: all.filter((b) => (b.stats?.outstanding ?? 0) > 0).length,
  }), [all]);
  const q = search.trim().toLowerCase();
  const rows = all.filter((b) => (filter === 'ALL' || (filter === 'CERTIFIED' && b.isCertified) || (filter === 'NOT_CERTIFIED' && !b.isCertified) || (filter === 'OWING' && (b.stats?.outstanding ?? 0) > 0))
    && (!q || [b.name, b.contactPerson, b.contactPhone, b.contactEmail, b.district, b.location, ...(b.preferredVarieties ?? [])].some((v) => v?.toLowerCase().includes(q))));
  // a platform-level buyer (no cooperative) is changed only by Super Admin
  const mine = (b: Buyer) => isSuperAdmin || b.mamcosId != null;

  const d = panelOpen ? detail.data : null;
  const search_ = <input type="search" className="input-field" style={{ width: 260 }} placeholder="Search name, phone or rice…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search buyers" />;
  const add_ = canCreate ? <button type="button" className="btn-primary" onClick={() => setModal({})}>Add buyer</button> : null;
  return (
    <div className={embedded ? undefined : 'page-shell'}>
      {embedded
        ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{search_}{add_}</div>
        : <PageHeader title="Buyers" subtitle="The people and companies you sell rice to." actions={<>{search_}{add_}</>} />}
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      <LoadError message={list.error} onRetry={list.reload} />

      <Tabs tabs={[{ id: 'ALL', label: `All · ${counts.ALL}` }, { id: 'CERTIFIED', label: `Certified · ${counts.CERTIFIED}` }, { id: 'NOT_CERTIFIED', label: `Not certified · ${counts.NOT_CERTIFIED}` }, { id: 'OWING', label: `Owing · ${counts.OWING}` }]} active={filter} onChange={(v) => setFilter(v as Filter)} />

      <div style={{ display: 'grid', gridTemplateColumns: panelOpen ? 'minmax(0,1.3fr) minmax(300px,0.9fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <div className="table-panel">
          {list.loading && !list.data ? <TableSkeleton rows={6} cols={5} /> : rows.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <strong>{all.length === 0 ? 'No buyers yet' : 'No buyer matches'}</strong>
              <p className="muted" style={{ margin: '8px 0 16px' }}>{all.length === 0 ? 'Add the people and companies you sell to, so sales, orders and invoices can be linked to them.' : 'Try a different name, or switch the filter above.'}</p>
              {all.length === 0 && canCreate && <button type="button" className="btn-primary" onClick={() => setModal({})}>Add the first buyer</button>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Buyer</th><th>Contact</th><th>Prefers</th><th className="num">Sold</th><th className="num">Owes</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} onClick={() => setSelectedId(b.id)} style={{ cursor: 'pointer', background: selectedId === b.id ? 'var(--surface-tint)' : undefined }}>
                      <td style={{ whiteSpace: 'normal', minWidth: 190 }}>
                        <strong>{b.name}</strong>
                        <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                          <span className="badge badge-gray">{businessTypeLabel(b.businessType) === '—' ? 'Buyer' : businessTypeLabel(b.businessType)}</span>
                          {b.mamcosId == null && !isSuperAdmin && <span className="badge badge-gray" title="Shared with every cooperative; only the platform administrator can change it">Shared</span>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'normal', fontSize: 13 }}>
                        {b.contactPerson ? <div>{b.contactPerson}</div> : null}
                        <div className="muted">{b.contactPhone || b.contactEmail || '—'}</div>
                      </td>
                      <td style={{ whiteSpace: 'normal', fontSize: 12 }}>
                        {b.preferredVarieties?.length ? <>{b.preferredVarieties.slice(0, 3).join(', ')}{b.preferredVarieties.length > 3 ? <span className="muted"> +{b.preferredVarieties.length - 3} more</span> : null}</> : <span className="muted">—</span>}
                      </td>
                      <td className="num">{b.stats?.soldValue ? <>{tzs(b.stats.soldValue)}<div className="muted" style={{ fontSize: 11 }}>{kg(b.stats.soldKg)}</div></> : '—'}</td>
                      <td className="num" style={{ color: b.stats?.outstanding ? 'var(--gold-400)' : undefined }}>{b.stats?.outstanding ? tzs(b.stats.outstanding) : '—'}</td>
                      <td><span className={`badge ${b.isCertified ? 'badge-green' : 'badge-gray'}`}>{b.isCertified ? 'Certified' : 'Not certified'}</span></td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        {mine(b) && canEdit && <button type="button" className="btn-secondary" onClick={() => setModal({ buyer: b })}>Edit</button>}{' '}
                        {mine(b) && canDelete && <button type="button" className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => setDeleting(b)}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {panelOpen && (
          <aside className="action-panel" aria-label="Buyer details">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{d?.name ?? 'Buyer'}</h2>
                {d && <p className="panel-copy">{businessTypeLabel(d.businessType) === '—' ? 'Buyer' : businessTypeLabel(d.businessType)}{d.isCertified ? ' · Fairtrade certified' : ''}</p>}
              </div>
              <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setSelectedId(null)}>Close</button>
            </div>
            {detail.loading && !d ? <p className="muted">Loading…</p> : d && (
              <div style={{ display: 'grid', gap: 14 }}>
                <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: 0, fontSize: 13 }}>
                  {([
                    ['Contact person', d.contactPerson], ['Phone', d.contactPhone], ['Email', d.contactEmail], ['Fairtrade certificate', d.isCertified ? d.fairtradeCertNumber : null],
                    ['Location', [d.location, d.district, d.region].filter(Boolean).join(', ')], ['Usual delivery', d.deliveryLocation],
                  ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="muted">{k}</dt><dd style={{ margin: 0 }}>{v}</dd></div>)}
                </dl>
                {d.preferredVarieties?.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{d.preferredVarieties.map((i) => <span key={i} className="badge badge-blue">{i}</span>)}</div>}
                {d.notes && <p style={{ margin: 0, fontSize: 13 }}><span className="muted">Notes: </span>{d.notes}</p>}
                {d.stats && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([['Sold in total', tzs(d.stats.soldValue)], ['Still owes', tzs(d.stats.outstanding)], ['Open orders', d.stats.openOrders ? `${d.stats.openOrders} · ${kg(d.stats.requiredKg)}` : 'None'], ['Active agreements', String(d.stats.activeAgreements)]] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ padding: 10, background: 'var(--surface-tint)', borderRadius: 8 }}><div className="muted" style={{ fontSize: 12 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
                    ))}
                  </div>
                )}
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Recent sales to this buyer</h3>
                  {!d.recentSales?.length ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>None yet. Sales you record to this buyer appear here.</p> : (
                    <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
                      {d.recentSales.map((s) => (
                        <div key={s.id} style={{ padding: 10, background: 'var(--surface-tint)', borderRadius: 8 }}>
                          <div style={{ fontWeight: 600 }}>{tzs(s.totalRevenue)} · {kg(s.quantityKg)}</div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{day(s.saleDate)} · {tzs(s.pricePerKg)} a kg · {s.paymentReceived ? 'Paid' : 'Not paid yet'}</div>
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

      {modal && <BuyerModal buyer={modal.buyer} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); setMessage({ tone: 'success', text }); list.reload(); if (selectedId) detail.reload(); }} />}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete" danger
          body={<>This removes the buyer from your list. A buyer with recorded sales cannot be deleted, so the sales history stays traceable.</>}
          onConfirm={async () => { try { await buyersApi.remove(deleting.id); setMessage({ tone: 'success', text: `${deleting.name} deleted.` }); if (selectedId === deleting.id) setSelectedId(null); list.reload(); } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'Could not delete the buyer.') }); } }}
          onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
