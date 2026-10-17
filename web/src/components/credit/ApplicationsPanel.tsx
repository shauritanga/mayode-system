'use client';
import { useEffect, useMemo, useState } from 'react';
import { creditApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { downloadCsv } from '@/lib/download';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { STATUS, day, purposeLabel, tzs, type Application } from '@/lib/credit';
import ApplicationModal from './ApplicationModal';
import NewApplicationModal from './NewApplicationModal';

interface Summary { counts: Record<string, number>; requested: number; approved: number; disbursed: number; lenderLinked: boolean }

/** Loan applications for whoever is looking: a lender decides, staff and farmers follow and apply. */
export default function ApplicationsPanel({ mode, canApply }: { mode: 'lender' | 'applicant'; canApply: boolean }) {
  const [rows, setRows] = useState<Application[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const load = () =>
    Promise.all([creditApi.applications(), creditApi.summary()])
      .then(([a, s]) => { setRows(a.data ?? []); setSummary(s.data); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load loan applications.')))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!status || r.status === status) && (!q || r.reference.toLowerCase().includes(q) || r.farmerName.toLowerCase().includes(q) || r.farmer.controlNumber.toLowerCase().includes(q)));
  }, [rows, status, search]);

  const c = summary?.counts ?? {};
  return (
    <div>
      {mode === 'lender' && summary && !summary.lenderLinked && (
        <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>
          Your login is not linked to a lender yet, so no applications can be shown. Ask Mayode to set your lender’s contact phone or email to match this account.
        </div>
      )}
      {summary && (
        <div className="role-grid" style={{ marginBottom: 14 }}>
          <MetricTile label="Awaiting decision" value={(c.SUBMITTED ?? 0) + (c.UNDER_REVIEW ?? 0)} hint={`${c.UNDER_REVIEW ?? 0} under review`} tone="gold" />
          <MetricTile label="Approved, not yet released" value={c.APPROVED ?? 0} tone="blue" />
          <MetricTile label="Disbursed" value={c.DISBURSED ?? 0} hint={tzs(summary.disbursed)} tone="green" />
          <MetricTile label="Requested in total" value={tzs(summary.requested)} hint={`${tzs(summary.approved)} approved`} tone="purple" />
          <MetricTile label="Rejected" value={c.REJECTED ?? 0} tone="red" />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="input-field" type="search" placeholder="Search reference, farmer…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
          <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 190 }} aria-label="Status">
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn-secondary" disabled={!shown.length} onClick={() => downloadCsv('loan-applications.csv', shown.map((r) => ({
            Reference: r.reference, Farmer: r.farmerName, ControlNumber: r.farmer.controlNumber, Lender: r.lender.name, Purpose: purposeLabel(r.purpose),
            Requested: r.amountRequested, Approved: r.approvedAmount ?? '', TermMonths: r.termMonths, Score: r.creditScore ?? '', Status: r.status, Applied: day(r.createdAt) })))}>Export CSV</button>
        </div>
        {canApply && <button className="btn-primary" onClick={() => setApplying(true)}>+ {mode === 'applicant' ? 'Apply for a loan' : 'New application'}</button>}
      </div>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="table-panel">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
          : shown.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No loan applications yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Farmer</th><th>Lender</th><th>Purpose</th><th>Requested</th><th>Term</th><th>Score</th><th>Applied</th><th>Status</th><th /></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const [cls, label] = STATUS[r.status] ?? ['badge-gray', r.status];
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.reference}</td>
                      <td>{r.farmerName}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.farmer.controlNumber}</div></td>
                      <td>{r.lender.name}</td><td>{purposeLabel(r.purpose)}</td>
                      <td>{tzs(r.amountRequested)}{r.approvedAmount != null && <div style={{ fontSize: 11, color: 'var(--green-500)' }}>approved {tzs(r.approvedAmount)}</div>}</td>
                      <td>{r.termMonths} mo</td><td>{r.creditScore ?? '—'}</td><td>{day(r.createdAt)}</td>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td style={{ textAlign: 'right' }}><button className="btn-secondary" onClick={() => setOpenId(r.id)}>Open</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {openId && <ApplicationModal id={openId} mode={mode} onClose={() => setOpenId(null)} onChanged={load} />}
      {applying && <NewApplicationModal forStaff={mode !== 'applicant'} onClose={() => setApplying(false)} onCreated={() => { setApplying(false); load(); }} />}
    </div>
  );
}
