'use client';
import { useEffect, useState } from 'react';
import { farmAlertsApi } from '@/lib/api';

interface Alert {
  id: string;
  farmCode?: string;
  farmName?: string;
  category: string;
  urgency: string;
  title: string;
  previewMessage: string;
  status: string;
  locked: boolean;
  recommendation?: string | null;
  createdAt: string;
}

const urgencyBadge = (u: string) => {
  const map: Record<string, string> = { LOW: 'badge-gray', MEDIUM: 'badge-gold', HIGH: 'badge-red', CRITICAL: 'badge-red' };
  return <span className={`badge ${map[u] || 'badge-gray'}`}>{u}</span>;
};
const statusBadge = (s: string) => {
  const map: Record<string, string> = { OPEN: 'badge-gold', ACKNOWLEDGED: 'badge-blue', COMPLETED: 'badge-green', DISMISSED: 'badge-gray', EXPIRED: 'badge-gray' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = () => {
    setLoading(true);
    farmAlertsApi.getAll()
      .then(res => setAlerts(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      await farmAlertsApi.generateAll();
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const open = alerts.filter(a => a.status === 'OPEN').length;
  const critical = alerts.filter(a => a.urgency === 'CRITICAL' || a.urgency === 'HIGH').length;

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farm Alerts</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Rule-based farm-action recommendations — full detail gated behind membership</p>
        </div>
        <button className="btn-primary" onClick={generate} disabled={generating}>
          {generating ? 'Generating…' : 'Run alert generator'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total alerts', value: alerts.length, color: 'var(--accent)' },
          { label: 'Open', value: open, color: 'var(--gold-400)' },
          { label: 'High / critical', value: critical, color: 'var(--red-400)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No alerts yet. Run the generator to create rule-based alerts from crop-cycle data.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Farm</th><th>Category</th><th>Title</th><th>Message</th><th>Urgency</th><th>Status</th></tr>
              </thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{a.farmCode || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{a.category.replace(/_/g, ' ')}</td>
                    <td style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{a.title}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px', maxWidth: '320px' }}>{a.previewMessage}</td>
                    <td>{urgencyBadge(a.urgency)}</td>
                    <td>{statusBadge(a.status)}</td>
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
