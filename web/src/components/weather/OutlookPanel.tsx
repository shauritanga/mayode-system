'use client';
import { useEffect, useState } from 'react';
import { weatherApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import ForecastStrip from './ForecastStrip';
import type { WxDay } from '@/lib/weather';

interface Area {
  areaKey: string; cooperative: string | null; region: string | null; district: string; latitude: number | null; farmers: number;
  crops: { total: number; preparing: number; susceptible: number; growing: number };
  outlook: { days: WxDay[]; floodRisk: boolean; droughtRisk: boolean; summary: { totalMm: number; maxDryRun: number }; fetchedAt?: string } | null;
}

/** Each place farmers grow in: this week's forecast, whether it crosses the warning limits, and how many crops are exposed. */
export default function OutlookPanel() {
  const isSuper = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');

  const load = () => weatherApi.areas().then((r) => { setAreas(r.data ?? []); setError(''); }).catch((e) => setError(apiErrorMessage(e, 'Could not load the outlook.')));
  useEffect(() => { load(); }, []);

  const runCheck = async () => {
    setRunning(true); setNote('');
    try {
      const r = await weatherApi.runCheck();
      setNote(`Checked ${r.data.areas} area(s); ${r.data.drafted} new draft alert(s) are waiting for review.`);
      await load();
    } catch (e) { setError(apiErrorMessage(e, 'The check failed.')); }
    finally { setRunning(false); }
  };

  if (error) return <div className="alert-box alert-danger">{error}</div>;
  if (!areas) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--neutral-500)', margin: 0, maxWidth: 620 }}>
          Every morning the system checks the forecast for each place where your farmers grow rice. When rain, a dry spell, or a pest or disease risk crosses a limit it writes a draft alert for you to review. Nothing is sent to farmers until you approve it.
        </p>
        {isSuper && <button className="btn-secondary" disabled={running} onClick={runCheck}>{running ? 'Checking…' : 'Run the check now'}</button>}
      </div>
      {note && <div className="alert-box alert-success" style={{ marginBottom: 12 }}>{note}</div>}
      {areas.length === 0 && <div className="glass-card" style={{ padding: 30, textAlign: 'center', color: 'var(--neutral-500)' }}>No farmers have a district recorded yet, so there are no areas to watch.</div>}
      <div style={{ display: 'grid', gap: 14 }}>
        {areas.map((a) => (
          <div key={a.areaKey} className="glass-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <strong>{a.district}{a.region ? `, ${a.region}` : ''}</strong>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{a.cooperative} · {a.farmers} farmers · {a.crops.total} crop{a.crops.total === 1 ? '' : 's'} growing{a.crops.susceptible ? ` (${a.crops.susceptible} at pest-and-disease stages)` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {a.outlook?.floodRisk && <span className="badge badge-red">Heavy rain</span>}
                {a.outlook?.droughtRisk && <span className="badge badge-gold">Dry spell</span>}
                {a.outlook && !a.outlook.floodRisk && !a.outlook.droughtRisk && <span className="badge badge-green">Normal week</span>}
                {a.outlook && <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{a.outlook.summary.totalMm} mm this week</span>}
              </div>
            </div>
            {a.outlook ? <ForecastStrip days={a.outlook.days} /> : <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{a.latitude == null ? 'No farm or home location is recorded here, so there is no forecast.' : 'The forecast has not been fetched yet; it appears after the next morning check.'}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
