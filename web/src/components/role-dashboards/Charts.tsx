'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReactNode } from 'react';

const tooltipStyle = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontSize: 13,
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)',
};

const axisTick = { fill: 'var(--neutral-500)', fontSize: 12 };

export const CHART_PALETTE = [
  'var(--green-500)',
  'var(--gold-400)',
  'var(--blue-500)',
  'var(--purple-500)',
  'var(--red-400)',
  'var(--green-300)',
];

export function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="insight-panel chart-card">
      <div className="insight-panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ChartEmptyState({ children }: { children: ReactNode }) {
  return <div className="chart-empty-state">{children}</div>;
}

export function TrendAreaChart({
  data,
  xKey,
  series,
  height = 240,
}: {
  data: Record<string, any>[];
  xKey: string;
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  if (!data.length) return <ChartEmptyState>No trend data yet.</ChartEmptyState>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient id={`fill-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={54} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)' }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--neutral-500)' }} />}
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2.5}
            fill={`url(#fill-${s.key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutBreakdown({
  data,
  height = 240,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) return <ChartEmptyState>No data yet.</ChartEmptyState>;
  const total = filtered.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="donut-layout">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {filtered.map((entry, i) => (
              <Cell key={entry.name} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="donut-legend">
        {filtered.map((entry, i) => (
          <li key={entry.name}>
            <span className="donut-legend-dot" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
            <span className="donut-legend-label">{entry.name}</span>
            <span className="donut-legend-value">
              {entry.value.toLocaleString()} · {total ? Math.round((entry.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HorizontalBarChart({
  data,
  height = 240,
  color = 'var(--green-500)',
}: {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (!data.length) return <ChartEmptyState>No data yet.</ChartEmptyState>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
        barCategoryGap={12}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover-tint-2)' }} />
        <Bar dataKey="value" fill={color} radius={[0, 8, 8, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface LeaderboardColumn {
  key: string;
  label: string;
}

export function LeaderboardTable({
  rows,
  columns,
  rankBy,
}: {
  rows: Record<string, any>[];
  columns: LeaderboardColumn[];
  /** Column key to sort descending by (ties broken by input order). */
  rankBy: string;
}) {
  if (!rows.length) return <ChartEmptyState>No data yet.</ChartEmptyState>;
  const sorted = [...rows].sort((a, b) => (b[rankBy] ?? 0) - (a[rankBy] ?? 0));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.id ?? row.name ?? i}>
              <td>{i + 1}</td>
              {columns.map((col) => (
                <td key={col.key}>{row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
