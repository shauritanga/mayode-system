'use client';

import { FormEvent, useEffect, useState } from 'react';
import { buyerPortalApi } from '@/lib/api';

function money(n: number) {
  return `TZS ${Math.round(n || 0).toLocaleString()}`;
}

function kg(n: number) {
  return `${Math.round(n || 0).toLocaleString()} kg`;
}

export default function BuyerPage() {
  const [data, setData] = useState<any>(null);
  const [reference, setReference] = useState('');
  const [trace, setTrace] = useState<any>(null);
  const [error, setError] = useState('');
  const [orderForm, setOrderForm] = useState({
    riceVariety: '',
    quantityRequiredKg: '',
    qualityRequirements: '',
  });
  const [orderMessage, setOrderMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError('');
    buyerPortalApi
      .dashboard()
      .then((r) => setData(r.data))
      .catch(() => setError('Unable to load buyer dashboard.'));
  };

  useEffect(() => {
    load();
  }, []);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setTrace((await buyerPortalApi.traceability(reference)).data);
    } catch (err: any) {
      setTrace(null);
      setError(
        err?.response?.data?.message ||
          'No completed sale was found for that invoice, Lot, or tracking code.',
      );
    }
  };

  const submitOrder = async (e: FormEvent) => {
    e.preventDefault();
    setOrderMessage('');
    setSaving(true);
    try {
      await buyerPortalApi.createOrder({
        riceVariety: orderForm.riceVariety || undefined,
        quantityRequiredKg: Number(orderForm.quantityRequiredKg),
        qualityRequirements: orderForm.qualityRequirements || undefined,
      });
      setOrderForm({ riceVariety: '', quantityRequiredKg: '', qualityRequirements: '' });
      setOrderMessage('Requirement submitted.');
      load();
    } catch (err: any) {
      setOrderMessage(
        err?.response?.data?.message || 'Unable to submit requirement.',
      );
    } finally {
      setSaving(false);
    }
  };

  const coop = data?.cooperative;
  const metrics = data?.metrics;
  const matched = data?.matched;

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Partner access</div>
          <h1 className="page-title">Buyer Portal</h1>
          <p className="page-subtitle">
            Your purchase requirements, fulfilled lots, and privacy-safe
            traceability — scoped to your company when linked.
          </p>
        </div>
        {data?.company?.name && (
          <div className="badge badge-green" style={{ fontSize: 13, padding: '8px 14px' }}>
            {data.company.name}
            {data.company.isCertified ? ' · Fairtrade' : ''}
          </div>
        )}
      </div>

      {error && <div className="alert-box alert-danger">{error}</div>}
      {data?.hint && !matched && (
        <div className="alert-box" style={{ marginBottom: 16 }}>
          {data.hint}
        </div>
      )}

      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {matched && metrics && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
                gap: 14,
                marginBottom: 20,
              }}
            >
              {[
                ['Open requirements', metrics.openOrders],
                ['Total requirements', metrics.totalOrders],
                ['Purchases', metrics.salesCount],
                ['Volume bought', kg(metrics.totalPurchasedKg)],
                ['Spend', money(metrics.totalSpend)],
              ].map(([label, value]) => (
                <div key={String(label)} className="stat-card" style={{ padding: 18 }}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {label}
                  </div>
                  <strong style={{ display: 'block', fontSize: 22, marginTop: 6 }}>
                    {value}
                  </strong>
                </div>
              ))}
            </div>
          )}

          {coop && (
            <div className="action-panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Cooperative snapshot</h2>
                  <p className="panel-copy">
                    Aggregate MAYODE production indicators (no farmer PII).
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',
                  gap: 12,
                }}
              >
                {[
                  ['Farmers', coop.totalFarmers],
                  ['Hectares', Math.round(coop.totalHectares || 0)],
                  ['Yield / ha', `${Math.round(coop.averageYieldPerHectare || 0)} kg`],
                  ['Co-op revenue', money(coop.totalRevenue)],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {label}
                    </div>
                    <strong style={{ fontSize: 18 }}>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {matched && (
            <div className="action-panel" style={{ marginBottom: 20 }}>
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Submit rice requirement</h2>
                  <p className="panel-copy">
                    Orders are filed under {data.company?.name}. Staff will
                    fulfill against export lots.
                  </p>
                </div>
              </div>
              {orderMessage && (
                <div
                  className={`alert-box ${
                    String(orderMessage).toLowerCase().includes('unable') ||
                    String(orderMessage).toLowerCase().includes('no buyer')
                      ? 'alert-danger'
                      : 'alert-success'
                  }`}
                >
                  {orderMessage}
                </div>
              )}
              <form
                onSubmit={submitOrder}
                style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
              >
                <input
                  className="input-field"
                  placeholder="Preferred variety"
                  value={orderForm.riceVariety}
                  onChange={(e) =>
                    setOrderForm((c) => ({ ...c, riceVariety: e.target.value }))
                  }
                  style={{ width: 160 }}
                />
                <input
                  className="input-field"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Quantity (kg)"
                  value={orderForm.quantityRequiredKg}
                  onChange={(e) =>
                    setOrderForm((c) => ({
                      ...c,
                      quantityRequiredKg: e.target.value,
                    }))
                  }
                  style={{ width: 160 }}
                />
                <input
                  className="input-field"
                  placeholder="Quality requirements"
                  value={orderForm.qualityRequirements}
                  onChange={(e) =>
                    setOrderForm((c) => ({
                      ...c,
                      qualityRequirements: e.target.value,
                    }))
                  }
                  style={{ width: 220 }}
                />
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Submitting…' : 'Submit requirement'}
                </button>
              </form>

              <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                {(data.orders || []).map((order: any) => (
                  <div
                    key={order.id}
                    style={{
                      padding: 12,
                      background: 'var(--surface-tint)',
                      borderRadius: 8,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      {order.riceVariety || 'Any variety'} ·{' '}
                      {Number(order.quantityRequiredKg).toLocaleString()} kg
                      {order.qualityRequirements
                        ? ` · ${order.qualityRequirements}`
                        : ''}
                    </span>
                    <span className="badge badge-blue">
                      {String(order.status).replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
                {!data.orders?.length && (
                  <p className="muted">No requirements submitted yet.</p>
                )}
              </div>
            </div>
          )}

          {matched && !!data.recentSales?.length && (
            <div className="table-panel" style={{ marginBottom: 20 }}>
              <div className="section-toolbar">
                <strong>Recent purchases</strong>
                <span className="muted">{data.recentSales.length} shown</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Lot</th>
                      <th>Date</th>
                      <th>Qty</th>
                      <th>Amount</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSales.map((sale: any) => (
                      <tr key={sale.id}>
                        <td style={{ fontWeight: 600 }}>{sale.invoiceNumber}</td>
                        <td>{sale.lotNumber || '—'}</td>
                        <td>
                          {sale.saleDate
                            ? new Date(sale.saleDate).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>{kg(sale.quantityKg)}</td>
                        <td>{money(sale.totalRevenue)}</td>
                        <td>
                          <span
                            className={`badge ${
                              sale.paymentReceived ? 'badge-green' : 'badge-gray'
                            }`}
                          >
                            {sale.paymentReceived ? 'Received' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <form onSubmit={lookup} className="action-panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Trace a lot</h2>
                <p className="panel-copy">
                  Lookup by invoice, lot number, or inventory tracking code.
                  Farmer names and phones are never shown.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                className="input-field"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
                placeholder="Invoice, Lot, or INV tracking code"
                style={{ flex: 1, minWidth: 220 }}
              />
              <button type="submit" className="btn-primary">
                Trace
              </button>
            </div>
          </form>

          {trace && (
            <div className="table-panel" style={{ marginTop: 16 }}>
              <strong>
                {trace.invoiceNumber} · {trace.lot?.lotNumber}
              </strong>
              <p className="muted" style={{ margin: '6px 0 12px' }}>
                {trace.sourceRecords?.length || 0} source inventory records ·{' '}
                {Number(trace.lot?.totalWeightKg || 0).toLocaleString()} kg
              </p>
              {trace.lot?.sorterQuality && (
                <div
                  style={{
                    padding: 12,
                    background: 'var(--surface-tint)',
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  <strong style={{ fontSize: 13 }}>Sorter quality</strong>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                    Grade {trace.lot.sorterQuality.qualityGrade || '—'}
                    {trace.lot.sorterQuality.moisturePct != null
                      ? ` · ${trace.lot.sorterQuality.moisturePct}% moisture`
                      : ''}
                    {trace.lot.sorterQuality.severity
                      ? ` · ${trace.lot.sorterQuality.severity}`
                      : ''}
                  </p>
                  {trace.lot.sorterQuality.summary && (
                    <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                      {trace.lot.sorterQuality.summary}
                    </p>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
                {(trace.sourceRecords || []).map((record: any) => (
                  <div
                    key={record.trackingCode}
                    style={{
                      padding: 10,
                      background: 'var(--surface-tint)',
                      borderRadius: 8,
                    }}
                  >
                    {record.trackingCode} · {record.weightKg} kg ·{' '}
                    {record.qualityGrade || 'Ungraded'} ·{' '}
                    {record.region || 'Region not recorded'}
                    {record.farmCode ? ` · ${record.farmCode}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
