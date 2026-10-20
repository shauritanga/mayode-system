'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
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

/**
 * Summary box: icon on the left, value and label stacked on the right, on a softly tinted background.
 * Reusable for any headline figure; `tone` picks the colour, `icon` is any Hugeicons icon.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'green',
  variant = 'tint',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: IconSvgElement;
  tone?: 'green' | 'blue' | 'gold' | 'red' | 'purple';
  /** `solid` fills the box with the tone, `tint` is a soft wash, `plain` has no box (for use inside a card). */
  variant?: 'solid' | 'tint' | 'plain';
}) {
  return (
    <article className={`stat-card stat-card-${tone} stat-card-${variant}`}>
      <span className="stat-card-icon" aria-hidden>
        <HugeiconsIcon icon={icon} size={variant === 'solid' ? 34 : 22} strokeWidth={1.8} />
      </span>
      <div className="stat-card-body">
        <strong>
          <CountUpValue value={value} />
        </strong>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
    </article>
  );
}

export function StatCardSkeleton() {
  return <div className="stat-card skeleton" aria-hidden="true" style={{ minHeight: 84 }} />;
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

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <MetricTileSkeleton key={i} />
      ))}
    </>
  );
}

export function TableSkeleton({
  rows = 8,
  avatar = true,
  columns = 2,
}: {
  rows?: number;
  avatar?: boolean;
  columns?: number;
}) {
  return (
    <div className="farmers-skeleton" aria-hidden="true">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="farmers-skeleton-row">
          {avatar && <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 999 }} />}
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-text" style={{ width: '38%', marginBottom: 8 }} />
            <div className="skeleton skeleton-text" style={{ width: '22%' }} />
          </div>
          {[...Array(columns)].map((__, c) => (
            <div key={c} className="skeleton skeleton-text" style={{ width: c % 2 === 0 ? 72 : 88 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <div className="skeleton" aria-hidden="true" style={{ height, borderRadius: 12 }} />;
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
