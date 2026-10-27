'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiErrorMessage } from '@/lib/api-error';
import { tone, label } from '@/lib/ops';

/** Loads data once, again on demand, and again whenever `deps` change. */
export function useLoad<T>(fn: () => Promise<{ data: T }>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(() => {
    setLoading(true);
    return fnRef.current().then((r) => { setData(r.data); setError(''); }).catch((e) => setError(apiErrorMessage(e, 'Could not load this.'))).finally(() => setLoading(false));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, error, loading, reload, setData };
}

export const Status = ({ value }: { value?: string | null }) => <span className={`badge ${tone(value)}`}>{label(value)}</span>;

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return <div style={{ padding: 36, textAlign: 'center', color: 'var(--neutral-500)' }}>{text}</div>;
}
export const Empty = ({ children }: { children: ReactNode }) => <div style={{ padding: 36, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>{children}</div>;
export const ErrorNote = ({ message }: { message: string }) => (message ? <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{message}</div> : null);

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  nowrap?: boolean;
}

export const TablePageSizeContext = createContext<number | undefined>(undefined);

export function DataTable<T>({ rows, columns, rowKey, empty = 'Nothing to show.', onRow, pageSize: pageSizeProp }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; empty?: string; onRow?: (row: T) => void; pageSize?: number }) {
  const [page, setPage] = useState(0);
  const contextualPageSize = useContext(TablePageSizeContext);
  if (!rows.length) return <div className="table-panel"><Empty>{empty}</Empty></div>;
  const pageSize = pageSizeProp ?? contextualPageSize ?? 0;
  const pageCount = pageSize ? Math.ceil(rows.length / pageSize) : 1;
  const activePage = Math.min(page, pageCount - 1);
  const visibleRows = pageSize ? rows.slice(activePage * pageSize, (activePage + 1) * pageSize) : rows;
  const firstItem = pageSize ? activePage * pageSize + 1 : 1;
  const lastItem = pageSize ? Math.min((activePage + 1) * pageSize, rows.length) : rows.length;
  return (
    <div className="table-panel">
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead><tr>{columns.map((c) => <th key={c.header} style={{ textAlign: c.align ?? 'left' }}>{c.header}</th>)}</tr></thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} style={onRow ? { cursor: 'pointer' } : undefined}>
                {columns.map((c) => <td key={c.header} style={{ textAlign: c.align ?? 'left', whiteSpace: c.nowrap === false ? 'normal' : 'nowrap', fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined }}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && rows.length > pageSize && <div className="ops-table-pagination" aria-label="Table pagination">
        <span>Showing <strong>{firstItem}–{lastItem}</strong> of <strong>{rows.length.toLocaleString()}</strong> records</span>
        <div className="ops-table-pagination-controls"><button type="button" className="btn-secondary" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous</button><span>Page {activePage + 1} of {pageCount}</span><button type="button" className="btn-secondary" disabled={activePage >= pageCount - 1} onClick={() => setPage(activePage + 1)}>Next</button></div>
      </div>}
    </div>
  );
}

export function Toolbar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="ops-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{right}</div>
    </div>
  );
}

export function Field({ label: l, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className="form-label" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      {l}
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{hint}</span>}
    </label>
  );
}
export const FormGrid = ({ children, min = 180 }: { children: ReactNode; min?: number }) => (
  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</div>
);
export const Facts = ({ items, min = 160 }: { items: [string, ReactNode][]; min?: number }) => (
  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
    {items.map(([k, v]) => <div key={k}><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{k}</div><div style={{ fontWeight: 600, fontSize: 14 }}>{v ?? '—'}</div></div>)}
  </div>
);

/** Runs an action and shows what went wrong without closing the dialog. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async <R,>(fn: () => Promise<R>, fallback = 'That did not work.'): Promise<R | undefined> => {
    setBusy(true); setError('');
    try { return await fn(); } catch (e) { setError(apiErrorMessage(e, fallback)); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, error, run, setError };
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="seg-control" style={{ marginBottom: 16, flexWrap: 'wrap' }} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`seg-btn ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}

export const PageHead = ({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) => (
  <div className="page-heading">
    <div>
      <div className="page-kicker">{kicker}</div>
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
    </div>
  </div>
);
