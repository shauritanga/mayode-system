'use client';
import { useEffect, useState } from 'react';
import { weatherApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface ForecastDay { date: string; maxTempC: number; minTempC: number; precipitationMm: number }
interface Forecast {
  source: string;
  provider?: string;
  live?: boolean;
  days: ForecastDay[];
  totalPrecipitationMm: number;
  floodRisk: boolean;
  droughtRisk: boolean;
  recommendations: string[];
}
interface Alert {
  id: string;
  region?: string;
  district?: string;
  ward?: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  validFrom: string;
  smsSentCount: number;
}

// Convenience presets for rice-growing regions — the forecast itself is always
// fetched live from Open-Meteo for whatever coordinate is selected/entered.
const REGION_PRESETS = [
  { label: 'Mbarali, Mbeya', lat: -8.95, lon: 33.9 },
  { label: 'Kilombero, Morogoro', lat: -8.6, lon: 36.4 },
  { label: 'Kyela, Mbeya', lat: -9.58, lon: 33.83 },
  { label: 'Shinyanga', lat: -3.66, lon: 33.42 },
];

const severityBadge = (severity: string) => {
  if (severity === 'CRITICAL') return 'badge-red';
  if (severity === 'HIGH') return 'badge-gold';
  return 'badge-blue';
};

const EMPTY_ALERT = { region: '', district: '', ward: '', alertType: 'GENERAL', severity: 'MEDIUM', title: '', message: '' };

export default function WeatherPage() {
  const [preset, setPreset] = useState(REGION_PRESETS[0]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState('');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertForm, setAlertForm] = useState<any>({ ...EMPTY_ALERT });
  const [saving, setSaving] = useState(false);
  const [alertError, setAlertError] = useState('');

  const loadForecast = (lat: number, lon: number) => {
    setForecastLoading(true);
    setForecastError('');
    weatherApi.forecast(lat, lon)
      .then((res) => setForecast(res.data))
      .catch((e) => setForecastError(e?.response?.data?.message || 'Unable to load forecast.'))
      .finally(() => setForecastLoading(false));
  };

  const loadAlerts = () => {
    weatherApi.getAlerts().then((res) => setAlerts(res.data || [])).catch(console.error);
  };

  useEffect(() => { loadForecast(preset.lat, preset.lon); loadAlerts(); }, []);

  const submitAlert = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setAlertError('');
    try {
      await weatherApi.createAlert(alertForm);
      setShowAlertForm(false);
      setAlertForm({ ...EMPTY_ALERT });
      loadAlerts();
    } catch (e: any) {
      setAlertError(e?.response?.data?.message || 'Could not issue alert.');
    } finally { setSaving(false); }
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Early warning</div>
          <h1 className="page-title">Weather</h1>
          <p className="page-subtitle">
            Live 7-day forecast and farmer early-warning alerts.
            {forecast?.provider || forecast?.source
              ? ` Data from ${forecast.provider || forecast.source}.`
              : ''}
          </p>
        </div>
        {(forecast?.provider || forecast?.source) && (
          <span className="badge badge-blue">
            Live · {forecast.provider || forecast.source}
          </span>
        )}
      </div>

      <div className="glass-card" style={{ padding: '18px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>7-Day Forecast</strong>
          <select
            className="input-field"
            style={{ fontSize: '13px', width: '220px' }}
            value={preset.label}
            onChange={(e) => {
              const next = REGION_PRESETS.find((r) => r.label === e.target.value) || REGION_PRESETS[0];
              setPreset(next);
              loadForecast(next.lat, next.lon);
            }}
          >
            {REGION_PRESETS.map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
          </select>
        </div>

        {forecastLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>Loading live forecast…</div>
        ) : forecastError ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--red-400)', fontSize: '13px' }}>{forecastError}</div>
        ) : forecast ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(80px, 1fr))', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
              {forecast.days.map((d) => (
                <div key={d.date} className="stat-card" style={{ padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>{new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{Math.round(d.maxTempC)}°/{Math.round(d.minTempC)}°</div>
                  <div style={{ fontSize: '11px', color: 'var(--blue-400)', marginTop: '2px' }}>{d.precipitationMm.toFixed(1)}mm</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span className={`badge ${forecast.floodRisk ? 'badge-red' : 'badge-green'}`}>{forecast.floodRisk ? '⚠ Flood risk elevated' : '✓ No flood risk'}</span>
              <span className={`badge ${forecast.droughtRisk ? 'badge-gold' : 'badge-green'}`}>{forecast.droughtRisk ? '⚠ Drought risk elevated' : '✓ No drought risk'}</span>
              <span className="badge badge-blue">Source: {forecast.source}</span>
            </div>
            {forecast.recommendations.map((r, i) => (
              <p key={i} style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '4px 0' }}>💡 {r}</p>
            ))}
          </>
        ) : null}
      </div>

      {alertError && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--red-400)' }}>{alertError}</div>}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hover-tint-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Early-Warning Alerts</span>
          <button className="btn-secondary" style={{ fontSize: '12px', padding: '6px 10px' }} onClick={() => setShowAlertForm(true)}>+ Issue Alert</button>
        </div>
        {alerts.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '13px' }}>No alerts issued yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Type</th><th>Severity</th><th>Title</th><th>Area</th><th>Issued</th><th>SMS sent</th></tr></thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{a.alertType.replace(/_/g, ' ')}</td>
                    <td><span className={`badge ${severityBadge(a.severity)}`}>{a.severity}</span></td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.title}</td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{[a.ward, a.district, a.region].filter(Boolean).join(', ') || 'All areas'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>{new Date(a.validFrom).toLocaleDateString()}</td>
                    <td>{a.smsSentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAlertForm && (
        <Modal
          title="Issue Early-Warning Alert"
          subtitle="Broadcast via SMS to farmers in the matching region/district/ward"
          onClose={() => setShowAlertForm(false)}
          width="480px"
          footer={<>
            <button className="btn-secondary" onClick={() => setShowAlertForm(false)} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={submitAlert} disabled={saving}>{saving ? 'Sending…' : 'Issue & broadcast'}</button>
          </>}
        >
          <form onSubmit={submitAlert} style={{ display: 'grid', gap: '9px' }}>
            <select className="input-field" value={alertForm.alertType} onChange={(e) => setAlertForm({ ...alertForm, alertType: e.target.value })}>
              <option value="FLOOD">Flood</option>
              <option value="DROUGHT">Drought</option>
              <option value="PEST">Pest</option>
              <option value="DISEASE">Disease</option>
              <option value="PLANTING_RECOMMENDATION">Planting recommendation</option>
              <option value="IRRIGATION_RECOMMENDATION">Irrigation recommendation</option>
              <option value="GENERAL">General</option>
            </select>
            <select className="input-field" value={alertForm.severity} onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value })}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <input className="input-field" placeholder="Title" required value={alertForm.title} onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })} />
            <textarea className="input-field" placeholder="Message" required value={alertForm.message} onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })} />
            <input className="input-field" placeholder="Region (leave blank for all)" value={alertForm.region} onChange={(e) => setAlertForm({ ...alertForm, region: e.target.value })} />
            <input className="input-field" placeholder="District (optional)" value={alertForm.district} onChange={(e) => setAlertForm({ ...alertForm, district: e.target.value })} />
            <input className="input-field" placeholder="Ward (optional)" value={alertForm.ward} onChange={(e) => setAlertForm({ ...alertForm, ward: e.target.value })} />
          </form>
        </Modal>
      )}
    </div>
  );
}
