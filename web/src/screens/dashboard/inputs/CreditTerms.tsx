'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { creditInterestApi } from '@/lib/api';
import { ConfirmDialog, Field, LoadError, Notice, TableSkeleton, errMsg, fmtDate, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const card: React.CSSProperties = { background: 'var(--bg-elevated, rgba(127,127,127,.08))', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted, #94a3b8)', padding: '8px 14px', whiteSpace: 'nowrap' };
const STATE: Record<string, { label: string; color: string }> = { CURRENT: { label: 'In use now', color: 'var(--green-400, #4ade80)' }, UPCOMING: { label: 'Coming', color: '#fbbf24' }, PAST: { label: 'Ended', color: 'var(--text-muted, #94a3b8)' } };

function RateModal({ rate, period, seasons, onClose, onDone }: { rate: any | null; period: string; seasons: any[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ label: rate?.label ?? '', ratePercent: rate ? String(rate.ratePercent) : '', validFrom: rate?.validFrom ?? '', validTo: rate?.validTo ?? '', seasonId: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const pick = (id: string) => { const s = seasons.find((x) => x.id === id); setF((x) => ({ ...x, seasonId: id, ...(s ? { label: s.name, validFrom: s.startDate, validTo: s.endDate } : {}) })); };
  const seasonal = period === 'SEASON';
  const ok = f.label.trim().length >= 2 && Number(f.ratePercent) > 0 && !!f.validFrom && (!seasonal || !!f.validTo);
  const save = async () => {
    setBusy(true); setError('');
    const body = { label: f.label.trim(), ratePercent: Number(f.ratePercent), validFrom: f.validFrom, validTo: f.validTo || undefined, seasonId: f.seasonId || undefined };
    try { if (rate) await creditInterestApi.updateRate(rate.id, body); else await creditInterestApi.addRate(body); onDone('Rate saved.'); onClose(); }
    catch (e) { setError(errMsg(e, 'Could not save.')); setBusy(false); }
  };
  return (
    <Modal title={rate ? 'Change interest rate' : 'Add an interest rate'} subtitle={seasonal ? 'The rate charged once for a season.' : 'The rate charged each month, for the dates you choose.'} width="520px" onClose={() => !busy && onClose()}
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn-primary" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save rate'}</button></>}>
      {error && <div role="alert" style={{ marginBottom: 12, background: 'rgba(248,113,113,.12)', border: '1px solid var(--red-400, #f87171)', color: 'var(--red-400, #f87171)', borderRadius: 9, padding: '9px 11px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 14 }}>
        {seasons.length > 0 && <Field label="Use a farming season" hint="Optional. Fills in the name and dates for you."><select className="input-field" value={f.seasonId} onChange={(e) => pick(e.target.value)}><option value="">Choose a season…</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name} ({fmtDate(s.startDate)} to {fmtDate(s.endDate)})</option>)}</select></Field>}
        <Field label="Name *" hint="For example Masika 2026 or Jan to Mar"><input className="input-field" maxLength={80} value={f.label} onChange={(e) => set('label', e.target.value)} /></Field>
        <Field label={`Interest rate (% ${seasonal ? 'per season' : 'per month'}) *`}><input type="number" min={0} max={100} step="0.01" className="input-field" value={f.ratePercent} onChange={(e) => set('ratePercent', e.target.value)} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Applies from *"><input type="date" className="input-field" value={f.validFrom} onChange={(e) => set('validFrom', e.target.value)} /></Field>
          <Field label={seasonal ? 'Season ends on *' : 'Applies until'} hint={seasonal ? undefined : 'Leave empty if it has no end'}><input type="date" className="input-field" value={f.validTo} onChange={(e) => set('validTo', e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

/** Where each AMCOS sets its own terms for inputs given on credit: whether interest is charged, per month or per season, and the rate for each. */
export function CreditTerms() {
  const can = useCan(); const canEdit = can('amcos_settings', 'EDIT');
  const [tick, setTick] = useState(0);
  const { data, loading, error, reload } = useApi<any>(() => creditInterestApi.terms(), [tick]);
  const [form, setForm] = useState<any>(null); const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  const [editing, setEditing] = useState<any | 'new' | null>(null); const [removing, setRemoving] = useState<any>(null);
  useEffect(() => { if (data?.terms) setForm(data.terms); }, [data]);
  const refresh = (m?: string) => { if (m) setMsg(m); setTick((n) => n + 1); };
  const dirty = !!form && !!data && JSON.stringify(form) !== JSON.stringify(data.terms);
  const save = async () => {
    setSaving(true); setErr('');
    try { await creditInterestApi.saveTerms(form); refresh('Terms saved.'); } catch (e) { setErr(errMsg(e, 'Could not save.')); } finally { setSaving(false); }
  };
  const run = async () => { try { const r: any = (await creditInterestApi.accrue()).data; refresh(r.added ? `${r.added} interest charge(s) added, TZS ${Math.round(r.amount).toLocaleString('en-US')} in all.` : 'Nothing new to add. Interest is added automatically every morning.'); } catch (e) { setErr(errMsg(e)); } };
  if (loading && !data) return <TableSkeleton cols={4} />;
  const seasonal = form?.period === 'SEASON';
  const radio = (active: boolean): React.CSSProperties => ({ flex: 1, minWidth: 200, border: `1px solid ${active ? 'var(--accent, #34d399)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-dim, rgba(52,211,153,.12))' : 'transparent', borderRadius: 10, padding: '10px 12px', cursor: canEdit ? 'pointer' : 'default', textAlign: 'left', color: 'inherit', font: 'inherit' });
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error || err} onRetry={reload} />
      {!canEdit && <p className="muted" style={{ fontSize: 13 }}>You can see these terms. Only someone allowed to change AMCOS settings can edit them.</p>}
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Set whether your AMCOS charges interest (riba) on inputs given on credit, and how much. Nothing is charged until you turn it on and add a rate. Every farmer sees the terms when they apply, and each payment settles both the inputs and the interest.</p>

      {form && (
        <div style={card}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 700, cursor: canEdit ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={form.enabled} disabled={!canEdit} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Charge interest on inputs given on credit
          </label>
          {form.enabled && (
            <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>How is interest counted?</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" disabled={!canEdit} style={radio(!seasonal)} onClick={() => setForm({ ...form, period: 'MONTHLY' })}><strong>Every month</strong><div className="muted" style={{ fontSize: 12 }}>Interest is added each month the credit is not paid.</div></button>
                  <button type="button" disabled={!canEdit} style={radio(seasonal)} onClick={() => setForm({ ...form, period: 'SEASON' })}><strong>Once per season</strong><div className="muted" style={{ fontSize: 12 }}>Interest is added when a season ends and the credit is not paid.</div></button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <Field label="Days before interest starts" hint="0 means it starts counting from the day inputs are given"><input type="number" min={0} max={365} className="input-field" disabled={!canEdit} value={form.graceDays} onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) || 0 })} /></Field>
                <Field label="When a farmer pays, settle first" hint="What the payment clears first"><select className="input-field" disabled={!canEdit} value={form.paymentOrder} onChange={(e) => setForm({ ...form, paymentOrder: e.target.value })}><option value="INTEREST_FIRST">The interest, then the inputs</option><option value="PRINCIPAL_FIRST">The inputs, then the interest</option></select></Field>
              </div>
            </div>
          )}
          {canEdit && <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}><button type="button" className="btn-primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save terms'}</button>{dirty && <span className="muted" style={{ fontSize: 12 }}>Unsaved changes</span>}</div>}
        </div>
      )}

      {form?.enabled && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <div><strong>Interest rates</strong><div className="muted" style={{ fontSize: 12.5 }}>{seasonal ? 'One rate for each season, with the date the season ends.' : 'The rate for each month. You can set a different rate for different months.'}</div></div>
            {canEdit && <button type="button" className="btn-primary" onClick={() => setEditing('new')}>+ Add a rate</button>}
          </div>
          {!data.rates.length ? <p className="muted" style={{ fontSize: 13 }}>No rate yet. No interest is charged until you add one.</p> : (
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border-subtle)' }}><th style={th}>Name</th><th style={th}>Rate</th><th style={th}>From</th><th style={th}>Until</th><th style={th}>Status</th><th style={th} /></tr></thead>
              <tbody>{data.rates.map((r: any) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.label}</td>
                  <td style={{ padding: '10px 14px' }}>{r.ratePercent}% {seasonal ? 'per season' : 'per month'}</td>
                  <td style={{ padding: '10px 14px' }}>{fmtDate(r.validFrom)}</td>
                  <td style={{ padding: '10px 14px' }}>{r.validTo ? fmtDate(r.validTo) : 'No end'}</td>
                  <td style={{ padding: '10px 14px', color: STATE[r.state].color, fontWeight: 600, fontSize: 12.5 }}>{STATE[r.state].label}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>{canEdit && <><button type="button" className="btn-secondary" onClick={() => setEditing(r)}>Change</button> <button type="button" className="btn-secondary" onClick={() => setRemoving(r)}>Remove</button></>}</td>
                </tr>))}</tbody>
            </table></div>)}
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Interest is worked out on the inputs still owed (not on earlier interest). Removing or changing a rate does not change interest already charged.</p>
        </div>
      )}

      {data?.terms.enabled && canEdit && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button type="button" className="btn-secondary" onClick={() => void run()}>Add due interest now</button><span className="muted" style={{ fontSize: 12.5 }}>Interest is also added automatically every morning.</span></div>}
      {data && <p style={{ fontSize: 13, marginTop: 16 }}><span className="muted">What farmers are told: </span>{data.summary}</p>}

      {editing && <RateModal rate={editing === 'new' ? null : editing} period={form?.period ?? 'MONTHLY'} seasons={data?.seasons ?? []} onClose={() => setEditing(null)} onDone={refresh} />}
      {removing && <ConfirmDialog title="Remove this rate?" body={`“${removing.label}” will no longer apply. Interest already charged stays as it is.`} confirmLabel="Remove" danger onConfirm={async () => { await creditInterestApi.removeRate(removing.id); setRemoving(null); refresh('Rate removed.'); }} onClose={() => setRemoving(null)} />}
    </div>
  );
}
