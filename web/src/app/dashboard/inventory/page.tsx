'use client';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cropCyclesApi, inventoryApi, riceProtocolsApi } from '@/lib/api';
import { ChartCard, DonutBreakdown, HorizontalBarChart } from '@/components/role-dashboards/Charts';

interface DashboardSummary {
  totalReceivedKg: number;
  totalReceivedCount: number;
  inStockKg: number;
  soldKg: number;
  currentBalanceKg: number;
  byGrade: { grade: string; weightKg: number; count: number }[];
  byWarehouse: { warehouseLocation: string; weightKg: number; count: number }[];
  byStatus: { status: string; weightKg: number; count: number }[];
  byVariety: { riceVariety: string; weightKg: number; count: number }[];
}

interface InventoryRecord {
  id: string;
  trackingCode: string;
  weightKg: number;
  qualityGrade?: string;
  moistureContentPct?: number;
  warehouseLocation?: string;
  status: string;
  receivedDate: string;
  lotNumber?: string | null;
  farm?: { farmCode: string };
  farmer?: { firstName: string; lastName: string };
}

interface CropCycleOption {
  id: string;
  season: string;
  riceVariety?: string;
  status: string;
  farm?: { id: string; farmCode: string };
  farmer?: { id: string; firstName: string; lastName: string; controlNumber: string };
}

interface LotRow {
  id: string;
  lotNumber: string;
  totalWeightKg: number;
  riceVariety?: string | null;
  inventoryRecords?: { id: string }[];
}

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    RECEIVED: 'badge-blue',
    IN_STORAGE: 'badge-green',
    BATCHED: 'badge-gold',
    SHIPPED: 'badge-gray',
    SOLD: 'badge-gray',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status.replace('_', ' ')}</span>;
};

const gateLabels: Record<string, string> = {
  crop_cycle: 'Select source crop cycle',
  harvest: 'Harvest task completed',
  drying: 'Drying task completed',
  bagging: 'Bagging task completed',
  warehouse_receipt: 'Warehouse receipt recorded',
  drying_moisture: 'Drying moisture at or below 14%',
};

const formatMissing = (missing: string[] = []) =>
  missing.map((key) => gateLabels[key] || key.replace(/_/g, ' ')).join(', ');

const STEPS = ['Source cycle', 'Measures', 'Confirm'] as const;

