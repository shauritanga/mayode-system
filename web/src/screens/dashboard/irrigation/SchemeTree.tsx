'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { farmId } from '@/lib/farm-id';
import { irrigationApi } from '@/lib/api';
import { BASE, Empty, LoadError, ProgressBar, StatusBadge, fmtNum, useApi, useDebounced } from './ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

/** Green = allocated and up to date, yellow = waiting for approval, red = owes money past its due date, grey = not allocated. */
const TONE = {
  green: { bg: 'rgba(22,163,74,.14)', fg: '#15803d', label: 'Allocated, up to date' },
  yellow: { bg: 'rgba(234,179,8,.20)', fg: '#a16207', label: 'Awaiting approval' },
  red: { bg: 'rgba(220,38,38,.14)', fg: '#b91c1c', label: 'Owes past the due date' },
  grey: { bg: 'rgba(107,114,128,.14)', fg: '#4b5563', label: 'Not allocated' },
} as const;
type Tone = keyof typeof TONE;
export const toneOf = (h: { allocationStatus: string; overdue?: boolean | null }): Tone =>
  h.overdue ? 'red' : h.allocationStatus === 'PENDING' ? 'yellow' : h.allocationStatus === 'ALLOCATED' ? 'green' : 'grey';

export function Legend({ showRed }: { showRed: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }} aria-label="Colour key">
      {(Object.keys(TONE) as Tone[]).filter((t) => showRed || t !== 'red').map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: TONE[t].bg, border: `1px solid ${TONE[t].fg}` }} />{TONE[t].label}
        </span>
      ))}
    </div>
  );
}

const Owed = ({ debt }: { debt?: { outstanding: number; overdue: number; defaulters: number } | null }) => {
  if (!debt) return null;
  if (!debt.outstanding) return <span className="muted">—</span>;
  return (
    <span>
      {tzs(debt.outstanding)}
      {debt.overdue > 0 && <div style={{ color: '#b91c1c', fontSize: 11.5 }}>{tzs(debt.overdue)} overdue · {debt.defaulters} member{debt.defaulters === 1 ? '' : 's'}</div>}
    </span>
  );
};

function Chevron({ open }: { open: boolean }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 14, transition: 'transform 120ms', transform: open ? 'rotate(90deg)' : undefined }}>▸</span>;
}

