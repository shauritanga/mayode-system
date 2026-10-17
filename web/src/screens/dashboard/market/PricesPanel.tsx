'use client';
import { useEffect, useState } from 'react';
import { marketApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { ChartCard, TrendAreaChart } from '@/components/role-dashboards/Charts';
import Modal from '@/components/Modal';
import { day, tzs } from './format';

interface Trend { commodity: string; latest: number; previous: number | null; changePct: number | null; readings: number; series: { date: string; price: number }[] }
interface Price { id: string; commodity: string; price: number; market: string | null; source: string | null; recordedAt: string; scope: string }

export default function PricesPanel() {
  const user = useAuthStore((s) => s.user);
  const canAdd = hasPermission(user, 'marketplace', 'CREATE');
  const [data, setData] = useState<{ trends: Trend[]; rows: Price[] } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ commodity: '', price: '', market: '', source: '', recordedAt: new Date().toISOString().slice(0, 10) });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () =>
    marketApi.prices()
      .then((r) => { const d = r.data as { trends: Trend[]; rows: Price[] }; setData(d); setSelected((cur) => cur || d.trends[0]?.commodity || ''); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load market prices.')));
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setFormError('');
    try {
      await marketApi.recordPrice({
        commodity: form.commodity, price: Number(form.price), market: form.market || undefined,
        source: form.source || undefined, recordedAt: new Date(form.recordedAt).toISOString(),
      });
      setAdding(false);
      setForm({ commodity: '', price: '', market: '', source: '', recordedAt: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (e) { setFormError(apiErrorMessage(e, 'Could not save the price.')); }
    finally { setSaving(false); }
  };

  if (error) return <div className="alert-box alert-danger">{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>;
  const trend = data.trends.find((t) => t.commodity === selected);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: 'var(--neutral-500)', margin: 0, maxWidth: 560 }}>
          Prices recorded by your cooperative, plus platform-wide prices shared with everyone. Use them when agreeing an offer with a buyer.
        </p>
        {canAdd && <button className="btn-primary" onClick={() => setAdding(true)}>+ Record price</button>}
      </div>

      {data.trends.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10, marginBottom: 16 }}>
          {data.trends.map((t) => (
            <button key={t.commodity} type="button" className="stat-card" onClick={() => setSelected(t.commodity)}
              style={{ textAlign: 'left', padding: 14, cursor: 'pointer', outline: selected === t.commodity ? '2px solid var(--green-500)' : 'none' }}>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{t.commodity}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{tzs(t.latest)}</div>
              <div style={{ fontSize: 11, color: t.changePct == null ? 'var(--neutral-500)' : t.changePct >= 0 ? 'var(--green-500)' : 'var(--red-500)' }}>
                {t.changePct == null ? `${t.readings} reading` : `${t.changePct > 0 ? '▲ +' : t.changePct < 0 ? '▼ ' : ''}${t.changePct}% since last`}
              </div>
            </button>
          ))}
        </div>
      )}

      {trend && trend.series.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <ChartCard title={`${trend.commodity} price history`} subtitle="TZS per unit as recorded.">
            <TrendAreaChart data={trend.series} xKey="date" series={[{ key: 'price', label: 'Price', color: 'var(--green-500)' }]} />
          </ChartCard>
        </div>
      )}

      <div className="table-panel">
        {data.rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No prices recorded yet.</div> : (
          <div style={{ overflowX: 'auto', maxHeight: 440 }}>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Commodity</th><th>Price</th><th>Market</th><th>Source</th><th>Visible to</th></tr></thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id}>
                    <td>{day(p.recordedAt)}</td><td style={{ fontWeight: 600 }}>{p.commodity}</td><td>{tzs(p.price)}</td>
                    <td>{p.market ?? '—'}</td><td>{p.source ?? '—'}</td>
                    <td><span className={`badge ${p.scope === 'PLATFORM' ? 'badge-blue' : 'badge-green'}`}>{p.scope === 'PLATFORM' ? 'Everyone' : 'Your cooperative'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && (
        <Modal title="Record market price" onClose={() => setAdding(false)}
          footer={<><button className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button className="btn-primary" disabled={saving || !form.commodity || !form.price} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
          {formError && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            <label className="form-label">Commodity<input className="input-field" list="commodity-list" placeholder="e.g. Paddy, Rice (milled)" value={form.commodity} onChange={(e) => setForm({ ...form, commodity: e.target.value })} />
              <datalist id="commodity-list">{[...new Set(data.rows.map((r) => r.commodity))].map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="form-label">Price (TZS)<input className="input-field" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            <label className="form-label">Market<input className="input-field" placeholder="e.g. Rujewa market" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} /></label>
            <label className="form-label">Source (optional)<input className="input-field" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
            <label className="form-label">Date<input className="input-field" type="date" value={form.recordedAt} onChange={(e) => setForm({ ...form, recordedAt: e.target.value })} /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}
