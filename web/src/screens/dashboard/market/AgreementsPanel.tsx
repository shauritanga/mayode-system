'use client';
import { useEffect, useMemo, useState } from 'react';
import { agreementsApi, buyerOrdersApi, buyersApi, uploadsApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';
import { downloadCsv } from '@/lib/download';
import { PAYMENT_BADGE, ProgressBar, day, kg, tzs } from './format';

interface Progress { deliveredKg: number; deliveredValue: number; paidValue: number; outstandingValue: number; progressPct: number; paymentStatus: string }
interface Agreement {
  id: string; reference: string; status: string; expired: boolean; buyerId: string; buyerOrderId: string | null;
  riceVariety: string | null; qualityTerms: string | null; quantityKg: number; pricePerKg: number; deliveryLocation: string | null;
  paymentTerms: string | null; startDate: string; endDate: string; signedAt: string | null; documentUrl: string | null; notes: string | null;
  buyer: { id: string; name: string }; progress: Progress;
  sales: { id: string; invoiceNumber: string; quantityKg: number; totalRevenue: number; paymentReceived: boolean; saleDate: string }[];
}
interface Buyer { id: string; name: string; deliveryLocation?: string | null; preferredVarieties?: string[] }
interface Order { id: string; buyerId: string; quantityRequiredKg: number; riceVariety?: string; buyer?: { name: string }; status: string }

const STATUS_BADGE: Record<string, string> = { DRAFT: 'badge-gray', ACTIVE: 'badge-blue', FULFILLED: 'badge-green', CANCELLED: 'badge-red' };
const EMPTY = { buyerId: '', buyerOrderId: '', riceVariety: '', qualityTerms: '', quantityKg: '', pricePerKg: '', deliveryLocation: '', paymentTerms: '', startDate: '', endDate: '', documentUrl: '', notes: '' };

export default function AgreementsPanel() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasPermission(user, 'buyer_orders', 'CREATE');
  const canEdit = hasPermission(user, 'buyer_orders', 'EDIT');
  const canDelete = hasPermission(user, 'buyer_orders', 'DELETE');

  const [rows, setRows] = useState<Agreement[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Agreement | 'new' | null>(null);
  const [viewing, setViewing] = useState<Agreement | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () =>
    Promise.all([agreementsApi.list(), buyersApi.list(), buyerOrdersApi.getAll()])
      .then(([a, b, o]) => { setRows(a.data || []); setBuyers(b.data || []); setOrders(o.data || []); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load purchase agreements.')))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const open = (a: Agreement | 'new') => {
    setFormError('');
    setForm(a === 'new' ? EMPTY : {
      buyerId: a.buyerId, buyerOrderId: a.buyerOrderId ?? '', riceVariety: a.riceVariety ?? '', qualityTerms: a.qualityTerms ?? '',
      quantityKg: String(a.quantityKg), pricePerKg: String(a.pricePerKg), deliveryLocation: a.deliveryLocation ?? '',
      paymentTerms: a.paymentTerms ?? '', startDate: a.startDate.slice(0, 10), endDate: a.endDate.slice(0, 10),
      documentUrl: a.documentUrl ?? '', notes: a.notes ?? '',
    });
    setEditing(a);
  };

  const pickBuyer = (id: string) => {
    const b = buyers.find((x) => x.id === id);
    setForm((f) => ({ ...f, buyerId: id, buyerOrderId: '', deliveryLocation: f.deliveryLocation || b?.deliveryLocation || '', riceVariety: f.riceVariety || b?.preferredVarieties?.[0] || '' }));
  };
  const pickOrder = (id: string) => {
    const o = orders.find((x) => x.id === id);
    setForm((f) => ({ ...f, buyerOrderId: id, quantityKg: f.quantityKg || (o ? String(o.quantityRequiredKg) : ''), riceVariety: f.riceVariety || o?.riceVariety || '' }));
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { const r = await uploadsApi.upload(file); setForm((f) => ({ ...f, documentUrl: r.data.url })); }
    catch (e) { setFormError(apiErrorMessage(e, 'Could not upload the document.')); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true); setFormError('');
    try {
      const body = {
        riceVariety: form.riceVariety || undefined, qualityTerms: form.qualityTerms || undefined,
        quantityKg: Number(form.quantityKg), pricePerKg: Number(form.pricePerKg),
        deliveryLocation: form.deliveryLocation || undefined, paymentTerms: form.paymentTerms || undefined,
        startDate: form.startDate, endDate: form.endDate, documentUrl: form.documentUrl || undefined, notes: form.notes || undefined,
      };
      if (editing === 'new') await agreementsApi.create({ ...body, buyerId: form.buyerId, buyerOrderId: form.buyerOrderId || undefined });
      else if (editing) {
        // An active agreement's commercial terms are fixed; send only what may change.
        const patch = editing.status === 'ACTIVE'
          ? { deliveryLocation: body.deliveryLocation, paymentTerms: body.paymentTerms, endDate: body.endDate, documentUrl: body.documentUrl, notes: body.notes }
          : body;
        await agreementsApi.update(editing.id, patch);
      }
      setEditing(null);
      await load();
    } catch (e) { setFormError(apiErrorMessage(e, 'Could not save the agreement.')); }
    finally { setSaving(false); }
  };

  const move = async (a: Agreement, next: string, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    try { await agreementsApi.setStatus(a.id, next); setViewing(null); await load(); }
    catch (e) { setError(apiErrorMessage(e, 'Could not change the agreement status.')); }
  };
  const remove = async (a: Agreement) => {
    if (!window.confirm(`Delete draft ${a.reference}?`)) return;
    try { await agreementsApi.remove(a.id); setViewing(null); await load(); }
    catch (e) { setError(apiErrorMessage(e, 'Could not delete the agreement.')); }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!status || (status === 'EXPIRED' ? r.expired : r.status === status)) && (!q || r.reference.toLowerCase().includes(q) || r.buyer.name.toLowerCase().includes(q)));
  }, [rows, status, search]);

  const buyerOrders = orders.filter((o) => o.buyerId === form.buyerId && o.status !== 'CANCELLED');
  const locked = editing !== 'new' && editing?.status === 'ACTIVE';
  const field = (key: keyof typeof EMPTY, label: string, type = 'text', disabled = false) => (
    <label className="form-label">{label}
      <input className="input-field" type={type} disabled={disabled} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="input-field" type="search" placeholder="Search reference or buyer…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
          <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 170 }} aria-label="Status">
            <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option>
            <option value="EXPIRED">Past end date</option><option value="FULFILLED">Fulfilled</option><option value="CANCELLED">Cancelled</option>
          </select>
          <button className="btn-secondary" disabled={!shown.length} onClick={() => downloadCsv('purchase-agreements.csv', shown.map((a) => ({
            Reference: a.reference, Buyer: a.buyer.name, Status: a.status, Variety: a.riceVariety ?? '', QuantityKg: a.quantityKg, PricePerKg: a.pricePerKg,
            DeliveredKg: a.progress.deliveredKg, Start: day(a.startDate), End: day(a.endDate), DeliveryLocation: a.deliveryLocation ?? '', Payment: a.progress.paymentStatus })))}>Export CSV</button>
        </div>
        {canCreate && <button className="btn-primary" onClick={() => open('new')}>+ New agreement</button>}
      </div>

      {error && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="table-panel">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
          : shown.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No purchase agreements yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Buyer</th><th>Variety</th><th>Quantity</th><th>Price/kg</th><th>Period</th><th>Delivered</th><th>Payment</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.map((a) => {
                  const [pc, pl] = PAYMENT_BADGE[a.progress.paymentStatus];
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.reference}</td><td>{a.buyer.name}</td><td>{a.riceVariety ?? '—'}</td>
                      <td>{kg(a.quantityKg)}</td><td>{tzs(a.pricePerKg)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{day(a.startDate)} – {day(a.endDate)}</td>
                      <td><ProgressBar pct={a.progress.progressPct} /></td>
                      <td><span className={`badge ${pc}`}>{pl}</span></td>
                      <td>
                        <span className={`badge ${a.expired ? 'badge-red' : STATUS_BADGE[a.status]}`}>{a.expired ? 'Past end date' : a.status.toLowerCase()}</span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn-secondary" onClick={() => setViewing(a)}>Open</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <Modal title={viewing.reference} subtitle={`${viewing.buyer.name} · ${viewing.status.toLowerCase()}${viewing.expired ? ' · past end date' : ''}`} width="640px" onClose={() => setViewing(null)}
          footer={<>
            {canDelete && viewing.status === 'DRAFT' && <button className="btn-secondary" onClick={() => remove(viewing)}>Delete</button>}
            {canEdit && (viewing.status === 'DRAFT' || viewing.status === 'ACTIVE') && <button className="btn-secondary" onClick={() => { const v = viewing; setViewing(null); open(v); }}>Edit</button>}
            {canEdit && viewing.status === 'DRAFT' && <button className="btn-primary" onClick={() => move(viewing, 'ACTIVE', `Activate ${viewing.reference}? Its quantity, price and quality terms will be fixed.`)}>Activate (signed)</button>}
            {canEdit && viewing.status === 'ACTIVE' && <button className="btn-primary" onClick={() => move(viewing, 'FULFILLED', 'Mark this agreement as fulfilled?')}>Mark fulfilled</button>}
            {canEdit && (viewing.status === 'DRAFT' || viewing.status === 'ACTIVE') && <button className="btn-secondary" style={{ color: 'var(--red-500)' }} onClick={() => move(viewing, 'CANCELLED', `Cancel ${viewing.reference}? This cannot be undone.`)}>Cancel agreement</button>}
          </>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
            {[
              ['Quantity', kg(viewing.quantityKg)], ['Price per kg', tzs(viewing.pricePerKg)], ['Value', tzs(viewing.quantityKg * viewing.pricePerKg)],
              ['Variety', viewing.riceVariety ?? '—'], ['Delivery location', viewing.deliveryLocation ?? '—'], ['Period', `${day(viewing.startDate)} – ${day(viewing.endDate)}`],
              ['Signed', viewing.signedAt ? day(viewing.signedAt) : 'Not yet'], ['Payment terms', viewing.paymentTerms ?? '—'],
            ].map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
            ))}
          </div>
          {viewing.qualityTerms && <p style={{ fontSize: 13 }}><strong>Quality:</strong> {viewing.qualityTerms}</p>}
          {viewing.notes && <p style={{ fontSize: 13 }}><strong>Notes:</strong> {viewing.notes}</p>}
          {viewing.documentUrl && <p style={{ fontSize: 13 }}><a href={viewing.documentUrl} target="_blank" rel="noreferrer">View agreement document</a></p>}
          <div style={{ margin: '14px 0 6px', fontWeight: 700, fontSize: 13 }}>Deliveries — {kg(viewing.progress.deliveredKg)} of {kg(viewing.quantityKg)}</div>
          <ProgressBar pct={viewing.progress.progressPct} />
          <div style={{ fontSize: 12, color: 'var(--neutral-500)', margin: '6px 0 10px' }}>
            {tzs(viewing.progress.paidValue)} paid · {tzs(viewing.progress.outstandingValue)} awaiting payment
          </div>
          {viewing.sales.length === 0 ? <div style={{ fontSize: 13, color: 'var(--neutral-500)' }}>No sales booked against this agreement yet. Choose it when reserving stock in Sale Orders.</div> : (
            <table className="data-table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Quantity</th><th>Value</th><th>Payment</th></tr></thead>
              <tbody>{viewing.sales.map((s) => (
                <tr key={s.id}><td>{s.invoiceNumber}</td><td>{day(s.saleDate)}</td><td>{kg(s.quantityKg)}</td><td>{tzs(s.totalRevenue)}</td>
                  <td><span className={`badge ${s.paymentReceived ? 'badge-green' : 'badge-gold'}`}>{s.paymentReceived ? 'Paid' : 'Awaiting'}</span></td></tr>
              ))}</tbody>
            </table>
          )}
        </Modal>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New purchase agreement' : `Edit ${editing.reference}`} subtitle={locked ? 'Active: quantity, price, variety and quality are fixed.' : 'Saved as a draft until you activate it.'} width="640px" onClose={() => setEditing(null)}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn-primary" disabled={saving || uploading || !form.buyerId || !form.quantityKg || !form.pricePerKg || !form.startDate || !form.endDate} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
          {formError && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <label className="form-label">Buyer
              <select className="input-field" disabled={editing !== 'new'} value={form.buyerId} onChange={(e) => pickBuyer(e.target.value)}>
                <option value="">Select buyer</option>{buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
            <label className="form-label">Linked buyer order (optional)
              <select className="input-field" disabled={editing !== 'new' || !form.buyerId} value={form.buyerOrderId} onChange={(e) => pickOrder(e.target.value)}>
                <option value="">None</option>{buyerOrders.map((o) => <option key={o.id} value={o.id}>{kg(o.quantityRequiredKg)}{o.riceVariety ? ` · ${o.riceVariety}` : ''} ({o.status.replace(/_/g, ' ').toLowerCase()})</option>)}
              </select></label>
            {field('quantityKg', 'Quantity (kg)', 'number', locked)}
            {field('pricePerKg', 'Agreed price per kg (TZS)', 'number', locked)}
            {field('riceVariety', 'Rice variety', 'text', locked)}
            {field('deliveryLocation', 'Delivery location')}
            {field('startDate', 'Starts', 'date', locked)}
            {field('endDate', 'Ends', 'date')}
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Quality terms
              <input className="input-field" disabled={locked} placeholder="Grade, moisture, broken %, packaging…" value={form.qualityTerms} onChange={(e) => setForm({ ...form, qualityTerms: e.target.value })} /></label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Payment terms
              <input className="input-field" placeholder="e.g. 50% on loading, 50% within 14 days" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} /></label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Signed agreement (PDF or photo)
              <input className="input-field" type="file" accept="application/pdf,image/*" onChange={(e) => upload(e.target.files?.[0])} />
              {uploading ? <span style={{ fontSize: 12 }}>Uploading…</span> : form.documentUrl && <a style={{ fontSize: 12 }} href={form.documentUrl} target="_blank" rel="noreferrer">Current document</a>}</label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Notes
              <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}
