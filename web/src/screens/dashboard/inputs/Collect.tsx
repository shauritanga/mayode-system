'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import { inputApplicationsApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { Notice, errMsg } from '@/screens/dashboard/irrigation/ui';

const card: React.CSSProperties = { background: 'var(--bg-elevated, rgba(127,127,127,.08))', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 };

/** The warehouse keeper: type the code the farmer shows, check who and what, then hand over. Stock leaves the warehouse only when confirmed. */
export function Collect({ onChanged }: { onChanged: () => void }) {
  const [code, setCode] = useState(''); const [found, setFound] = useState<any>(null); const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('');
  const reset = () => { setCode(''); setFound(null); setQty({}); setError(''); };
  const check = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const r: any = (await inputApplicationsApi.lookup(code.trim())).data;
      setFound(r); setQty(Object.fromEntries(r.lines.filter((l: any) => !l.given).map((l: any) => [l.id, String(l.quantity)])));
    } catch (e) { setFound(null); setError(errMsg(e, 'That code could not be checked.')); } finally { setBusy(false); }
  };
  const pending: any[] = found?.lines.filter((l: any) => !l.given) ?? [];
  const over = pending.some((l) => Number(qty[l.id]) > l.inStock);
  const total = pending.reduce((n, l) => n + (Number(qty[l.id]) || 0), 0);
  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const r: any = (await inputApplicationsApi.collect(code.trim(), pending.map((l) => ({ lineId: l.id, quantity: Number(qty[l.id]) || 0 })))).data;
      setDone(`Handed over: ${r.given.map((g: any) => `${g.name} ${g.qty} ${g.unit} (${g.ref})`).join(', ')}. The stock was deducted, the cost was charged to ${found.farmer?.name}, and they were texted. This code cannot be used again.`);
      reset(); onChanged();
    } catch (e) { setError(errMsg(e, 'Could not hand over.')); } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 640 }}>
      {done && <Notice tone="success" onDismiss={() => setDone('')}>{done}</Notice>}
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>When a farmer arrives, ask for the collection code they were texted. Enter it here to check who they are and what they may collect, then hand over the fertiliser and confirm.</p>
      <div style={card}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Collection code</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input className="input-field" style={{ fontSize: 20, letterSpacing: 3, textTransform: 'uppercase', fontWeight: 700 }} inputMode="numeric" maxLength={6} placeholder="000000" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setFound(null); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) void check(); }} autoFocus />
          <button type="button" className="btn-primary" disabled={busy || code.length !== 6} onClick={() => void check()}>{busy && !found ? 'Checking…' : 'Check code'}</button>
        </div>
        {error && <div role="alert" style={{ marginTop: 12, color: 'var(--red-400, #f87171)', fontWeight: 600, fontSize: 13 }}>{error}</div>}
      </div>
      {found && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 17, fontWeight: 700 }}>{found.farmer?.name}</div><div className="muted" style={{ fontSize: 12.5 }}>Member {found.farmer?.memberNumber}{found.farmer?.phone ? ` · ${found.farmer.phone}` : ''}</div></div>
            <div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: 12 }}>{found.reference}</div><div style={{ fontWeight: 600 }}>{found.warehouse?.name}</div></div>
          </div>
          <div className="muted" style={{ fontSize: 13, margin: '10px 0' }}>Hectares: {found.farmIds.map(farmId).join(', ') || '—'}</div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
            {found.lines.map((l: any) => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div><strong>{l.item}</strong><div className="muted" style={{ fontSize: 12 }}>{l.given ? 'Already handed over' : `Approved ${l.quantity} ${l.unit} · ${l.inStock} ${l.unit} in this warehouse`}</div></div>
                {!l.given && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="number" min={0} max={l.quantity} step="any" className="input-field" style={{ width: 90, textAlign: 'right' }} value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} /><span className="muted">{l.unit}</span></div>}
              </div>))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Hand over only what you count out. You can give less than approved, never more.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={reset} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy || over || total <= 0} onClick={() => void confirm()}>{busy ? 'Recording…' : 'Confirm: fertiliser handed over'}</button>
          </div>
          {over && <div style={{ color: 'var(--red-400, #f87171)', fontSize: 13, marginTop: 8 }}>This warehouse does not hold that much.</div>}
        </div>
      )}
    </div>
  );
}
