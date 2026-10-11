'use client';

/** Inline error notice shown above page content when a load/save fails. */
export default function ErrorBanner({ message, onDismiss }: { message?: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="glass-card"
      style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--red-400)', fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}
    >
      <span>{message}</span>
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>}
    </div>
  );
}
