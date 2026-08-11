'use client';
import { FormEvent, useEffect, useState } from 'react';
import { buyerPortalApi, buyerOrdersApi, buyersApi } from '@/lib/api';
export default function BuyerPage() {
  const [data, setData] = useState<any>(null); const [reference, setReference] = useState(''); const [trace, setTrace] = useState<any>(null); const [error, setError] = useState('');
  const [buyers, setBuyers] = useState<any[]>([]); const [buyerId, setBuyerId] = useState(''); const [orders, setOrders] = useState<any[]>([]);
  const [orderForm, setOrderForm] = useState({ riceVariety: '', quantityRequiredKg: '', qualityRequirements: '' }); const [orderMessage, setOrderMessage] = useState('');
  useEffect(() => { buyerPortalApi.dashboard().then((r) => setData(r.data)).catch(() => setError('Unable to load buyer dashboard.')); buyersApi.list().then((r) => setBuyers(r.data || [])).catch(() => setBuyers([])); }, []);
  useEffect(() => { if (!buyerId) { setOrders([]); return; } buyerOrdersApi.getForBuyer(buyerId).then((r) => setOrders(r.data || [])).catch(() => setOrders([])); }, [buyerId]);
  const lookup = async (e: FormEvent) => { e.preventDefault(); setError(''); try { setTrace((await buyerPortalApi.traceability(reference)).data); } catch { setTrace(null); setError('No completed sale was found for that invoice, Lot, or tracking code.'); } };
  const submitOrder = async (e: FormEvent) => { e.preventDefault(); setOrderMessage(''); try { await buyerOrdersApi.create({ buyerId, riceVariety: orderForm.riceVariety || undefined, quantityRequiredKg: Number(orderForm.quantityRequiredKg), qualityRequirements: orderForm.qualityRequirements || undefined }); setOrderForm({ riceVariety: '', quantityRequiredKg: '', qualityRequirements: '' }); setOrderMessage('Order submitted.'); const r = await buyerOrdersApi.getForBuyer(buyerId); setOrders(r.data || []); } catch (err: any) { setOrderMessage(err?.response?.data?.message || 'Unable to submit order.'); } };
  return <div><h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800 }}>Buyer Portal</h1><p style={{ color: 'var(--neutral-500)', margin: '8px 0 24px' }}>Aggregate MAYODE production and privacy-safe traceability indicators.</p>{error && <p style={{ color: 'var(--red-400)' }}>{error}</p>}{!data ? <p>Loading…</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16 }}>{[['Farmers', data.totalFarmers], ['Hectares', data.totalHectares], ['Yield / ha', `${Math.round(data.averageYieldPerHectare)} kg`], ['Revenue', `TZS ${Math.round(data.totalRevenue).toLocaleString()}`]].map(([label, value]) => <div key={String(label)} className="stat-card" style={{ padding: 22 }}><div style={{ color: 'var(--neutral-500)' }}>{label}</div><strong style={{ display: 'block', fontSize: 24, marginTop: 8 }}>{value}</strong></div>)}</div>}<form onSubmit={lookup} className="glass-card" style={{ padding: 20, marginTop: 24, display: 'flex', gap: 10 }}><input value={reference} onChange={(e) => setReference(e.target.value)} required placeholder="Invoice, Lot, or inventory tracking code" style={{ flex: 1, padding: 10 }} /><button type="submit" style={{ background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 8, padding: '10px 16px' }}>Trace</button></form>{trace && <div className="glass-card" style={{ padding: 20, marginTop: 16 }}><strong>{trace.invoiceNumber} · {trace.lot.lotNumber}</strong><p style={{ color: 'var(--neutral-500)' }}>{trace.sourceRecords.length} source inventory records · {trace.lot.totalWeightKg.toLocaleString()} kg</p><div style={{ display: 'grid', gap: 8 }}>{trace.sourceRecords.map((record: any) => <div key={record.trackingCode} style={{ padding: 10, background: 'var(--surface-tint)', borderRadius: 8 }}>{record.trackingCode} · {record.weightKg} kg · {record.qualityGrade || 'Ungraded'} · {record.region || 'Region not recorded'}</div>)}</div></div>}
    <div className="glass-card" style={{ padding: 20, marginTop: 24 }}>
      <strong>My rice requirements</strong>
      <p style={{ color: 'var(--neutral-500)', margin: '4px 0 14px' }}>Select your company, then submit or review purchase requirements.</p>
      <select className="input-field" value={buyerId} onChange={(e) => setBuyerId(e.target.value)} style={{ maxWidth: 320, marginBottom: 14 }}>
        <option value="">Select your company</option>
        {buyers.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {buyerId && <>
        {orderMessage && <p style={{ color: orderMessage.includes('Unable') ? 'var(--red-400)' : 'var(--accent)' }}>{orderMessage}</p>}
        <form onSubmit={submitOrder} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <input className="input-field" placeholder="Preferred variety" value={orderForm.riceVariety} onChange={(e) => setOrderForm((c) => ({ ...c, riceVariety: e.target.value }))} style={{ width: 160 }} />
          <input className="input-field" required type="number" min="0.01" step="0.01" placeholder="Quantity (kg)" value={orderForm.quantityRequiredKg} onChange={(e) => setOrderForm((c) => ({ ...c, quantityRequiredKg: e.target.value }))} style={{ width: 160 }} />
          <input className="input-field" placeholder="Quality requirements" value={orderForm.qualityRequirements} onChange={(e) => setOrderForm((c) => ({ ...c, qualityRequirements: e.target.value }))} style={{ width: 220 }} />
          <button type="submit" className="btn-primary">Submit requirement</button>
        </form>
        <div style={{ display: 'grid', gap: 8 }}>
          {orders.map((order: any) => <div key={order.id} style={{ padding: 10, background: 'var(--surface-tint)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>{order.riceVariety || 'Any variety'} · {order.quantityRequiredKg.toLocaleString()} kg{order.qualityRequirements ? ` · ${order.qualityRequirements}` : ''}</span>
            <span className="badge badge-blue">{order.status.replace(/_/g, ' ')}</span>
          </div>)}
          {!orders.length && <p style={{ color: 'var(--neutral-500)' }}>No requirements submitted yet.</p>}
        </div>
      </>}
    </div>
  </div>;
}
