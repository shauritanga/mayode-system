'use client';
import { GROWTH_STAGES, stageIndex } from '@/lib/crop-stages';

/** The ten rice stages as a progress track; done steps are filled, the current step is highlighted. */
export default function CropStageStepper({ stage, compact = false }: { stage?: string | null; compact?: boolean }) {
  const current = stageIndex(stage);
  if (compact) {
    return (
      <div style={{ minWidth: 150 }}>
        <div style={{ display: 'flex', gap: 2 }} aria-hidden>
          {GROWTH_STAGES.map((s, i) => (
            <span
              key={s.key}
              style={{ flex: 1, height: 6, borderRadius: 3, background: i <= current ? 'var(--accent)' : 'var(--border-subtle)', opacity: i === current ? 1 : i < current ? 0.55 : 1 }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11, marginTop: 4, color: current >= 0 ? 'var(--text-primary)' : 'var(--text-3)', fontWeight: 600 }}>
          {current >= 0 ? `${current + 1}/10 · ${GROWTH_STAGES[current].label}` : 'Not recorded'}
        </div>
      </div>
    );
  }
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }} aria-label="Crop growth stages">
      {GROWTH_STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} aria-current={active ? 'step' : undefined} style={{ textAlign: 'center' }}>
            <div
              style={{
                height: 8, borderRadius: 4, marginBottom: 8,
                background: done || active ? 'var(--accent)' : 'var(--border-subtle)', opacity: done ? 0.55 : 1,
              }}
            />
            <div
              style={{
                width: 26, height: 26, margin: '0 auto 4px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                background: active ? 'var(--accent)' : done ? 'var(--accent-soft)' : 'var(--surface-tint)',
                color: active ? '#fff' : done ? 'var(--accent)' : 'var(--text-3)',
                border: active ? 'none' : '1px solid var(--border-subtle)',
              }}
            >
              {done ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.3, fontWeight: active ? 700 : 500, color: active ? 'var(--text-primary)' : 'var(--text-3)' }}>{s.label}</div>
          </li>
        );
      })}
    </ol>
  );
}
