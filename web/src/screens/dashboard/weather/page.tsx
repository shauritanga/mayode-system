'use client';
import { useEffect, useState } from 'react';
import { weatherApi } from '@/lib/api';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import AlertsPanel from '@/components/weather/AlertsPanel';
import OutlookPanel from '@/components/weather/OutlookPanel';
import RainfallPanel from '@/components/weather/RainfallPanel';
import ForecastStrip from '@/components/weather/ForecastStrip';
import type { WxAlert, WxDay } from '@/lib/weather';

interface Forecast { provider?: string; source: string; days: WxDay[]; totalPrecipitationMm: number; floodRisk: boolean; droughtRisk: boolean; recommendations: string[] }
const PRESETS = [
  { label: 'Mbarali, Mbeya', lat: -8.95, lon: 33.9 }, { label: 'Kilombero, Morogoro', lat: -8.6, lon: 36.4 },
  { label: 'Kyela, Mbeya', lat: -9.58, lon: 33.83 }, { label: 'Shinyanga', lat: -3.66, lon: 33.42 },
];

function ForecastLookup() {
  const [preset, setPreset] = useState(PRESETS[0]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true); setError('');
    weatherApi.forecast(preset.lat, preset.lon).then((r) => setForecast(r.data)).catch((e) => setError(e?.response?.data?.message || 'Unable to load forecast.')).finally(() => setLoading(false));
  }, [preset]);
  return (
    <div className="glass-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <strong>7-day forecast</strong>
        <select className="input-field" style={{ width: 220 }} value={preset.label} onChange={(e) => setPreset(PRESETS.find((p) => p.label === e.target.value) ?? PRESETS[0])}>
          {PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}
        </select>
      </div>
      {loading ? <TableSkeleton rows={3} avatar={false} /> : error ? <div className="alert-box alert-danger">{error}</div> : forecast && (
        <>
          <ForecastStrip days={forecast.days} />
          <div style={{ display: 'flex', gap: 8, margin: '14px 0 6px', flexWrap: 'wrap' }}>
            <span className={`badge ${forecast.floodRisk ? 'badge-red' : 'badge-green'}`}>{forecast.floodRisk ? 'Flood risk elevated' : 'No flood risk'}</span>
            <span className={`badge ${forecast.droughtRisk ? 'badge-gold' : 'badge-green'}`}>{forecast.droughtRisk ? 'Drought risk elevated' : 'No drought risk'}</span>
            <span className="badge badge-blue">{forecast.totalPrecipitationMm} mm this week · {forecast.provider || forecast.source}</span>
          </div>
          {forecast.recommendations.map((r, i) => <p key={i} style={{ fontSize: 13, margin: '4px 0' }}>{r}</p>)}
        </>
      )}
    </div>
  );
}

export default function WeatherPage() {
  const [tab, setTab] = useState<'alerts' | 'outlook' | 'rainfall' | 'forecast'>('alerts');
  const [drafts, setDrafts] = useState(0);
  const refreshDrafts = () => weatherApi.alerts({ status: 'DRAFT' }).then((r) => setDrafts(((r.data ?? []) as WxAlert[]).length)).catch(() => undefined);
  useEffect(() => { refreshDrafts(); }, []);
  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Early warning</div>
          <h1 className="page-title">Weather</h1>
          <p className="page-subtitle">Forecasts and rainfall for the places your farmers grow, early-warning alerts drafted from the forecast, and delivery by SMS, the app, WhatsApp and field officers.</p>
        </div>
      </div>
      <div className="seg-control" style={{ marginBottom: 16, flexWrap: 'wrap' }} role="tablist">
        {([['alerts', `Alerts${drafts ? ` · ${drafts} to review` : ''}`], ['outlook', 'Outlook by area'], ['rainfall', 'Rainfall'], ['forecast', 'Forecast lookup']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`seg-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'alerts' && <AlertsPanel onChanged={refreshDrafts} />}
      {tab === 'outlook' && <OutlookPanel />}
      {tab === 'rainfall' && <RainfallPanel />}
      {tab === 'forecast' && <ForecastLookup />}
    </div>
  );
}