/** The 30 hectares of one block, coloured by standing; each opens its detail page. */
function Plots({ blockId }: { blockId: string }) {
  const { data, loading, error, reload } = useApi<any>(() => irrigationApi.hectares({ blockId, pageSize: 60 }), [blockId]);
  if (loading) return <div className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>Loading hectares…</div>;
  if (error) return <LoadError message={error} onRetry={reload} />;
  const rows: any[] = data?.data ?? [];
  if (!rows.length) return <div className="muted" style={{ fontSize: 12.5 }}>No hectare units in this block yet.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
      {rows.map((h) => {
        const tone = TONE[toneOf(h)];
        return (
          <Link key={h.id} href={`${BASE}/structure/hectares/${h.id}`} title={`${farmId(h.code)}${h.farmer ? ` · ${h.farmer.name}` : ' · not allocated'}`}
            style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}33`, borderRadius: 6, padding: '5px 7px', fontSize: 12, textDecoration: 'none', lineHeight: 1.3 }}>
            <strong>{farmId(h.code)}</strong>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.9 }}>{h.farmer ? h.farmer.name : 'Free'}</div>
          </Link>
        );
      })}
    </div>
  );
}

/** The blocks of one canal, each opening to its hectares. */
function Blocks({ canalId, showDebt }: { canalId: string; showDebt: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useApi<any>(() => irrigationApi.blocks({ canalId, pageSize: 100 }), [canalId]);
  if (loading) return <div className="muted" style={{ fontSize: 12.5, padding: 8 }}>Loading blocks…</div>;
  if (error) return <LoadError message={error} onRetry={reload} />;
  const rows: any[] = data?.data ?? [];
  if (!rows.length) return <div className="muted" style={{ fontSize: 12.5, padding: 8 }}>No blocks in this canal yet.</div>;
  return (
    <div>
      {rows.map((b) => {
        const isOpen = open === b.id;
        const pct = b.stats.hectareUnits ? Math.round((b.stats.allocatedUnits / b.stats.hectareUnits) * 100) : 0;
        return (
          <div key={b.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}
              style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(110px,1.2fr) 90px minmax(100px,1fr) minmax(120px,1.2fr) minmax(120px,1fr)', gap: 10, alignItems: 'center', padding: '8px 16px 8px 38px', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
              <span><Chevron open={isOpen} /> <strong>Block {farmId(b.code)}</strong></span>
              <span className="muted" style={{ fontSize: 12.5 }}>{b.stats.allocatedUnits}/{b.stats.hectareUnits} ha</span>
              <span><ProgressBar pct={pct} label={`Block ${b.code} allocation`} /></span>
              <span style={{ fontSize: 12.5 }}>{b.leader?.state === 'ASSIGNED' ? b.leader.name : <StatusBadge value="UNASSIGNED" label="No leader" />}</span>
              {showDebt ? <span style={{ fontSize: 12.5 }}><Owed debt={b.debt} /></span> : <span />}
            </button>
            {isOpen && <div style={{ padding: '4px 16px 14px 38px' }}><Plots blockId={b.id} /></div>}
          </div>
        );
      })}
    </div>
  );
}

/** Canals → blocks → hectares in one expandable view, with who leads each and what is owed. */
export function SchemeTree({ canals, showDebt, empty }: { canals: any[]; showDebt: boolean; empty?: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!canals.length) return <>{empty ?? <Empty title="No canals yet" />}</>;
  return (
    <div>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}><Legend showRed={showDebt} /></div>
      <div className="muted" style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,1.2fr) 90px minmax(100px,1fr) minmax(120px,1.2fr) minmax(120px,1fr)', gap: 10, padding: '8px 16px 8px 38px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <span>Canal / block</span><span>Hectares</span><span>Allocated</span><span>Leader</span><span>{showDebt ? 'Owed' : ''}</span>
      </div>
      {canals.map((c) => {
        const isOpen = open === c.id;
        return (
          <Fragment key={c.id}>
            <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}
                style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(110px,1.2fr) 90px minmax(100px,1fr) minmax(120px,1.2fr) minmax(120px,1fr)', gap: 10, alignItems: 'center', padding: '10px 16px', background: isOpen ? 'var(--surface-2, rgba(0,0,0,.03))' : 'none', border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                <span><Chevron open={isOpen} /> <strong>{c.code} · {c.name}</strong> <span className="muted" style={{ fontSize: 12 }}>({c.blockCount} blocks)</span>{c.status !== 'ACTIVE' && <> <StatusBadge value={c.status} /></>}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>{fmtNum(c.allocatedUnits)}/{fmtNum(c.hectareUnits)} ha</span>
                <span><ProgressBar pct={c.completionPct} label={`${c.name} allocation`} /></span>
                <span style={{ fontSize: 12.5 }}>{c.leader ? <>{c.leader.name}{c.leader.state === 'TERM_EXPIRED' && <> <StatusBadge value="TERM_EXPIRED" label="Term expired" /></>}</> : <StatusBadge value="UNASSIGNED" label="No leader" />}</span>
                {showDebt ? <span style={{ fontSize: 12.5 }}><Owed debt={c.debt} /></span> : <span />}
              </button>
              {isOpen && <Blocks canalId={c.id} showDebt={showDebt} />}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Type a farm id (1:1R-1, 1.1R-1 or 1.1R1), a name or a member number and jump to the hectare. */
export function FarmFinder({ schemeId }: { schemeId: string }) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const { data, loading, error } = useApi<any>(schemeId && q.length >= 2 ? () => irrigationApi.hectares({ schemeId, q, pageSize: 6 }) : null, [schemeId, q]);
  const rows: any[] = q.length >= 2 ? data?.data ?? [] : [];
  return (
    <div>
      <label htmlFor="farm-finder" className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Find a farm by its ID (for example 1:1R-1), or by the farmer’s name or member number</label>
      <input id="farm-finder" className="input-field" style={{ maxWidth: 420 }} placeholder="1:1R-1" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
      {q.length >= 2 && (
        <div style={{ marginTop: 10 }} aria-live="polite">
          {error ? <span className="muted" style={{ fontSize: 13 }}>Could not search. Try again.</span>
            : loading ? <span className="muted" style={{ fontSize: 13 }}>Searching…</span>
            : !rows.length ? <span className="muted" style={{ fontSize: 13 }}>No farm matches “{q}”.</span>
            : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, maxWidth: 560 }}>
                {rows.map((h) => {
                  const tone = TONE[toneOf(h)];
                  return (
                    <li key={h.id}>
                      <Link href={`${BASE}/structure/hectares/${h.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--border-subtle)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 10, background: tone.fg }} title={tone.label} />
                        <strong style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{farmId(h.code)}</strong>
                        <span style={{ flex: 1 }}>{h.farmer ? <>{h.farmer.name} <span className="muted">· {h.farmer.memberNumber}</span></> : <span className="muted">Not allocated</span>}</span>
                        <span className="muted" style={{ fontSize: 12 }}>Open</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
