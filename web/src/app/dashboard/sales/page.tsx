'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { buyersApi, inventoryApi, salesApi } from '@/lib/api';

const gateLabels: Record<string, string> = {
  crop_cycle: 'Source crop cycle',
  harvest: 'Harvest task',
  drying: 'Drying task',
  bagging: 'Bagging task',
  warehouse_receipt: 'Warehouse receipt',
  drying_moisture: 'Drying moisture at or below 14%',
};

const formatMissing = (missing: string[] = []) => missing.map((key) => gateLabels[key] || key.replace(/_/g, ' ')).join(', ');

export default function SalesPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [saleForm, setSaleForm] = useState({ lotId: '', buyerId: '', quantityKg: '', pricePerKg: '', fairtradePremium: '', packaging: '', saleDate: new Date().toISOString().slice(0, 10) });
  const [savingSale, setSavingSale] = useState(false);
  const [confirmation, setConfirmation] = useState<{ buyer: string; open: boolean } | null>(null);
  const load = () => salesApi.list().then((response) => setSales(response.data)).catch(() => setError('Unable to load cooperative sales.'));
  useEffect(() => {
    void load();
    buyersApi.list().then((response) => setBuyers(response.data || [])).catch(() => setError('Unable to load buyers.'));
    inventoryApi.lots().then((response) => setLots(response.data || [])).catch(() => setError('Unable to load lots.'));
  }, []);
  const readableError = (exception: any, fallback: string) => {
    const data = exception?.response?.data;
    const body = data?.message && typeof data.message === 'object' ? data.message : data;
    if (body?.code === 'MBALARI_QUALITY_GATE') return `Mbalari quality gate incomplete: ${formatMissing(body.missing || [])}`;
    const message = data?.message;
    if (typeof message === 'string' && message.includes('Mbalari quality gate')) return `${message}. Open the crop cycle calendar and complete warehouse readiness before selling.`;
    if (Array.isArray(message)) return message.join(', ');
    return message || fallback;
  };
  const createSale = async (event: FormEvent) => {
    event.preventDefault();
    setSavingSale(true);
    setError('');
    try {
      await salesApi.create({
        lotId: saleForm.lotId,
        buyerId: saleForm.buyerId,
        quantityKg: Number(saleForm.quantityKg),
        pricePerKg: Number(saleForm.pricePerKg),
        fairtradePremium: saleForm.fairtradePremium ? Number(saleForm.fairtradePremium) : undefined,
        packaging: saleForm.packaging || undefined,
        saleDate: new Date(saleForm.saleDate).toISOString(),
      });
      setSaleForm({ lotId: '', buyerId: '', quantityKg: '', pricePerKg: '', fairtradePremium: '', packaging: '', saleDate: new Date().toISOString().slice(0, 10) });
      void load();
    } catch (exception: any) {
      setError(readableError(exception, 'Unable to create cooperative sale.'));
    } finally {
      setSavingSale(false);
    }
  };
  const collect = async (sale: any) => {
    try {
      await salesApi.collect(sale.id);
      setConfirmation({ buyer: sale.buyer.name, open: true });
      void load();
    } catch (exception: any) {
      setError(readableError(exception, 'Unable to initiate buyer collection.'));
    }
  };
  const payoutAction = async (sale: any, action: 'approve' | 'reconcile') => {
    try {
      if (action === 'approve') await salesApi.approvePayouts(sale.id);
      else await salesApi.reconcilePayouts(sale.id);
      setConfirmation({ buyer: action === 'approve' ? `Payouts for ${sale.invoiceNumber} are now approved and queued with ClickPesa.` : `Payout statuses for ${sale.invoiceNumber} have been reconciled.`, open: true });
      void load();
    } catch (exception: any) { setError(readableError(exception, 'Unable to process payout action.')); }
  };
  const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalRevenue || 0), 0);
  const pendingSales = sales.filter((sale) => !sale.paymentReceived).length;
  return <div className="page-shell">
    <div className="page-heading">
      <div>
        <div className="page-kicker">Commercial</div>
        <h1 className="page-title">Cooperative Sales</h1>
        <p className="page-subtitle">Create buyer sales from traceable lots, enforce Mbalari warehouse readiness, and manage buyer collection plus farmer payout actions.</p>
      </div>
    </div>
    {error && <div className="alert-box alert-danger">{error}</div>}
    <form onSubmit={createSale} className="action-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Create Sale</h2>
          <p className="panel-copy">Select a lot and buyer, then enter sale terms. The sale is blocked if any source inventory record has not passed the Mbalari quality gate.</p>
        </div>
        <span className="badge badge-blue">{lots.length} lots available</span>
      </div>
      <div className="form-grid">
        <label className="form-label">Lot<select className="input-field" value={saleForm.lotId} onChange={(event) => setSaleForm((current) => ({ ...current, lotId: event.target.value }))} required>
          <option value="">Select lot</option>
          {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNumber} · {lot.totalWeightKg ?? 0} kg</option>)}
        </select></label>
        <label className="form-label">Buyer<select className="input-field" value={saleForm.buyerId} onChange={(event) => setSaleForm((current) => ({ ...current, buyerId: event.target.value }))} required>
          <option value="">Select buyer</option>
          {buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}
        </select></label>
        <label className="form-label">Quantity<input className="input-field" type="number" min="0.01" step="0.01" placeholder="kg" value={saleForm.quantityKg} onChange={(event) => setSaleForm((current) => ({ ...current, quantityKg: event.target.value }))} required /></label>
        <label className="form-label">Price per kg<input className="input-field" type="number" min="0" step="0.01" placeholder="TZS" value={saleForm.pricePerKg} onChange={(event) => setSaleForm((current) => ({ ...current, pricePerKg: event.target.value }))} required /></label>
        <label className="form-label">Fairtrade premium<input className="input-field" type="number" min="0" step="0.01" placeholder="Optional" value={saleForm.fairtradePremium} onChange={(event) => setSaleForm((current) => ({ ...current, fairtradePremium: event.target.value }))} /></label>
        <label className="form-label">Packaging<input className="input-field" placeholder="e.g. 50kg bags" value={saleForm.packaging} onChange={(event) => setSaleForm((current) => ({ ...current, packaging: event.target.value }))} /></label>
        <label className="form-label">Sale date<input className="input-field" type="date" value={saleForm.saleDate} onChange={(event) => setSaleForm((current) => ({ ...current, saleDate: event.target.value }))} required /></label>
      </div>
      <button className="btn-primary" disabled={savingSale} style={{ marginTop: 12 }}>{savingSale ? 'Creating...' : 'Create sale'}</button>
    </form>
    <div className="metric-grid">
      {[{ label: 'Sales', value: sales.length, color: 'var(--blue-500)' }, { label: 'Total revenue', value: `TZS ${Math.round(totalRevenue).toLocaleString()}`, color: 'var(--accent)' }, { label: 'Pending payment', value: pendingSales, color: 'var(--gold-400)' }].map((metric) => <div key={metric.label} className="stat-card" style={{ padding: 16 }}><div style={{ color: metric.color, fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 800 }}>{metric.value}</div><div className="muted" style={{ fontSize: 12 }}>{metric.label}</div></div>)}
    </div>
    <div className="table-panel"><div className="section-toolbar"><strong>Sales Register</strong><span className="muted">{sales.length} invoices</span></div><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Invoice</th><th>Buyer</th><th>Lot</th><th>Revenue</th><th>Farmers</th><th>Status</th><th /></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td style={{ fontFamily: 'monospace', color: 'var(--blue-300)', fontWeight: 700 }}>{sale.invoiceNumber}</td><td>{sale.buyer.name}</td><td>{sale.lot.lotNumber}</td><td>TZS {Math.round(sale.totalRevenue).toLocaleString()}</td><td>{sale._count.apportionments}</td><td><span className={`badge ${sale.paymentReceived ? 'badge-green' : sale.buyerOrderReference ? 'badge-blue' : 'badge-gold'}`}>{sale.paymentReceived ? 'Settled' : sale.buyerOrderReference ? 'Collection pending' : 'Awaiting buyer payment'}</span></td><td>{!sale.paymentReceived && <><button className="btn-secondary" onClick={() => void collect(sale)}>Collect</button>{' '}<button className="btn-secondary" onClick={async () => { await salesApi.settle(sale.id); void load(); }}>Manual settle</button></>}{sale.paymentReceived && <><button className="btn-secondary" onClick={() => void payoutAction(sale, 'approve')}>Approve payouts</button>{' '}<button className="btn-secondary" onClick={() => void payoutAction(sale, 'reconcile')}>Reconcile</button></>}</td></tr>)}</tbody></table></div></div>
    {confirmation?.open && <div role="dialog" aria-modal="true" aria-labelledby="collection-title" style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.45)', display: 'grid', placeItems: 'center', padding: 20, zIndex: 50 }}><div className="glass-card" style={{ maxWidth: 420, width: '100%', padding: 24 }}><h2 id="collection-title" style={{ marginTop: 0 }}>Operation submitted</h2><p style={{ color: 'var(--neutral-600)', lineHeight: 1.5 }}>{confirmation.buyer}</p><button onClick={() => setConfirmation(null)} style={{ background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 8, padding: '10px 16px' }}>Done</button></div></div>}
  </div>;
}
