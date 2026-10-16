'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { inventoryApi } from '@/lib/api';
import { PAYMENT_BADGE, PAYMENT_LABELS, deliveryBuyers, deliveryVariety, kgs, tzs, type DeliveryRow } from '@/lib/aggregation';

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };
const h4: React.CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '16px 0 8px' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ color: 'var(--neutral-500)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{children}</span>
    </div>
  );
}

/** One delivery end to end: farmer, measures, price, farmer payment, storage, lot and buyer. */
export default function DeliveryDetailModal({
  recordId,
  canEdit,
  centres,
  onClose,
  onChanged,
}: {
  recordId: string;
  canEdit: boolean;
  centres: { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [r, setR] = useState<(DeliveryRow & { cropCycle?: { season: string } | null }) | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState('');
  const [variety, setVariety] = useState('');
  const [bags, setBags] = useState('');
  const [batch, setBatch] = useState('');
  const [centre, setCentre] = useState('');
  const [pay, setPay] = useState('');

  const fill = (row: DeliveryRow) => {
    setR(row);
    setPrice(row.pricePerKg != null ? String(row.pricePerKg) : '');
    setVariety(row.riceVariety ?? '');
    setBags(row.bags != null ? String(row.bags) : '');
    setBatch(row.batchNumber ?? '');
    setCentre(row.collectionCentre?.id ?? '');
  };
  useEffect(() => {
    inventoryApi.getRecord(recordId).then((res) => fill(res.data)).catch(() => setError('Could not load this delivery.'));
  }, [recordId]);

  const run = async (fn: () => Promise<{ data: DeliveryRow }>, okReset?: () => void) => {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      const full = await inventoryApi.getRecord(recordId);
      fill(full.data ?? res.data);
      okReset?.();
      onChanged();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = () =>
    run(() =>
      inventoryApi.updateRecord(recordId, {
        pricePerKg: price.trim() === '' ? undefined : Number(price),
        riceVariety: variety.trim() || undefined,
        bags: bags.trim() === '' ? undefined : Number(bags),
        batchNumber: batch.trim() || undefined,
        collectionCentreId: centre || undefined,
      }),
    );
  const savePayment = () => run(() => inventoryApi.recordPayment(recordId, { amount: Number(pay) }), () => setPay(''));

  const owed = r ? Math.max((r.totalValue ?? 0) - r.amountPaid, 0) : 0;
  const buyers = r ? deliveryBuyers(r) : [];

  return (
    <Modal title={r ? `Delivery ${r.trackingCode}` : 'Delivery'} subtitle={r ? `${r.farmer?.firstName} ${r.farmer?.lastName} · ${r.farm?.farmCode ?? ''}` : undefined} width="620px" onClose={onClose}
      footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>
      {error && <div className="alert-box alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!r ? <p style={{ fontSize: 13, color: 'var(--neutral-500)' }}>Loading…</p> : (
        <>
          <h4 style={{ ...h4, marginTop: 0 }}>Delivery</h4>
          <Row label="Farmer">{r.farmer?.firstName} {r.farmer?.lastName}{r.farmer?.controlNumber ? ` · ${r.farmer.controlNumber}` : ''}</Row>
          <Row label="Received">{new Date(r.receivedDate).toLocaleDateString()}</Row>
          <Row label="Collection centre">{r.collectionCentre?.name ?? '—'}</Row>
          <Row label="Weight / bags">{kgs(r.weightKg)}{r.bags != null ? ` · ${r.bags} bags` : ''}</Row>
          <Row label="Variety">{deliveryVariety(r) ?? '—'}</Row>
          <Row label="Grade / moisture">{r.qualityGrade ?? '—'}{r.moistureContentPct != null ? ` · ${r.moistureContentPct}%` : ''}</Row>

          <h4 style={h4}>Storage and sale</h4>
          <Row label="Warehouse">{r.warehouse?.name ?? 'Not in a warehouse yet'}{r.warehouseLocation ? ` · ${r.warehouseLocation}` : ''}</Row>
          <Row label="Storage batch">{r.batchNumber ?? '—'}</Row>
          <Row label="Export lot">{r.lotNumber ? <Link href={`/dashboard/traceability?q=${encodeURIComponent(r.lotNumber)}`}>{r.lotNumber}</Link> : '—'}</Row>
          <Row label="Buyer">{buyers.length ? buyers.join(', ') : '—'}</Row>
          <Row label="Status">{r.status.replace('_', ' ').toLowerCase()}</Row>

          <h4 style={h4}>Purchase and payment to the farmer</h4>
          <Row label="Price per kg">{tzs(r.pricePerKg)}</Row>
          <Row label="Total value">{tzs(r.totalValue)}</Row>
          <Row label="Paid so far">{tzs(r.amountPaid)}</Row>
          <Row label="Still owed">{r.totalValue == null ? '—' : tzs(owed)}</Row>
          <Row label="Payment status"><span className={`badge ${PAYMENT_BADGE[r.farmerPaymentStatus]}`}>{PAYMENT_LABELS[r.farmerPaymentStatus]}</span></Row>

          {canEdit && (
            <>
              <h4 style={h4}>Update</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Price per kg (TZS)</label><input className="input-field" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
                <div><label style={labelStyle}>Rice variety</label><input className="input-field" value={variety} onChange={(e) => setVariety(e.target.value)} /></div>
                <div><label style={labelStyle}>Bags</label><input className="input-field" type="number" min="0" value={bags} onChange={(e) => setBags(e.target.value)} /></div>
                <div><label style={labelStyle}>Storage batch number</label><input className="input-field" value={batch} onChange={(e) => setBatch(e.target.value)} /></div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Collection centre</label>
                  <select className="input-field" value={centre} onChange={(e) => setCentre(e.target.value)}>
                    <option value="">None</option>
                    {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-primary" style={{ marginTop: 10, fontSize: 12 }} disabled={busy} onClick={saveDetails}>{busy ? 'Saving…' : 'Save details'}</button>

              {r.totalValue != null && owed > 0 && (
                <div style={{ marginTop: 16 }}>
                  <label style={labelStyle}>Record a payment to the farmer (TZS)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input-field" type="number" min="1" step="any" placeholder={`up to ${Math.round(owed).toLocaleString()}`} value={pay} onChange={(e) => setPay(e.target.value)} />
                    <button className="btn-primary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} disabled={busy || !(Number(pay) > 0)} onClick={savePayment}>Record payment</button>
                    <button className="btn-secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} disabled={busy} onClick={() => setPay(String(owed))}>Pay all</button>
                  </div>
                </div>
              )}
              {r.totalValue == null && <p style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 10 }}>Set a price per kg to calculate the value and record payments.</p>}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
