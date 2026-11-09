'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { amcosRentalsApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import {
  Empty, Field, Filters, LoadError, Notice, PageHeader, StatCard, TableSkeleton, errMsg, fmtDate, useApi, useCan, useDebounced,
} from '@/screens/dashboard/irrigation/ui';

const STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Active', tone: 'badge-green' },
  ENDED: { label: 'Ended', tone: 'badge-gray' },
  TERMINATED: { label: 'Cancelled', tone: 'badge-red' },
};

const place = (r: any) => (r.hectareCode ? farmId(r.hectareCode) : r.farmCode);
const period = (r: any) => `${r.seasonCount ? `${r.seasonCount} season${r.seasonCount === 1 ? '' : 's'} · ` : ''}${r.durationMonths} months`;

function Detail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: (text: string) => void }) {
  const can = useCan();
  const { data: r, loading, error, reload } = useApi<any>(() => amcosRentalsApi.get(id), [id]);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [dispute, setDispute] = useState({ description: '', raisedBy: 'AMCOS' });
  const [msg, setMsg] = useState('');

  const saveNote = async () => {
    setSaving(true); setMsg('');
    try { await amcosRentalsApi.saveWitnessNote(id, note ?? ''); setNote(null); reload(); onChanged('The cooperative’s note was saved.'); }
    catch (e) { setMsg(errMsg(e, 'Could not save the note.')); } finally { setSaving(false); }
  };
  const raise = async () => {
    if (!dispute.description.trim()) { setMsg('Describe the disagreement.'); return; }
    setSaving(true); setMsg('');
    try { await amcosRentalsApi.raiseDispute(id, dispute); setDisputing(false); setDispute({ description: '', raisedBy: 'AMCOS' }); reload(); onChanged('The dispute was recorded.'); }
    catch (e) { setMsg(errMsg(e, 'Could not record the dispute.')); } finally { setSaving(false); }
  };

  const st = r ? (STATUS[r.status] ?? STATUS.ACTIVE) : null;
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="muted" style={{ fontSize: 12.5 }}>{label}</div><div style={{ fontSize: 13.5 }}>{value || '—'}</div>
    </div>
  );
  return (
    <Modal title={r ? `Rental of ${place(r)}` : 'Rental'} subtitle="The cooperative’s own record of this arrangement. It does not show money." onClose={onClose} width="640px"
      footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <LoadError message={error} onRetry={reload} />
      {loading && !r ? <p className="muted">Loading…</p> : r && (
        <div>
          {msg && <Notice tone="error" onDismiss={() => setMsg('')}>{msg}</Notice>}
          {row('Status', <span className={`badge ${st!.tone}`}>{st!.label}</span>)}
          {row('Hectare', r.hectareId ? <Link href={`/dashboard/irrigation/structure/hectares/${r.hectareId}`}>{farmId(r.hectareCode)}</Link> : <span className="muted">Not linked to a hectare</span>)}
          {row('Farm', r.farmCode)}
          {row('Owner (landlord)', r.ownerName)}
          {row('Tenant', r.tenantName)}
          {row('Starts', fmtDate(r.startDate))}
          {row('Ends', fmtDate(r.endDate))}
          {row('Agreed period', period(r))}
          {row('Reason for renting out', r.reason ?? <span className="muted">Not stated</span>)}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Terms and conditions</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.5 }}>{r.terms}</div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Cooperative’s note (witness)</div>
            {note === null ? (
              <>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{r.witnessNote ?? <span className="muted">No note yet.</span>}{r.witnessNoteAt && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Saved {fmtDate(r.witnessNoteAt)}</div>}</div>
                {can('farm_leases', 'EDIT') && <button type="button" className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setNote(r.witnessNote ?? '')}>{r.witnessNote ? 'Edit note' : 'Add note'}</button>}
              </>
            ) : (
              <>
                <textarea className="input-field" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the cooperative saw, confirmed or was told about this arrangement" />
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-primary" disabled={saving || !note.trim()} onClick={saveNote}>{saving ? 'Saving…' : 'Save note'}</button>
                  <button type="button" className="btn-secondary" disabled={saving} onClick={() => setNote(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 600 }}>Disagreements</div>
              {can('farm_leases', 'CREATE') && !disputing && <button type="button" className="btn-secondary" onClick={() => setDisputing(true)}>Record a dispute</button>}
            </div>
            {disputing && (
              <div style={{ marginBottom: 10 }}>
                <Field label="Raised by"><select className="input-field" value={dispute.raisedBy} onChange={(e) => setDispute({ ...dispute, raisedBy: e.target.value })}>
                  <option value="AMCOS">The cooperative</option><option value="OWNER">The owner</option><option value="TENANT">The tenant</option></select></Field>
                <Field label="What is the disagreement?"><textarea className="input-field" rows={3} maxLength={2000} value={dispute.description} onChange={(e) => setDispute({ ...dispute, description: e.target.value })} /></Field>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-primary" disabled={saving} onClick={raise}>{saving ? 'Saving…' : 'Record dispute'}</button>
                  <button type="button" className="btn-secondary" disabled={saving} onClick={() => setDisputing(false)}>Cancel</button>
                </div>
              </div>
            )}
            {!r.disputes?.length ? <div className="muted" style={{ fontSize: 13 }}>None recorded.</div> : r.disputes.map((d: any) => (
              <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13.5 }}>
                <div><span className="badge badge-gray">{String(d.status).replace(/_/g, ' ').toLowerCase()}</span> <span className="muted" style={{ fontSize: 12 }}>{fmtDate(d.createdAt)}</span></div>
                <div style={{ marginTop: 4 }}>{d.description}</div>
                {d.resolution && <div className="muted" style={{ marginTop: 4 }}>Outcome: {d.resolution}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function RentalsPage() {
  const [filters, setFilters] = useState({ q: '', status: '' });
  const q = useDebounced(filters.q.trim(), 300);
  const params = Object.fromEntries(Object.entries({ q, status: filters.status }).filter(([, v]) => v));
  const { data, loading, error, reload } = useApi<any>(() => amcosRentalsApi.list(params), [q, filters.status]);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const s = data?.summary;
  const rows: any[] = data?.data ?? [];
  const filtered = !!(filters.q || filters.status);

  return (
    <div>
      <PageHeader title="M-LAX Rentals" subtitle="Farms of your members rented through M-LAX. The cooperative keeps this record as a witness; it never shows rent or payments." />
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {s && (
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <StatCard label="Rentals" value={s.total} />
          <StatCard label="Active" value={s.active} tone="good" />
          <StatCard label="Ended" value={s.ended} />
          <StatCard label="Cancelled" value={s.terminated} />
          <StatCard label="Open disputes" value={s.openDisputes} tone={s.openDisputes ? 'warn' : 'good'} />
        </div>
      )}
      <section className="table-panel">
        <Filters>
          <Field label="Search"><input className="input-field" placeholder="Owner, tenant, hectare or farm" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></Field>
          <Field label="Status"><select className="input-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option><option value="ACTIVE">Active</option><option value="ENDED">Ended</option><option value="TERMINATED">Cancelled</option></select></Field>
        </Filters>
        {loading && !data ? <TableSkeleton cols={6} /> : !rows.length ? (
          <Empty title={filtered ? 'No rentals match these filters' : 'No rentals yet'} hint={filtered ? undefined : 'When a member’s farm is rented through M-LAX and the rental starts, it appears here automatically.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Hectare / farm</th><th>Owner</th><th>Tenant</th><th>Period</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const st = STATUS[r.status] ?? STATUS.ACTIVE;
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(r.id)}>
                      <td><div style={{ fontWeight: 600 }}>{place(r)}</div>{r.hectareCode && <div className="muted" style={{ fontSize: 11 }}>{r.farmCode}</div>}</td>
                      <td>{r.ownerName}</td>
                      <td>{r.tenantName}</td>
                      <td><div>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</div><div className="muted" style={{ fontSize: 11 }}>{period(r)}</div></td>
                      <td><span className={`badge ${st.tone}`}>{st.label}</span>{r.openDisputes > 0 && <div style={{ fontSize: 11, color: 'var(--red-400, #ef4444)' }}>{r.openDisputes} dispute{r.openDisputes === 1 ? '' : 's'}</div>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><button type="button" className="btn-secondary" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}>View</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={(t) => { setNotice(t); reload(); }} />}
    </div>
  );
}
