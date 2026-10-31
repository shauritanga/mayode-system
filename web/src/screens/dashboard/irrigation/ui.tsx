'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { irrigationApi, uploadsApi } from '@/lib/api';
import { hasPermission } from '@/lib/nav';
import { useAuthStore } from '@/store/auth.store';

// ───────────────────────── formatting ─────────────────────────

export const BASE = '/dashboard/irrigation';

export const errMsg = (reason: any, fallback = 'Something went wrong. Please try again.'): string => {
  const message = reason?.response?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  return message || reason?.message || fallback;
};

export const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(value);
};
export const fmtNum = (value?: number | null, digits = 0) =>
  value == null ? '—' : Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtHa = (value?: number | null) => `${fmtNum(value, Number.isInteger(Number(value)) ? 0 : 2)} ha`;
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const titleCase = (value?: string | null) =>
  (value ?? '').toLowerCase().split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');

const TONES: Record<string, string> = {
  ACTIVE: 'badge-green', ALLOCATED: 'badge-green', COMPLETED: 'badge-green', ASSIGNED: 'badge-green', FULL: 'badge-green',
  PENDING: 'badge-gold', PENDING_APPROVAL: 'badge-gold', PARTIAL: 'badge-gold', PLANNED: 'badge-blue', UNDER_MAINTENANCE: 'badge-gold',
  TERM_EXPIRED: 'badge-red', REJECTED: 'badge-red', CANCELLED: 'badge-gray', ENDED: 'badge-gray', INACTIVE: 'badge-gray',
  AVAILABLE: 'badge-blue', NONE: 'badge-gray', UNASSIGNED: 'badge-red',
};
export function StatusBadge({ value, label }: { value?: string | null; label?: string }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`badge ${TONES[value] ?? 'badge-gray'}`}>{label ?? titleCase(value)}</span>;
}

// ───────────────────────── data loading ─────────────────────────

