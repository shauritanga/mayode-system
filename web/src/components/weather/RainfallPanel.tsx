'use client';
import { useEffect, useState } from 'react';
import { weatherApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { ChartCard, TrendAreaChart } from '@/components/role-dashboards/Charts';
import { shortDay } from '@/lib/weather';

interface Rain { last7Mm: number; last30Mm: number; averagePreviousMm: number | null; comparisonPct: number | null; previousYears: { year: number; mm: number }[]; daily: { date: string; mm: number; maxTempC: number | null }[] }
const PRESETS = [
  { label: 'Mbarali, Mbeya', lat: -8.95, lon: 33.9 }, { label: 'Kilombero, Morogoro', lat: -8.6, lon: 36.4 },
  { label: 'Kyela, Mbeya', lat: -9.58, lon: 33.83 }, { label: 'Shinyanga', lat: -3.66, lon: 33.42 },
];

/** How much rain fell in the last 30 days, against the same 30 days in each of the past three years. */
export default function RainfallPanel() {
  const [places, setPlaces] = useState(PRESETS);
  const [place, setPlace] = useState(PRESETS[0]);
  const [data, setData] = useState<Rain | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    weatherApi.areas().then((r) => {
      const mine = (r.data ?? []).filter((a: { latitude: number | null }) => a.latitude != null)
        .map((a: { district: string; region: string | null; latitude: number; longitude: number }) => ({ label: `${a.district}${a.region ? `, ${a.region}` : ''}`, lat: a.latitude, lon: a.longitude }));
      if (mine.length) { setPlaces(mine); setPlace(mine[0]); }
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    setData(null);
    weatherApi.rainfall(place.lat, place.lon).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(apiErrorMessage(e, 'Could not load rainfall.')));
  }, [place]);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select className="input-field" style={{ maxWidth: 260 }} value={place.label} onChange={(e) => setPlace(places.find((p) => p.label === e.target.value) ?? places[0])} aria-label="Place">
          {places.map((p) => <option key={p.label}>{p.label}</option>)}
        </select>
      </div>
      {error && <div className="alert-box alert-danger">{error}</div>}
      {!data && !error && <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>}
      {data && (
        <>
          <div className="role-grid" style={{ marginBottom: 14 }}>
            <MetricTile label="Rain, last 7 days" value={`${data.last7Mm} mm`} tone="blue" />
            <MetricTile label="Rain, last 30 days" value={`${data.last30Mm} mm`} tone="blue" />
            <MetricTile label="Same 30 days, past 3 years" value={data.averagePreviousMm != null ? `${data.averagePreviousMm} mm` : '—'} hint="Average" tone="purple" />
            <MetricTile label="Compared with normal" value={data.comparisonPct == null ? '—' : `${data.comparisonPct > 0 ? '+' : ''}${data.comparisonPct}%`} hint={data.comparisonPct == null ? '' : data.comparisonPct < -25 ? 'Drier than usual' : data.comparisonPct > 25 ? 'Wetter than usual' : 'Close to usual'} tone={data.comparisonPct != null && Math.abs(data.comparisonPct) > 25 ? 'gold' : 'green'} />
          </div>
          <ChartCard title="Daily rain, last 30 days" subtitle="Millimetres per day.">
            <TrendAreaChart data={data.daily.map((d) => ({ name: shortDay(d.date), mm: d.mm }))} xKey="name" series={[{ key: 'mm', label: 'Rain (mm)', color: 'var(--blue-500)' }]} />
          </ChartCard>
          {data.previousYears.length > 0 && (
            <div className="table-panel" style={{ marginTop: 14 }}>
              <table className="data-table"><thead><tr><th>Year</th><th>Rain in the same 30 days</th></tr></thead>
                <tbody>{data.previousYears.map((y) => <tr key={y.year}><td>{y.year}</td><td>{y.mm} mm</td></tr>)}</tbody></table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
