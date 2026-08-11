'use client';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
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
  warehouseLocation?: string;
  status: string;
  receivedDate: string;
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

const formatMissing = (missing: string[] = []) => missing.map((key) => gateLabels[key] || key.replace(/_/g, ' ')).join(', ');

export default function InventoryPage() {
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [cycles, setCycles] = useState<CropCycleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ cropCycleId: '', weightKg: '', qualityGrade: '', moistureContentPct: '', warehouseLocation: '', receivedDate: new Date().toISOString().slice(0, 10) });
  const [readiness, setReadiness] = useState<{ ready: boolean; missing: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    Promise.all([
      inventoryApi.getAll(),
      cropCyclesApi.getAll(),
      inventoryApi.dashboardSummary(),
    ])
      .then(([inventoryRes, cycleRes, summaryRes]) => {
        setRecords(inventoryRes.data || []);
        setCycles(cycleRes.data?.data || cycleRes.data || []);
        setSummary(summaryRes.data || null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!form.cropCycleId) { setReadiness(null); return; }
    riceProtocolsApi.readiness(form.cropCycleId)
      .then((res) => setReadiness(res.data))
      .catch(() => setReadiness(null));
  }, [form.cropCycleId]);

  const filtered = records.filter(r =>
    `${r.trackingCode} ${r.farmer?.firstName} ${r.farmer?.lastName} ${r.farm?.farmCode}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalKg = records.reduce((a, r) => a + r.weightKg, 0);
  const selectedCycle = cycles.find((cycle) => cycle.id === form.cropCycleId);
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
    if (body?.code === 'MBALARI_QUALITY_GATE') return `Mbalari quality gate incomplete: ${formatMissing(body.missing || [])}`;
    const message = data?.message;
    if (Array.isArray(message)) return message.join(', ');
    return message || 'Unable to receive inventory.';
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
      await inventoryApi.receive({
        cropCycleId: selectedCycle.id,
        farmId: selectedCycle.farm.id,
        farmerId: selectedCycle.farmer.id,
        weightKg: Number(form.weightKg),
        qualityGrade: form.qualityGrade || undefined,
        moistureContentPct: form.moistureContentPct ? Number(form.moistureContentPct) : undefined,
        warehouseLocation: form.warehouseLocation || undefined,
        receivedDate: new Date(form.receivedDate).toISOString(),
      });
      const [res, summaryRes] = await Promise.all([inventoryApi.getAll(), inventoryApi.dashboardSummary()]);
      setRecords(res.data || []);
      setSummary(summaryRes.data || null);
      setForm({ cropCycleId: '', weightKg: '', qualityGrade: '', moistureContentPct: '', warehouseLocation: '', receivedDate: new Date().toISOString().slice(0, 10) });
      setMessage('Inventory received and linked to the Mbalari crop cycle.');
    } catch (exception: any) {
      setMessage(errorText(exception));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Warehouse</div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Receive verified Mbalari harvests, keep warehouse records linked to crop cycles, and prepare Fairtrade lots from traceable stock.</p>
        </div>
        <input
          id="inventory-search"
          type="search"
          placeholder="Search tracking code or farmer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field"
          style={{ maxWidth: '320px' }}
        />
      </div>

      <form onSubmit={receive} className="action-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Receive Mbalari Inventory</h2>
            <p className="panel-copy">Choose the source crop cycle first. The system checks harvest, drying moisture, bagging, and warehouse readiness before inventory can enter cooperative stock.</p>
          </div>
          <span className={`badge ${readiness?.ready ? 'badge-green' : 'badge-gold'}`}>{gateText}</span>
        </div>
        {message && <div className={`alert-box ${message.includes('incomplete') || message.includes('Missing') || message.includes('Unable') ? 'alert-danger' : 'alert-success'}`}>{message}</div>}
        <div className="form-grid-wide">
          <label className="form-label">Source crop cycle<select className="input-field" value={form.cropCycleId} onChange={(event) => setForm((current) => ({ ...current, cropCycleId: event.target.value }))} required>
            <option value="">Select crop cycle</option>
            {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.farm?.farmCode || 'Farm'} · {cycle.farmer ? `${cycle.farmer.firstName} ${cycle.farmer.lastName}` : 'Farmer'} · {cycle.season} · {cycle.riceVariety || 'Rice'}</option>)}
          </select></label>
          <label className="form-label">Weight<input className="input-field" type="number" min="0.01" step="0.01" placeholder="kg" value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} required /></label>
          <label className="form-label">Quality grade<input className="input-field" placeholder="Grade 1" value={form.qualityGrade} onChange={(event) => setForm((current) => ({ ...current, qualityGrade: event.target.value }))} /></label>
          <label className="form-label">Moisture %<input className="input-field" type="number" min="0" max="100" step="0.1" placeholder="13.5" value={form.moistureContentPct} onChange={(event) => setForm((current) => ({ ...current, moistureContentPct: event.target.value }))} /></label>
          <label className="form-label">Warehouse bay<input className="input-field" placeholder="Bay A" value={form.warehouseLocation} onChange={(event) => setForm((current) => ({ ...current, warehouseLocation: event.target.value }))} /></label>
          <label className="form-label">Received date<input className="input-field" type="date" value={form.receivedDate} onChange={(event) => setForm((current) => ({ ...current, receivedDate: event.target.value }))} required /></label>
        </div>
        <button className="btn-primary" disabled={saving || !readiness?.ready} style={{ marginTop: 12 }}>{saving ? 'Receiving...' : 'Receive inventory'}</button>
      </form>

      <div className="metric-grid">
        {[
          { label: 'Total Receipts', value: records.length, color: 'var(--blue-500)' },
          { label: 'Total Weight', value: `${totalKg.toFixed(0)} kg`, color: 'var(--accent)' },
          { label: 'In Storage', value: records.filter(r => r.status === 'IN_STORAGE').length, color: 'var(--gold-400)' },
          { label: 'Batched', value: records.filter(r => r.status === 'BATCHED').length, color: 'var(--purple-500)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {summary && <>
        <div className="metric-grid">
          {[
            { label: 'Total received', value: `${summary.totalReceivedKg.toFixed(0)} kg`, color: 'var(--blue-500)' },
            { label: 'In stock', value: `${summary.inStockKg.toFixed(0)} kg`, color: 'var(--gold-400)' },
            { label: 'Sold', value: `${summary.soldKg.toFixed(0)} kg`, color: 'var(--purple-500)' },
            { label: 'Current balance', value: `${summary.currentBalanceKg.toFixed(0)} kg`, color: 'var(--accent)' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="role-two-col">
          <ChartCard title="Rice by quality grade" subtitle="Weight received per assessed grade.">
            <DonutBreakdown data={summary.byGrade.map((row) => ({ name: row.grade, value: row.weightKg }))} />
          </ChartCard>
          <ChartCard title="Warehouse balance by status" subtitle="Received, in storage, batched, shipped, sold.">
            <HorizontalBarChart data={summary.byStatus.map((row) => ({ name: row.status.replace('_', ' '), value: row.weightKg }))} color="var(--gold-400)" />
          </ChartCard>
          <ChartCard title="Stock by warehouse bay" subtitle="Weight currently attributed to each location.">
            <HorizontalBarChart data={summary.byWarehouse.map((row) => ({ name: row.warehouseLocation, value: row.weightKg }))} color="var(--blue-500)" />
          </ChartCard>
          <ChartCard title="Batched lots by variety" subtitle="Export-lot weight grouped by rice variety.">
            <DonutBreakdown data={summary.byVariety.map((row) => ({ name: row.riceVariety, value: row.weightKg }))} />
          </ChartCard>
        </div>
      </>}

      <div className="table-panel">
        <div className="section-toolbar"><strong>Warehouse Receipts</strong><span className="muted">{filtered.length} shown</span></div>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading inventory…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No inventory records found.</div>
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
                  <th>Warehouse Bay</th>
                  <th>Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--blue-500)', fontWeight: 600, background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>
                        {r.trackingCode}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {r.farmer ? `${r.farmer.firstName} ${r.farmer.lastName}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent)' }}>{r.farm?.farmCode || '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.weightKg} kg</td>
                    <td>
                      {r.qualityGrade
                        ? <span className="badge badge-green">{r.qualityGrade}</span>
                        : <span style={{ color: 'var(--neutral-600)', fontSize: '12px' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{r.warehouseLocation || '—'}</td>
                    <td style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>
                      {new Date(r.receivedDate).toLocaleDateString('en-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
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
