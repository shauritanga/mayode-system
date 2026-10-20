'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  AlertCircleIcon,
  Building05Icon,
  Calendar01Icon,
  ChartBarLineIcon,
  ClipboardIcon,
  CloudSunRainIcon,
  MapsIcon,
  Package01Icon,
  Plant01Icon,
  Shield01Icon,
  ShoppingCart02Icon,
  UserGroupIcon,
  Wallet01Icon,
} from '@hugeicons/core-free-icons';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CountUpValue } from '@/components/CountUpValue';

const TONE_COLOR: Record<'green' | 'blue' | 'gold' | 'red' | 'purple', string> = {
  green: 'rgb(121,195,108)',
  blue: 'rgb(158,213,216)',
  gold: 'rgb(225,177,99)',
  red: 'rgb(217,95,149)',
  purple: 'rgb(171,150,214)',
};
const TONE_CYCLE = ['red', 'green', 'gold', 'blue', 'purple'] as const;

/** Picks an icon from the wording of a KPI label so every page's tiles get a sensible one without configuring each. */
const ICON_RULES: Array<[RegExp, IconSvgElement]> = [
  [/insur|polic|claim|cover/i, Shield01Icon],
  [/rain|weather|forecast/i, CloudSunRainIcon],
  [/loan|credit|repay|revenue|paid|payment|payout|money|amount|fund|balance|financ|tzs|value|income|cost|price/i, Wallet01Icon],
  [/order|sale|buyer|customer|market/i, ShoppingCart02Icon],
  [/stock|warehouse|lot|deliver|intake|bag|kg|tonn|stored|dispatch|inventory|package|received/i, Package01Icon],
  [/cooperative|amcos|mamcos|centre|center|facility|supplier/i, Building05Icon],
  [/alert|overdue|dispute|issue|attention|unpaid|late|reject|fail/i, AlertCircleIcon],
  [/visit|task|survey|activity|activities|application|inspection|record|submission/i, ClipboardIcon],
  [/season|date|day|schedule|calendar|upcoming|due/i, Calendar01Icon],
  [/crop|cycle|harvest|yield|rice|paddy|production|plant|variety/i, Plant01Icon],
  [/farm|plot|land|hectare|area|region|district|ward|location/i, MapsIcon],
  [/farmer|member|officer|user|staff|people|role|worker|account|gender|male|female|youth/i, UserGroupIcon],
];

function iconFor(label: string): IconSvgElement {
  return ICON_RULES.find(([re]) => re.test(label))?.[1] ?? ChartBarLineIcon;
}

function toneFor(label: string): 'green' | 'blue' | 'gold' | 'red' | 'purple' {
  let sum = 0;
  for (let i = 0; i < label.length; i++) sum += label.charCodeAt(i);
  return TONE_CYCLE[sum % TONE_CYCLE.length];
}

/** Maps a legacy CSS colour (e.g. 'var(--red-400)') to a tile tone, for pages that still pass a colour per figure. */
export function toneFromColor(color?: string): 'green' | 'blue' | 'gold' | 'red' | 'purple' | undefined {
  if (!color) return undefined;
  if (/red|danger/i.test(color)) return 'red';
  if (/gold|amber|yellow|orange/i.test(color)) return 'gold';
  if (/blue/i.test(color)) return 'blue';
  if (/purple|violet/i.test(color)) return 'purple';
  if (/green|accent/i.test(color)) return 'green';
  return undefined;
}

/** Standard KPI tile used across the portals: the slim two-panel `StatCard`. */
export function MetricTile({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Leave out to get a colour from the palette that is stable for this label. */
  tone?: 'green' | 'blue' | 'gold' | 'red' | 'purple';
  icon?: IconSvgElement;
}) {
  const resolved = tone ?? toneFor(label);
  return (
    <StatCard
      variant="solid"
      label={label}
      value={value}
      hint={hint}
      icon={icon ?? iconFor(label)}
      tone={resolved}
      color={TONE_COLOR[resolved]}
    />
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
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: IconSvgElement;
  tone?: 'green' | 'blue' | 'gold' | 'red' | 'purple';
  /** `solid` fills the box with the tone, `tint` is a soft wash, `plain` has no box (for use inside a card). */
  variant?: 'solid' | 'tint' | 'plain';
  /** Exact fill for the `solid` variant, e.g. 'rgb(217,95,149)'; the icon panel is derived from it. */
  color?: string;
}) {
  return (
    <article
      className={`kpi-card kpi-card-${tone} kpi-card-${variant}`}
      style={color ? ({ '--stat-solid': color } as React.CSSProperties) : undefined}
    >
      <span className="kpi-card-icon" aria-hidden>
        <HugeiconsIcon icon={icon} size={variant === 'solid' ? 24 : 22} strokeWidth={1.8} />
      </span>
      <div className="kpi-card-body">
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
  return <div className="kpi-card skeleton" aria-hidden="true" style={{ minHeight: 84 }} />;
}

export function MetricTileSkeleton() {
  return (
    <StatCardSkeleton />
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