export default function InventoryPage() {
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [cycles, setCycles] = useState<CropCycleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    cropCycleId: '',
    weightKg: '',
    qualityGrade: 'Grade 1',
    moistureContentPct: '',
    warehouseLocation: '',
    receivedDate: new Date().toISOString().slice(0, 10),
  });
  const [lotForm, setLotForm] = useState({
    lotNumber: '',
    riceVariety: '',
    selectedIds: [] as string[],
  });
  const [readiness, setReadiness] = useState<{ ready: boolean; missing: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [lotSaving, setLotSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [lotMessage, setLotMessage] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const reload = async () => {
    const [inventoryRes, cycleRes, summaryRes, lotsRes] = await Promise.all([
      inventoryApi.getAll(),
      cropCyclesApi.getAll(),
      inventoryApi.dashboardSummary(),
      inventoryApi.lots(),
    ]);
    setRecords(inventoryRes.data || []);
    setCycles(cycleRes.data?.data || cycleRes.data || []);
    setSummary(summaryRes.data || null);
    setLots(lotsRes.data || []);
  };

  useEffect(() => {
    reload()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!form.cropCycleId) {
      setReadiness(null);
      return;
    }
    riceProtocolsApi
      .readiness(form.cropCycleId)
      .then((res) => setReadiness(res.data))
      .catch(() => setReadiness(null));
  }, [form.cropCycleId]);

  const filtered = records.filter((r) =>
    `${r.trackingCode} ${r.farmer?.firstName} ${r.farmer?.lastName} ${r.farm?.farmCode}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const selectedCycle = cycles.find((cycle) => cycle.id === form.cropCycleId);
  const unbatched = useMemo(
    () => records.filter((r) => !r.lotNumber && ['RECEIVED', 'IN_STORAGE'].includes(r.status)),
    [records],
  );
  const selectedLotWeight = unbatched
    .filter((r) => lotForm.selectedIds.includes(r.id))
    .reduce((sum, r) => sum + r.weightKg, 0);

  const gateText = readiness
    ? readiness.ready
      ? 'Ready for warehouse receipt'
      : `Missing before receipt: ${formatMissing(readiness.missing)}`
    : form.cropCycleId
      ? 'Readiness unavailable'
      : 'Select a crop cycle to check Mbalari readiness';

  const errorText = (exception: any) => {
    const data = exception?.response?.data;
    const body = data?.message && typeof data.message === 'object' ? data.message : data;
    if (body?.code === 'MBALARI_QUALITY_GATE') {
      return `Mbalari quality gate incomplete: ${formatMissing(body.missing || [])}`;
    }
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    return msg || 'Unable to receive inventory.';
  };

  const resetIntake = () => {
    setForm({
      cropCycleId: '',
      weightKg: '',
      qualityGrade: 'Grade 1',
      moistureContentPct: '',
      warehouseLocation: '',
      receivedDate: new Date().toISOString().slice(0, 10),
    });
    setStep(0);
    setReadiness(null);
  };

  const receive = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCycle?.farm?.id || !selectedCycle?.farmer?.id) {
      setMessage('Selected crop cycle is missing farm or farmer details.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const received = await inventoryApi.receive({
        cropCycleId: selectedCycle.id,
        farmId: selectedCycle.farm.id,
        farmerId: selectedCycle.farmer.id,
        weightKg: Number(form.weightKg),
        qualityGrade: form.qualityGrade || undefined,
        moistureContentPct: form.moistureContentPct
          ? Number(form.moistureContentPct)
          : undefined,
        warehouseLocation: form.warehouseLocation || undefined,
        receivedDate: new Date(form.receivedDate).toISOString(),
      });
      const recordId = received.data?.id;
      if (recordId) {
        await inventoryApi.updateStatus(recordId, {
          status: 'IN_STORAGE',
          warehouseLocation: form.warehouseLocation || undefined,
        });
      }
      await reload();
      setMessage(
        `Inventory received${received.data?.trackingCode ? ` as ${received.data.trackingCode}` : ''} and placed in storage.`,
      );
      resetIntake();
    } catch (exception: any) {
      setMessage(errorText(exception));
    } finally {
      setSaving(false);
    }
  };

  const toggleLotRecord = (id: string) => {
    setLotForm((current) => ({
      ...current,
      selectedIds: current.selectedIds.includes(id)
        ? current.selectedIds.filter((x) => x !== id)
        : [...current.selectedIds, id],
    }));
  };

  const createLot = async (event: FormEvent) => {
    event.preventDefault();
    if (!lotForm.selectedIds.length) {
      setLotMessage('Select at least one unbatched receipt.');
      return;
    }
    setLotSaving(true);
    setLotMessage('');
    try {
      const variety =
        lotForm.riceVariety ||
        selectedCycle?.riceVariety ||
        unbatched.find((r) => lotForm.selectedIds.includes(r.id))?.qualityGrade ||
        'Rice';
      await inventoryApi.createLot({
        lotNumber: lotForm.lotNumber.trim(),
        riceVariety: variety,
        inventoryRecordIds: lotForm.selectedIds,
      });
      setLotForm({ lotNumber: '', riceVariety: '', selectedIds: [] });
      setLotMessage('Export lot created. Source receipts are now BATCHED.');
      await reload();
    } catch (exception: any) {
      const msg = exception?.response?.data?.message;
      setLotMessage(Array.isArray(msg) ? msg.join(', ') : msg || 'Unable to create lot.');
    } finally {
      setLotSaving(false);
    }
  };

  const canAdvanceFromStep0 = !!form.cropCycleId && !!readiness?.ready;
  const canAdvanceFromStep1 =
    Number(form.weightKg) > 0 &&
    !!form.receivedDate &&
    (form.moistureContentPct === '' || Number(form.moistureContentPct) <= 14);

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Warehouse</div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">
            Guided intake (weight, grade, moisture, bay), then batch Fairtrade lots from traceable stock.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/dashboard/traceability" className="btn-secondary" style={{ textDecoration: 'none' }}>
            Trace a code
          </Link>
          <input
            id="inventory-search"
            type="search"
            placeholder="Search tracking code or farmer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ maxWidth: '280px' }}
          />
        </div>
      </div>

      <form onSubmit={receive} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Warehouse intake</h2>
            <p className="panel-copy">
              Step through source cycle readiness, measures, then confirm. Tracking codes are assigned automatically (INV-YYYY-XXXX).
            </p>
          </div>
          <span className={`badge ${readiness?.ready ? 'badge-green' : 'badge-gold'}`}>{gateText}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`badge ${step === index ? 'badge-green' : 'badge-gray'}`}
              style={{ cursor: 'pointer', border: 'none' }}
              onClick={() => {
                if (index < step) setStep(index);
              }}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>

        {message && (
          <div
            className={`alert-box ${
              message.includes('incomplete') ||
              message.includes('Missing') ||
              message.includes('Unable')
                ? 'alert-danger'
                : 'alert-success'
            }`}
          >
            {message}
          </div>
        )}

        {step === 0 && (
          <div className="form-grid-wide">
            <label className="form-label">
              Source crop cycle
              <select
                className="input-field"
                value={form.cropCycleId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, cropCycleId: event.target.value }))
                }
                required
              >
                <option value="">Select crop cycle</option>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.farm?.farmCode || 'Farm'} ·{' '}
                    {cycle.farmer
                      ? `${cycle.farmer.firstName} ${cycle.farmer.lastName}`
                      : 'Farmer'}{' '}
                    · {cycle.season} · {cycle.riceVariety || 'Rice'}
                  </option>
                ))}
              </select>
            </label>
            {selectedCycle && (
              <p className="muted" style={{ fontSize: 13, gridColumn: '1 / -1' }}>
                Farm {selectedCycle.farm?.farmCode || '—'} · Farmer{' '}
                {selectedCycle.farmer
                  ? `${selectedCycle.farmer.firstName} ${selectedCycle.farmer.lastName} (${selectedCycle.farmer.controlNumber})`
                  : '—'}
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="form-grid-wide">
            <label className="form-label">
              Weight (kg)
              <input
                className="input-field"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="kg"
                value={form.weightKg}
                onChange={(event) =>
                  setForm((current) => ({ ...current, weightKg: event.target.value }))
                }
                required
              />
            </label>
            <label className="form-label">
              Quality grade
              <select
                className="input-field"
                value={form.qualityGrade}
                onChange={(event) =>
                  setForm((current) => ({ ...current, qualityGrade: event.target.value }))
                }
              >
                <option>Grade 1</option>
                <option>Grade 2</option>
                <option>Grade 3</option>
                <option>Ungraded</option>
              </select>
            </label>
            <label className="form-label">
              Moisture %
              <input
                className="input-field"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="13.5"
                value={form.moistureContentPct}
                onChange={(event) =>
                  setForm((current) => ({ ...current, moistureContentPct: event.target.value }))
                }
              />
            </label>
            <label className="form-label">
              Warehouse bay
              <input
                className="input-field"
                placeholder="Bay A"
                value={form.warehouseLocation}
                onChange={(event) =>
                  setForm((current) => ({ ...current, warehouseLocation: event.target.value }))
                }
              />
            </label>
            <label className="form-label">
              Received date
              <input
                className="input-field"
                type="date"
                value={form.receivedDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, receivedDate: event.target.value }))
                }
                required
              />
            </label>
            {form.moistureContentPct !== '' && Number(form.moistureContentPct) > 14 && (
              <p style={{ color: 'var(--gold-400)', fontSize: 13, gridColumn: '1 / -1' }}>
                Moisture above 14% — dry further before confirming intake.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: 14,
              background: 'var(--surface-tint)',
              borderRadius: 12,
              fontSize: 14,
            }}
          >
            <div>
              <strong>Cycle</strong> · {selectedCycle?.farm?.farmCode} · {selectedCycle?.season} ·{' '}
              {selectedCycle?.riceVariety || 'Rice'}
            </div>
            <div>
              <strong>Weight</strong> · {form.weightKg || '—'} kg · {form.qualityGrade}
            </div>
            <div>
              <strong>Moisture</strong> · {form.moistureContentPct || '—'}% · Bay{' '}
              {form.warehouseLocation || 'unassigned'}
            </div>
            <div>
              <strong>Received</strong> · {form.receivedDate}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {step > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
          {step < 2 && (
            <button
              type="button"
              className="btn-primary"
              disabled={step === 0 ? !canAdvanceFromStep0 : !canAdvanceFromStep1}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          )}
          {step === 2 && (
            <button className="btn-primary" disabled={saving || !readiness?.ready}>
              {saving ? 'Receiving…' : 'Confirm intake'}
            </button>
          )}
        </div>
      </form>

      <form onSubmit={createLot} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Create export lot</h2>
            <p className="panel-copy">
              Combine unbatched receipts into one Fairtrade lot number for cooperative sales and dispatch.
            </p>
          </div>
          <span className="badge badge-blue">{unbatched.length} unbatched</span>
        </div>
        {lotMessage && (
          <div
            className={`alert-box ${
              lotMessage.includes('Unable') || lotMessage.includes('Select')
                ? 'alert-danger'
                : 'alert-success'
            }`}
          >
            {lotMessage}
          </div>
        )}
        <div className="form-grid-wide">
          <label className="form-label">
            Lot number
            <input
              className="input-field"
              required
              placeholder="LOT-2026-TZ-001"
              value={lotForm.lotNumber}
              onChange={(e) => setLotForm((c) => ({ ...c, lotNumber: e.target.value }))}
            />
          </label>
          <label className="form-label">
            Rice variety
            <input
              className="input-field"
              placeholder="SARO 5"
              value={lotForm.riceVariety}
              onChange={(e) => setLotForm((c) => ({ ...c, riceVariety: e.target.value }))}
            />
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {unbatched.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No unbatched receipts yet — complete intake first.
            </p>
          ) : (
            unbatched.map((r) => (
              <label
                key={r.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'var(--surface-tint)',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={lotForm.selectedIds.includes(r.id)}
                  onChange={() => toggleLotRecord(r.id)}
                />
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--blue-500)' }}>
                  {r.trackingCode}
                </span>
                <span>
                  {r.farm?.farmCode} · {r.weightKg} kg · {r.qualityGrade || 'Ungraded'}
                </span>
              </label>
            ))
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Selected weight: {selectedLotWeight.toFixed(1)} kg · Existing lots: {lots.length}
        </p>
        <button
          className="btn-primary"
          disabled={lotSaving || !lotForm.lotNumber.trim() || !lotForm.selectedIds.length}
          style={{ marginTop: 12 }}
        >
          {lotSaving ? 'Creating…' : 'Create lot'}
        </button>
      </form>

      <div className="metric-grid">
        {[
          { label: 'Total Receipts', value: records.length, color: 'var(--blue-500)' },
          {
            label: 'Total Weight',
            value: `${records.reduce((a, r) => a + r.weightKg, 0).toFixed(0)} kg`,
            color: 'var(--accent)',
          },
          {
            label: 'In Storage',
            value: records.filter((r) => r.status === 'IN_STORAGE').length,
            color: 'var(--gold-400)',
          },
          {
            label: 'Batched',
            value: records.filter((r) => r.status === 'BATCHED').length,
            color: 'var(--purple-500)',
          },
        ].map((s) => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: s.color,
                fontFamily: 'Outfit, sans-serif',
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {summary && (
        <>
          <div className="metric-grid">
            {[
              {
                label: 'Total received',
                value: `${summary.totalReceivedKg.toFixed(0)} kg`,
                color: 'var(--blue-500)',
              },
              {
                label: 'In stock',
                value: `${summary.inStockKg.toFixed(0)} kg`,
                color: 'var(--gold-400)',
              },
              {
                label: 'Sold',
                value: `${summary.soldKg.toFixed(0)} kg`,
                color: 'var(--purple-500)',
              },
              {
                label: 'Current balance',
                value: `${summary.currentBalanceKg.toFixed(0)} kg`,
                color: 'var(--accent)',
              },
            ].map((s) => (
              <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: s.color,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="role-two-col">
            <ChartCard title="Rice by quality grade" subtitle="Weight received per assessed grade.">
              <DonutBreakdown
                data={summary.byGrade.map((row) => ({ name: row.grade, value: row.weightKg }))}
              />
            </ChartCard>
            <ChartCard
              title="Warehouse balance by status"
              subtitle="Received, in storage, batched, shipped, sold."
            >
              <HorizontalBarChart
                data={summary.byStatus.map((row) => ({
                  name: row.status.replace('_', ' '),
                  value: row.weightKg,
                }))}
                color="var(--gold-400)"
              />
            </ChartCard>
            <ChartCard
              title="Stock by warehouse bay"
              subtitle="Weight currently attributed to each location."
            >
              <HorizontalBarChart
                data={summary.byWarehouse.map((row) => ({
                  name: row.warehouseLocation,
                  value: row.weightKg,
                }))}
                color="var(--blue-500)"
              />
            </ChartCard>
            <ChartCard title="Batched lots by variety" subtitle="Export-lot weight grouped by rice variety.">
              <DonutBreakdown
                data={summary.byVariety.map((row) => ({
                  name: row.riceVariety,
                  value: row.weightKg,
                }))}
              />
            </ChartCard>
          </div>
        </>
      )}

      <div className="table-panel">
        <div className="section-toolbar">
          <strong>Warehouse Receipts</strong>
          <span className="muted">{filtered.length} shown</span>
        </div>
        {loading ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: 'var(--neutral-500)',
              fontSize: '14px',
            }}
          >
            Loading inventory…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: '48px',
              textAlign: 'center',
              color: 'var(--neutral-500)',
              fontSize: '14px',
            }}
          >
            No inventory records found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tracking Code</th>
                  <th>Farmer</th>
                  <th>Farm Code</th>
                  <th>Weight</th>
                  <th>Quality</th>
                  <th>Moisture</th>
                  <th>Warehouse Bay</th>
                  <th>Lot</th>
                  <th>Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        href={`/dashboard/traceability?q=${encodeURIComponent(r.trackingCode)}`}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '12px',
                          color: 'var(--blue-500)',
                          fontWeight: 600,
                          background: 'rgba(59, 130, 246, 0.1)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          textDecoration: 'none',
                        }}
                      >
                        {r.trackingCode}
                      </Link>
                    </td>
                    <td style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName}` : '—'}
                    </td>
                    <td
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: 'var(--accent)',
                      }}
                    >
                      {r.farm?.farmCode || '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.weightKg} kg</td>
                    <td>
                      {r.qualityGrade ? (
                        <span className="badge badge-green">{r.qualityGrade}</span>
                      ) : (
                        <span style={{ color: 'var(--neutral-600)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>
                      {r.moistureContentPct != null ? `${r.moistureContentPct}%` : '—'}
                    </td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>
                      {r.warehouseLocation || '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {r.lotNumber ? (
                        <Link
                          href={`/dashboard/traceability?q=${encodeURIComponent(r.lotNumber)}`}
                          style={{ color: 'var(--accent)', textDecoration: 'none' }}
                        >
                          {r.lotNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
                      {new Date(r.receivedDate).toLocaleDateString('en-TZ', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td>{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
