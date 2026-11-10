'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { publicTendersApi } from '@/lib/api';

const tzs = (v: number) => `TZS ${Math.round(v).toLocaleString('en-US')}`;
const when = (v: string) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const CATEGORY: Record<string, string> = { CANAL_CLEARING: 'Canal clearing', DESILTING: 'Desilting', ROAD_GRADING: 'Road grading', DRAINAGE_REPAIR: 'Drainage repair', OTHER: 'Other' };
const STATE: Record<string, string> = { OPEN: 'Open for bids', EVALUATION: 'Bids closed: being evaluated', AWARDED: 'Awarded', COMPLETED: 'Completed' };

/** Anyone can read the tenders: what is wanted, the ceiling, the deadline, how bids are judged, and how payment works. */
export default function PublicTenders() {
  const [rows, setRows] = useState<any[] | null>(null); const [error, setError] = useState('');
  useEffect(() => { publicTendersApi.list().then((r) => setRows(r.data.data)).catch(() => setError('Could not load the tenders. Try again later.')); }, []);
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 4 }}>Infrastructure tenders</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>Canal, road and drainage maintenance for AMCOS schemes is awarded only here, openly. Bids are sealed until the closing time and scored without names. <Link href="/contractor-register">Register as a contractor</Link> · <Link href="/login">Sign in to bid</Link></p>
      {error && <div role="alert">{error}</div>}
      {!rows && !error && <p>Loading…</p>}
      {rows && !rows.length && <p>No tenders are published right now.</p>}
      <div style={{ display: 'grid', gap: 14 }}>
        {rows?.map((t) => (
          <article key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{t.reference} · {t.amcos} · {CATEGORY[t.category]}</div>
            <h2 style={{ margin: '2px 0 6px', fontSize: 18 }}>{t.title}</h2>
            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: t.open ? '#dcfce7' : '#f3f4f6' }}>{STATE[t.status]}</span>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{t.scope}</p>
            <div style={{ fontSize: 13, color: '#374151' }}>Budget ceiling <strong>{tzs(t.budgetCeiling)}</strong> · bids close {when(t.closesAt)}</div>
            <div style={{ fontSize: 13, color: '#374151' }}>Scored on price {t.criteria.price}, equipment {t.criteria.equipment}, experience {t.criteria.experience}, past performance {t.criteria.performance}. Paid in {t.milestones.length} step(s) after on-site inspection: {t.milestones.map((m: any) => `${m.title} (${m.percent}%)`).join(', ')}.</div>
          </article>
        ))}
      </div>
    </main>
  );
}
