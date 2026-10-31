'use client';

import Link from 'next/link';

export interface ToastAlert { severity: string; message: string; href: string }

/** The closable box at the bottom right that lists what needs attention. */
export default function AlertToast({ alerts, onClose, title = 'Needs your attention' }: { alerts: ToastAlert[]; onClose: () => void; title?: string }) {
  if (!alerts.length) return null;
  return (
    <aside className="login-alerts" role="status" aria-live="polite" aria-label="Alerts">
      <div className="login-alerts-head">
        <span className="login-alerts-icon" aria-hidden>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.5 20h19L12 3z" /><path d="M12 10v4" /><path d="M12 17.2v.1" /></svg>
        </span>
        <strong>{title}</strong>
        <span className="muted" style={{ fontSize: 12 }}>{alerts.length}</span>
        <button type="button" className="login-alerts-close" onClick={onClose} aria-label="Close alerts">×</button>
      </div>
      <ul className="login-alerts-list">
        {alerts.slice(0, 5).map((a, i) => (
          <li key={i} className={a.severity === 'warning' ? 'is-warning' : 'is-info'}><Link href={a.href} onClick={onClose}>{a.message}</Link></li>
        ))}
      </ul>
      {alerts.length > 5 && <div className="login-alerts-more">and {alerts.length - 5} more</div>}
    </aside>
  );
}
