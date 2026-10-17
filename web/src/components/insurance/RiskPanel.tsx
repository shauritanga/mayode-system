'use client';
import { RISK_BADGE, type RiskInfo } from '@/lib/insurance';

/** Weather, claims and yield risk in plain terms, with what drove the rating. */
export default function RiskPanel({ risk }: { risk: RiskInfo | null }) {
  if (!risk) return null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>Crop and weather risk</strong>
        <span className={`badge ${RISK_BADGE[risk.level]}`}>{risk.level.toLowerCase()}</span>
        <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{risk.alertsInArea} weather alert{risk.alertsInArea === 1 ? '' : 's'} in {risk.area ?? 'the area'} this year</span>
      </div>
      {risk.factors.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Nothing unusual found.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {risk.factors.map((f) => (
            <li key={f.label} style={{ color: f.points < 0 ? 'var(--green-500)' : undefined }}>{f.label} — {f.detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
