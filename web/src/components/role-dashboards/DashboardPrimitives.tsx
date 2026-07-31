import Link from 'next/link';
import type { ReactNode } from 'react';

export function RoleHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <section className="role-hero">
      <div>
        <p className="page-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children && <div className="role-hero-action">{children}</div>}
    </section>
  );
}

export function MetricTile({
  label,
  value,
  hint,
  tone = 'green',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'green' | 'blue' | 'gold' | 'red' | 'purple';
}) {
  return (
    <article className={`metric-tile metric-tile-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  );
}

export function InsightPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="insight-panel">
      <div className="insight-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function ActionLink({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} className="action-link-card">
      <strong>{title}</strong>
      <span>{text}</span>
    </Link>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="role-empty-state">{children}</div>;
}

export function money(value?: number | null) {
  return `TZS ${Math.round(value || 0).toLocaleString()}`;
}
