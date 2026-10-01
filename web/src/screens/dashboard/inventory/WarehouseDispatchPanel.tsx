'use client';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { salesApi } from '@/lib/api';

interface DispatchLookupResult {
  invoiceNumber: string;
  saleDate: string;
  buyer?: { name: string; contactPerson?: string | null; contactPhone?: string | null } | null;
  riceVariety?: string | null;
  quantityKg: number;
  packaging?: string | null;
  totalRevenue: number;
  paymentReceived: boolean;
  lot: { lotNumber: string };
  dispatch: {
    transportMode: 'BUYER_OWN_VEHICLE' | 'MAYODE_ARRANGED';
    transportFee?: number | null;
    vehiclePlateNumber: string;
    driverName: string;
    driverPhone: string;
    releasedAt: string;
    notes?: string | null;
    releasedBy?: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
}

const emptyForm = {
  transportMode: 'BUYER_OWN_VEHICLE' as 'BUYER_OWN_VEHICLE' | 'MAYODE_ARRANGED',
  transportFee: '',
  vehiclePlateNumber: '',
  driverName: '',
  driverPhone: '',
  notes: '',
};

export default function WarehouseDispatchPanel() {
  const [reference, setReference] = useState('');
  const [result, setResult] = useState<DispatchLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const errorText = (exception: any) => {
    const message = exception?.response?.data?.message;
    return Array.isArray(message) ? message.join(', ') : message || 'Something went wrong.';
  };

  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = reference.trim();
    if (!trimmed) return;
    setLookupLoading(true);
    setLookupError('');
    setSubmitError('');
    try {
      const res = await salesApi.dispatchLookup(trimmed);
      setResult(res.data);
      setForm({ ...emptyForm });
    } catch (exception: any) {
      setResult(null);
      setLookupError(errorText(exception) || 'No sale found for that reference.');
    } finally {
      setLookupLoading(false);
    }
  };

  const confirmRelease = async (event: FormEvent) => {
    event.preventDefault();
    if (!result) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await salesApi.createDispatch(result.invoiceNumber, {
        transportMode: form.transportMode,
        transportFee: form.transportMode === 'MAYODE_ARRANGED' && form.transportFee !== '' ? Number(form.transportFee) : undefined,
        vehiclePlateNumber: form.vehiclePlateNumber,
        driverName: form.driverName,
        driverPhone: form.driverPhone,
        notes: form.notes || undefined,
      });
      const res = await salesApi.dispatchLookup(result.invoiceNumber);
      setResult(res.data);
    } catch (exception: any) {
      setSubmitError(errorText(exception));
    } finally {
      setSubmitting(false);
    }
  };

  const feeRequired = form.transportMode === 'MAYODE_ARRANGED';

  return (
    <div>
      <form onSubmit={lookup} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Look up a sale reference</h2>
            <p className="panel-copy">
              Enter the invoice number the buyer was given at purchase (e.g. INV-2026-0001) to see what
              they bought and confirm release at the gate.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input-field"
            style={{ flex: 1, minWidth: 240 }}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Invoice number"
            required
          />
          <button className="btn-primary" disabled={lookupLoading}>
            {lookupLoading ? 'Looking up…' : 'Look up'}
          </button>
        </div>
        {lookupError && <div className="alert-box alert-danger" style={{ marginTop: 12 }}>{lookupError}</div>}
      </form>

      {result && (
        <div className="glass-card" style={{ padding: 22, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 800 }}>
                {result.invoiceNumber} · {result.lot.lotNumber}
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                {result.buyer?.name || 'Unknown buyer'}
                {result.riceVariety ? ` · ${result.riceVariety}` : ''} · {result.quantityKg.toLocaleString()} kg
                {result.packaging ? ` · ${result.packaging}` : ''}
              </p>
              {(result.buyer?.contactPerson || result.buyer?.contactPhone) && (
                <p className="muted" style={{ marginTop: 2, fontSize: 12 }}>
                  Contact: {result.buyer?.contactPerson || '—'} {result.buyer?.contactPhone ? `· ${result.buyer.contactPhone}` : ''}
                </p>
              )}
            </div>
            <span className={`badge ${result.paymentReceived ? 'badge-green' : 'badge-gold'}`}>
              {result.paymentReceived ? 'Payment settled' : 'Payment pending'}
            </span>
          </div>

          {result.dispatch ? (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                background: 'var(--surface-tint)',
                borderRadius: 10,
              }}
            >
              <strong style={{ fontSize: 13 }}>Already released</strong>
              <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Released {new Date(result.dispatch.releasedAt).toLocaleString()} by{' '}
                {[result.dispatch.releasedBy?.firstName, result.dispatch.releasedBy?.lastName].filter(Boolean).join(' ') || 'staff'}
              </p>
              <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {result.dispatch.transportMode === 'MAYODE_ARRANGED'
                  ? `MAYODE-arranged transport${result.dispatch.transportFee ? ` · fee paid: ${result.dispatch.transportFee.toLocaleString()}` : ''}`
                  : "Buyer's own vehicle"}
                {' · '}Vehicle {result.dispatch.vehiclePlateNumber} · Driver {result.dispatch.driverName} ({result.dispatch.driverPhone})
              </p>
              {result.dispatch.notes && (
                <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>Notes: {result.dispatch.notes}</p>
              )}
            </div>
          ) : (
            <form onSubmit={confirmRelease} style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <label>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Transport</div>
                  <select
                    className="input-field"
                    value={form.transportMode}
                    onChange={(e) =>
                      setForm({ ...form, transportMode: e.target.value as typeof form.transportMode })
                    }
                  >
                    <option value="BUYER_OWN_VEHICLE">Buyer's own vehicle</option>
                    <option value="MAYODE_ARRANGED">MAYODE-arranged transport</option>
                  </select>
                </label>
                {feeRequired && (
                  <label>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>Transport fee paid</div>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={form.transportFee}
                      onChange={(e) => setForm({ ...form, transportFee: e.target.value })}
                      required={feeRequired}
                    />
                  </label>
                )}
                <label>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Vehicle plate number</div>
                  <input
                    className="input-field"
                    value={form.vehiclePlateNumber}
                    onChange={(e) => setForm({ ...form, vehiclePlateNumber: e.target.value })}
                    required
                  />
                </label>
                <label>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Driver name</div>
                  <input
                    className="input-field"
                    value={form.driverName}
                    onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                    required
                  />
                </label>
                <label>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Driver phone</div>
                  <input
                    className="input-field"
                    value={form.driverPhone}
                    onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
                    required
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Notes (optional)</div>
                  <input
                    className="input-field"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </label>
              </div>
              {submitError && <div className="alert-box alert-danger" style={{ marginTop: 12 }}>{submitError}</div>}
              <button className="btn-primary" style={{ marginTop: 16 }} disabled={submitting}>
                {submitting ? 'Confirming…' : 'Confirm release'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
