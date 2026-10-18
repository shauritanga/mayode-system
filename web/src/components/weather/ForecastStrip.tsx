'use client';
import { shortDay, type WxDay } from '@/lib/weather';

/** Seven small day cards: weekday, high and low, and rain with a bar. */
export default function ForecastStrip({ days }: { days: WxDay[] }) {
  const max = Math.max(10, ...days.map((d) => d.precipitationMm ?? 0));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
      {days.map((d) => {
        const rain = d.precipitationMm ?? 0;
        return (
          <div key={d.date} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{shortDay(d.date)}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{d.maxTempC != null ? `${Math.round(d.maxTempC)}°` : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{d.minTempC != null ? `${Math.round(d.minTempC)}°` : ''}</div>
            <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginTop: 4 }} title={`${rain} mm`}>
              <div style={{ width: 18, height: `${Math.max(rain > 0 ? 4 : 1, (rain / max) * 36)}px`, background: rain >= 30 ? 'var(--red-500)' : 'var(--blue-500)', borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 11 }}>{Math.round(rain * 10) / 10} mm</div>
          </div>
        );
      })}
    </div>
  );
}
