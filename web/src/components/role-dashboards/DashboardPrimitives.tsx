'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CountUpValue } from '@/components/CountUpValue';

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
      <strong>
        <CountUpValue value={value} />
      </strong>
      {hint && <small>{hint}</small>}
    </article>
  );
}

export function MetricTileSkeleton() {
  return (
    <div className="metric-tile" aria-hidden="true">
      <div className="skeleton skeleton-text" style={{ width: '45%' }} />
      <div className="skeleton skeleton-title" style={{ marginTop: 14 }} />
      <div className="skeleton skeleton-text" style={{ width: '70%', marginTop: 8 }} />
    </div>
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
