'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { salesApi } from '@/lib/api';

interface TraceActivity {
  id: string;
  activityType: string;
  activityDate: string;
  description?: string | null;
}

interface TraceSource {
  trackingCode: string;
  receivedDate: string;
  weightKg: number;
  qualityGrade?: string | null;
  moistureContentPct?: number | null;
  status?: string;
  farm?: {
    id?: string;
    farmCode?: string;
    village?: string | null;
    ward?: string | null;
    district?: string | null;
    region?: string | null;
  } | null;
  farmer?: {
    controlNumber?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  cropCycle?: {
    id: string;
    season: string;
    riceVariety?: string | null;
    status: string;
    activities?: TraceActivity[];
  } | null;
}

interface TraceResult {
  invoiceNumber: string | null;
  saleDate: string | null;
  paymentReceived: boolean;
  status?: string;
  buyer?: { name: string; isCertified?: boolean } | null;
  lot?: {
    lotNumber: string;
    riceVariety?: string | null;
    totalWeightKg: number;
    sorterQuality?: {
      qualityGrade?: string | null;
      moisturePct?: number | null;
      summary?: string | null;
      severity?: string | null;
    } | null;
    aiEvents?: Array<{
      id: string;
      sourceType: string;
      capturedAt: string;
      recommendation?: { summary?: string } | null;
    }>;
  } | null;
  sourceRecords: TraceSource[];
  farmerAllocations?: Array<{
    farmer?: { firstName: string; lastName: string; controlNumber: string };
    quantityKg: number;
    grossAmount: number;
    fairtradePremium: number;
  }>;
}

export default function TraceabilityClient() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [reference, setReference] = useState(initialQ);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const res = await salesApi.traceability(trimmed);
      setTrace(res.data);
    } catch (exception: any) {
      setTrace(null);
      const message = exception?.response?.data?.message;
      setError(
        Array.isArray(message)
          ? message.join(', ')
          : message || 'No sale, lot, or inventory found for that reference.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQ) void lookup(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void lookup(reference);
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Traceability</div>
          <h1 className="page-title">Lot & invoice lookup</h1>
          <p className="page-subtitle">
            Paste an invoice number, export lot code, or inventory tracking code to see farm, crop
            cycle, and recent activities — with or without a completed sale.
          </p>
        </div>
        <Link href="/dashboard/inventory" className="btn-secondary" style={{ textDecoration: 'none' }}>
          Warehouse intake
        </Link>
      </div>

      <form onSubmit={onSubmit} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Look up chain of custody</h2>
            <p className="panel-copy">
              Examples: INV-2026-0001, LOT-2026-TZ-001, or an inventory code like INV-2026-0042.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input-field"
            style={{ flex: 1, minWidth: 240 }}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Invoice, lot, or tracking code"
            required
          />
          <button className="btn-primary" disabled={loading}>
            {loading ? 'Tracing…' : 'Trace'}
          </button>
        </div>
        {error && <div className="alert-box alert-danger" style={{ marginTop: 12 }}>{error}</div>}
      </form>

      {trace && (
        <div className="glass-card" style={{ padding: 22, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 800 }}>
                {trace.invoiceNumber || 'Pre-sale stock'}
                {trace.lot ? ` · ${trace.lot.lotNumber}` : ''}
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                {trace.buyer
                  ? `${trace.buyer.name}${trace.buyer.isCertified ? ' (Fairtrade certified)' : ''}`
                  : 'No buyer sale yet'}
                {trace.lot ? ` · ${trace.lot.totalWeightKg.toLocaleString()} kg lot` : ''}
                {trace.lot?.riceVariety ? ` · ${trace.lot.riceVariety}` : ''}
              </p>
            </div>
            <span
              className={`badge ${
                trace.paymentReceived
                  ? 'badge-green'
                  : trace.invoiceNumber
                    ? 'badge-gold'
                    : 'badge-blue'
              }`}
            >
              {trace.paymentReceived
                ? 'Settled'
                : trace.invoiceNumber
                  ? 'Sale recorded'
                  : 'Intake / lot only'}
            </span>
          </div>

          {trace.lot?.sorterQuality && (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                background: 'var(--surface-tint)',
                borderRadius: 10,
              }}
            >
              <strong style={{ fontSize: 13 }}>Rice sorter quality</strong>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
                Grade {trace.lot.sorterQuality.qualityGrade || '—'}
                {trace.lot.sorterQuality.moisturePct != null
                  ? ` · ${trace.lot.sorterQuality.moisturePct}% moisture`
                  : ''}
                {trace.lot.sorterQuality.severity
                  ? ` · ${trace.lot.sorterQuality.severity}`
                  : ''}
              </p>
              {trace.lot.sorterQuality.summary && (
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>
                  {trace.lot.sorterQuality.summary}
                </p>
              )}
            </div>
          )}

          {!!trace.farmerAllocations?.length && (
            <div style={{ marginTop: 18 }}>
              <strong style={{ fontSize: 13 }}>Farmer allocations</strong>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {trace.farmerAllocations.map((row, index) => (
                  <div
                    key={`${row.farmer?.controlNumber}-${index}`}
                    style={{
                      padding: 10,
                      background: 'var(--surface-tint)',
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    {row.farmer
                      ? `${row.farmer.firstName} ${row.farmer.lastName} (${row.farmer.controlNumber})`
                      : 'Farmer'}{' '}
                    · {row.quantityKg} kg · TZS {Math.round(row.grossAmount).toLocaleString()}
                    {row.fairtradePremium
                      ? ` + premium ${Math.round(row.fairtradePremium).toLocaleString()}`
                      : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 22 }}>
            <strong style={{ fontSize: 13 }}>
              Source inventory ({trace.sourceRecords.length})
            </strong>
            <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
              {trace.sourceRecords.map((record) => (
                <div
                  key={record.trackingCode}
                  style={{
                    border: '1px solid var(--border-subtle, #E5E7EB)',
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: 'var(--blue-500)',
                        }}
                      >
                        {record.trackingCode}
                      </span>
                      <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                        {record.weightKg} kg · {record.qualityGrade || 'Ungraded'}
                        {record.moistureContentPct != null
                          ? ` · ${record.moistureContentPct}% moisture`
                          : ''}
                      </span>
                    </div>
                    {record.status && (
                      <span className="badge badge-gray">{record.status.replace(/_/g, ' ')}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, marginTop: 8 }}>
                    {record.farm?.id ? (
                      <Link
                        href={`/dashboard/farms/${record.farm.id}`}
                        style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
                      >
                        {record.farm.farmCode}
                      </Link>
                    ) : (
                      <strong>{record.farm?.farmCode || 'Farm'}</strong>
                    )}
                    {record.farmer
                      ? ` · ${record.farmer.firstName} ${record.farmer.lastName} (${record.farmer.controlNumber})`
                      : ''}
                    {record.farm?.village || record.farm?.region
                      ? ` · ${[record.farm?.village, record.farm?.ward, record.farm?.district, record.farm?.region]
                          .filter(Boolean)
                          .join(', ')}`
                      : ''}
                  </p>
                  {record.cropCycle ? (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 13, marginBottom: 6 }}>
                        Cycle <strong>{record.cropCycle.season}</strong>
                        {record.cropCycle.riceVariety
                          ? ` · ${record.cropCycle.riceVariety}`
                          : ''}{' '}
                        · {record.cropCycle.status}
                      </p>
                      {!!record.cropCycle.activities?.length && (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--neutral-500)' }}>
                          {record.cropCycle.activities.map((activity) => (
                            <li key={activity.id}>
                              {new Date(activity.activityDate).toLocaleDateString('en-TZ')} ·{' '}
                              {activity.activityType.replace(/_/g, ' ')}
                              {activity.description ? ` — ${activity.description}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                      No linked crop cycle activities on this receipt.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