/** Loads once and whenever `deps` change. A newer request supersedes an older one. */
export function useApi<T = any>(load: (() => Promise<{ data: T }>) | null, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!load);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    if (!load) return;
    const mine = ++seq.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the request as in flight
    setLoading(true);
    setError('');
    load().then(
      (res) => { if (mine === seq.current) { setData(res.data); setLoading(false); } },
      (reason) => { if (mine === seq.current) { setError(errMsg(reason, 'Could not load this page.')); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  // With nothing to load (e.g. a closed tab) report an idle, empty result instead of stale data.
  return load ? { data, loading, error, reload } : { data: null as T | null, loading: false, error: '', reload };
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// ───────────────────────── scheme context ─────────────────────────

export interface SchemeLite { id: string; name: string; code?: string | null; status: string; mamcos?: { id: string; name: string } | null }
interface Ctx {
  schemes: SchemeLite[];
  schemeId: string;
  setSchemeId: (id: string) => void;
  loading: boolean;
  reloadSchemes: () => void;
  can: (resource: string, action: string) => boolean;
}
const IrrigationContext = createContext<Ctx>({ schemes: [], schemeId: '', setSchemeId: () => undefined, loading: true, reloadSchemes: () => undefined, can: () => false });
export const IrrigationProvider = IrrigationContext.Provider;
export const useIrrigation = () => useContext(IrrigationContext);

export function useCan() {
  const user = useAuthStore((s) => s.user);
  return useCallback((resource: string, action: string) => hasPermission(user, resource, action), [user]);
}

// ───────────────────────── layout pieces ─────────────────────────

export interface Crumb { label: string; href?: string }
export function PageHeader({ title, subtitle, crumbs, actions }: { title: string; subtitle?: string; crumbs?: Crumb[]; actions?: ReactNode }) {
  return (
    <header style={{ marginBottom: 18 }}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: 12, marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {crumbs.map((c, i) => (
            <span key={i}>
              {c.href ? <Link href={c.href} style={{ color: 'inherit', textDecoration: 'underline' }}>{c.label}</Link> : c.label}
              {i < crumbs.length - 1 && <span style={{ marginLeft: 6 }}>/</span>}
            </span>
          ))}
        </nav>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, margin: 0 }}>{title}</h1>
          {subtitle && <p className="muted" style={{ margin: '6px 0 0' }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </header>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'good' }) {
  return (
    <div className="glass-card" style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <strong style={{ display: 'block', marginTop: 6, fontSize: 22, color: tone === 'warn' ? 'var(--red-500)' : undefined }}>{value}</strong>
      {hint && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function ProgressBar({ pct, label, height = 8 }: { pct: number; label?: string; height?: number }) {
  const value = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Allocation progress'}>
      <div style={{ height, borderRadius: height, background: 'var(--surface-3, #e5e7eb)', overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: 'var(--accent)', transition: 'width 200ms' }} />
      </div>
    </div>
  );
}

export function Panel({ title, actions, children, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="table-panel" style={{ marginBottom: 16 }}>
      {(title || actions) && <div className="section-toolbar"><strong>{title}</strong>{actions}</div>}
      <div style={pad ? { padding: 16 } : undefined}>{children}</div>
    </section>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {hint && <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="glass-card" style={{ padding: '12px 16px', marginBottom: 16, color: 'var(--red-400)', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{message}</span>
      {onRetry && <button type="button" className="btn-secondary" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Notice({ tone, children, onDismiss }: { tone: 'success' | 'error'; children: ReactNode; onDismiss?: () => void }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className="glass-card" style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12, color: tone === 'error' ? 'var(--red-400)' : 'var(--accent)' }}>
      <span>{children}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>×</button>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: 12, display: 'grid', gap: 8 }}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
          {Array.from({ length: cols }, (_, c) => <div key={c} className="skeleton" style={{ height: 16, borderRadius: 4 }} />)}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="metric-grid" style={{ marginBottom: 16 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <div key={i} className="glass-card skeleton" style={{ height: 78 }} />)}
    </div>
  );
}

export interface Meta { total: number; page: number; pageSize: number; pages: number }
export function Pager({ meta, onPage }: { meta?: Meta; onPage: (page: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 12 }}>{fmtNum(from)}–{fmtNum(to)} of {fmtNum(meta.total)}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="button" className="btn-secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</button>
        <span style={{ fontSize: 12 }}>Page {meta.page} of {meta.pages}</span>
        <button type="button" className="btn-secondary" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error, wide }: { label: string; children: ReactNode; hint?: string; error?: string; wide?: boolean }) {
  return (
    <label className="form-label" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      {label}
      {children}
      {hint && !error && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{hint}</span>}
      {error && <span style={{ color: 'var(--red-400)', fontSize: 12, fontWeight: 400 }}>{error}</span>}
    </label>
  );
}

export const FormGrid = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>{children}</div>
);

export function Filters({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>{children}</div>;
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', marginBottom: 16 }}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} type="button" onClick={() => onChange(t.id)}
          style={{ padding: '9px 14px', background: 'none', border: 'none', borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent', color: active === t.id ? 'var(--text-1)' : 'var(--text-3)', fontWeight: active === t.id ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Replaces window.confirm: states the consequence, requires an explicit click, optionally collects a reason. */
export function ConfirmDialog({ title, body, confirmLabel, danger, askReason, reasonLabel = 'Reason', onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel: string; danger?: boolean; askReason?: boolean; reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (askReason && !reason.trim()) { setError(`${reasonLabel} is required`); return; }
    setBusy(true); setError('');
    try { await onConfirm(reason.trim()); onClose(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={() => !busy && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={submit} disabled={busy} style={danger ? { background: 'var(--red-500)' } : undefined}>{busy ? 'Working…' : confirmLabel}</button></>}>
      <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
        <div>{body}</div>
        {askReason && <Field label={reasonLabel} error={error}><textarea className="input-field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>}
        {!askReason && error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}

// ───────────────────────── pickers ─────────────────────────

export interface MemberLite { id: string; name: string; memberNumber: string; village?: string | null; phone?: string | null; hectaresHeld: number }

/** Search the existing AMCOS member registry; nothing here can create a member. */
export function MemberPicker({ schemeId, value, onChange, purpose = 'allocation', label = 'Member' }: {
  schemeId: string; value: MemberLite | null; onChange: (m: MemberLite | null) => void; purpose?: 'allocation' | 'leadership'; label?: string;
}) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 250);
  const [results, setResults] = useState<MemberLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (q.length < 2 || !schemeId) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the search as in flight
    setBusy(true); setError('');
    (purpose === 'leadership' ? irrigationApi.leadershipMembers : irrigationApi.members)({ schemeId, q })
      .then((res) => { if (live) setResults(res.data); })
      .catch((e) => { if (live) setError(errMsg(e, 'Member search failed.')); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [q, schemeId, purpose]);
  if (value) {
    return (
      <Field label={label}>
        <div className="input-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span><strong>{value.name}</strong> <span className="muted">· {value.memberNumber}</span></span>
          <button type="button" className="btn-secondary" onClick={() => { onChange(null); setText(''); }}>Change</button>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label} hint="Type at least 2 letters of the name, member number or phone">
      <input className="input-field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search members" autoComplete="off" />
      {error && <span style={{ color: 'var(--red-400)', fontSize: 12 }}>{error}</span>}
      {q.length >= 2 && schemeId && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 220, overflow: 'auto', marginTop: 4 }}>
          {busy ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>Searching…</div>
            : results.length === 0 ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>No matching members in this AMCOS.</div>
            : results.map((m) => (
              <button key={m.id} type="button" onClick={() => onChange(m)}
                style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: 'inherit' }}>
                <span><strong>{m.name}</strong> <span className="muted">· {m.memberNumber}{m.village ? ` · ${m.village}` : ''}</span></span>
                <span className="muted">{m.hectaresHeld} ha held</span>
              </button>
            ))}
        </div>
      )}
    </Field>
  );
}

/** Canal → block cascade used by filters and the allocation workspace. */
export function useCanalBlockOptions(schemeId: string, canalId: string) {
  const canals = useApi<{ data: any[] }>(schemeId ? () => irrigationApi.canals({ schemeId, pageSize: 100 }) : null, [schemeId]);
  const blocks = useApi<{ data: any[] }>(schemeId ? () => irrigationApi.blocks({ schemeId, canalId: canalId || undefined, pageSize: 200 }) : null, [schemeId, canalId]);
  return { canals: canals.data?.data ?? [], blocks: blocks.data?.data ?? [], loading: canals.loading || blocks.loading };
}

// ───────────────────────── documents & history ─────────────────────────

const DOC_TYPES = ['REGISTRATION', 'SURVEY_MAP', 'ALLOCATION_LETTER', 'TRANSFER_SUPPORT', 'APPOINTMENT_LETTER', 'INFRASTRUCTURE', 'OTHER'];

export function DocumentsPanel({ schemeId, canalId, blockId, transferId, canAdd }: {
  schemeId: string; canalId?: string; blockId?: string; transferId?: string; canAdd: boolean;
}) {
  const { data, loading, error, reload } = useApi<any[]>(() => irrigationApi.documents({ schemeId, canalId, blockId, transferId }), [schemeId, canalId, blockId, transferId]);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('OTHER');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const save = async () => {
    if (!file || !title.trim()) { setFormError('Give the document a title and choose a file.'); return; }
    setSaving(true); setFormError('');
    try {
      const up = await uploadsApi.upload(file);
      await irrigationApi.createDocument({
        schemeId, canalId, blockId, transferId, type, title: title.trim(),
        fileUrl: up.data.url, fileName: (up.data as any).fileName ?? file.name, mimeType: (up.data as any).mimeType ?? file.type, sizeBytes: (up.data as any).sizeBytes ?? file.size,
      });
      setOpen(false); setTitle(''); setFile(null); setType('OTHER'); reload();
    } catch (e) { setFormError(errMsg(e, 'Could not save the document.')); } finally { setSaving(false); }
  };
  return (
    <Panel title="Documents" actions={canAdd ? <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Add document</button> : undefined} pad={false}>
      <LoadError message={error} onRetry={reload} />
      {loading ? <TableSkeleton rows={3} cols={4} /> : !data?.length ? <Empty title="No documents yet" hint={canAdd ? 'Upload registration papers, survey maps or supporting letters.' : undefined} /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Title</th><th>Type</th><th>File</th><th>Uploaded</th><th /></tr></thead><tbody>
          {data.map((d) => (
            <tr key={d.id}><td style={{ fontWeight: 600 }}>{d.title}</td><td>{titleCase(d.type)}</td>
              <td><a href={d.fileUrl} target="_blank" rel="noreferrer">{d.fileName}</a></td>
              <td>{fmtDate(d.createdAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}</td>
              <td>{canAdd && <button type="button" className="btn-secondary" onClick={() => setRemoving(d)}>Remove</button>}</td></tr>
          ))}
        </tbody></table></div>
      )}
      {open && (
        <Modal title="Add document" onClose={() => !saving && setOpen(false)} width="480px"
          footer={<><button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Uploading…' : 'Save document'}</button></>}>
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="Title"><input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Type"><select className="input-field" value={type} onChange={(e) => setType(e.target.value)}>{DOC_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></Field>
            <Field label="File"><input type="file" className="input-field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
            {formError && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{formError}</div>}
          </div>
        </Modal>
      )}
      {removing && <ConfirmDialog title="Remove document" body={<>Remove <strong>{removing.title}</strong> from this record? The file is archived, not erased.</>} confirmLabel="Remove" danger
        onConfirm={async () => { await irrigationApi.archiveDocument(removing.id); reload(); }} onClose={() => setRemoving(null)} />}
    </Panel>
  );
}

export function HistoryPanel({ load, deps }: { load: () => Promise<{ data: any[] }>; deps: unknown[] }) {
  const { data, loading, error, reload } = useApi<any[]>(load, deps);
  return (
    <Panel title="Change history" pad={false}>
      <LoadError message={error} onRetry={reload} />
      {loading ? <TableSkeleton rows={4} cols={3} /> : !data?.length ? <Empty title="No recorded changes" /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>When</th><th>Who</th><th>Change</th></tr></thead><tbody>
          {data.map((h) => (
            <tr key={h.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(h.at)} {String(h.at).slice(11, 16)}</td><td>{h.by ?? '—'}</td>
              <td>
                <strong>{titleCase(String(h.action).replace(/-/g, '_'))}</strong>
                {h.changes && Object.entries(h.changes as Record<string, [unknown, unknown]>).map(([field, [from, to]]) => (
                  <div key={field} style={{ fontSize: 12 }}><span className="muted">{titleCase(field.replace(/([A-Z])/g, '_$1'))}:</span> {String(from ?? '—')} → {String(to ?? '—')}</div>
                ))}
              </td></tr>
          ))}
        </tbody></table></div>
      )}
    </Panel>
  );
}
