'use client';
import { useEffect, useMemo, useState } from 'react';
import { creditApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { downloadCsv } from '@/lib/download';
import Modal from '@/components/Modal';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { INSTALMENT, day, purposeLabel, tzs } from '@/lib/credit';

interface LoanRow {
  id: string; reference: string | null; farmer: string; controlNumber: string; lender: string; purpose: string | null;
  original: number; outstanding: number; repaidPct: number; issued: string; active: boolean; hasSchedule: boolean;
  overdueCount: number; overdueAmount: number; nextDue: { dueDate: string; amount: number } | null;
}
interface Data { summary: { loans: number; active: number; lent: number; outstanding: number; overdueAmount: number; overdueLoans: number }; rows: LoanRow[] }
interface Sched { original: number; outstanding: number; rows: { number: number; dueDate: string; amount: number; paidAmount: number; balance: number; status: string }[]; overdueAmount: number }

/** Loans on the books: balance, repaid share, next instalment and what is overdue. */
export default function LoansPortfolio({ showFarmer = true }: { showFarmer?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sched, setSched] = useState<{ loan: LoanRow; data: Sched } | null>(null);

  useEffect(() => { creditApi.loans().then((r) => setData(r.data)).catch((e) => setError(apiErrorMessage(e, 'Could not load loans.'))); }, []);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => (!filter || (filter === 'overdue' ? r.overdueCount > 0 : filter === 'active' ? r.active : !r.active)) && (!q || r.farmer.toLowerCase().includes(q) || r.lender.toLowerCase().includes(q) || (r.reference ?? '').toLowerCase().includes(q)));
  }, [data, filter, search]);

  const open = async (loan: LoanRow) => {
    try { const r = await creditApi.schedule(loan.id); setSched({ loan, data: r.data }); }
    catch (e) { setError(apiErrorMessage(e, 'Could not load the repayment schedule.')); }
  };

  if (error && !data) return <div className="alert-box alert-danger">{error}</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>;
  const s = data.summary;
  return (
    <div>
      <div className="role-grid" style={{ marginBottom: 14 }}>
        <MetricTile label="Loans" value={s.loans} hint={`${s.active} active`} tone="blue" />
        <MetricTile label="Repayable in total" value={tzs(s.lent)} tone="green" />
        <MetricTile label="Outstanding balance" value={tzs(s.outstanding)} tone="gold" />
        <MetricTile label="Overdue" value={tzs(s.overdueAmount)} hint={`${s.overdueLoans} loan${s.overdueLoans === 1 ? '' : 's'}`} tone={s.overdueAmount ? 'red' : 'green'} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {showFarmer && <input className="input-field" type="search" placeholder="Search farmer, lender, reference…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />}
        <select className="input-field" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 170 }} aria-label="Filter">
          <option value="">All loans</option><option value="active">Active</option><option value="overdue">Overdue</option><option value="settled">Settled</option>
        </select>
        <button className="btn-secondary" disabled={!rows.length} onClick={() => downloadCsv('loans.csv', rows.map((r) => ({
          Reference: r.reference ?? '', Farmer: r.farmer, ControlNumber: r.controlNumber, Lender: r.lender, Repayable: r.original, Outstanding: r.outstanding,
          RepaidPct: r.repaidPct, Overdue: r.overdueAmount, NextDue: r.nextDue ? day(r.nextDue.dueDate) : '', Issued: day(r.issued) })))}>Export CSV</button>
      </div>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="table-panel">
        {rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No loans to show.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Loan</th>{showFarmer && <th>Farmer</th>}<th>Lender</th><th>Repayable</th><th>Outstanding</th><th>Repaid</th><th>Next instalment</th><th>Overdue</th><th /></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.reference ?? 'Recorded loan'}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.purpose ? purposeLabel(r.purpose) : day(r.issued)}</div></td>
                  {showFarmer && <td>{r.farmer}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.controlNumber}</div></td>}
                  <td>{r.lender}</td><td>{tzs(r.original)}</td><td style={{ fontWeight: 600 }}>{tzs(r.outstanding)}</td>
                  <td style={{ minWidth: 90 }}><div style={{ height: 6, borderRadius: 9999, background: 'var(--border)' }}><div style={{ width: `${r.repaidPct}%`, height: '100%', borderRadius: 9999, background: 'var(--green-500)' }} /></div><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.repaidPct}%</div></td>
                  <td>{r.nextDue ? <>{day(r.nextDue.dueDate)}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{tzs(r.nextDue.amount)}</div></> : r.active && !r.hasSchedule ? <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>No schedule</span> : '—'}</td>
                  <td>{r.overdueCount ? <span className="badge badge-red">{tzs(r.overdueAmount)}</span> : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.hasSchedule && <button className="btn-secondary" onClick={() => open(r)}>Schedule</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {sched && (
        <Modal title={sched.loan.reference ?? 'Repayment schedule'} subtitle={`${sched.loan.lender} · outstanding ${tzs(sched.data.outstanding)} of ${tzs(sched.data.original)}`} onClose={() => setSched(null)} footer={<button className="btn-secondary" onClick={() => setSched(null)}>Close</button>}>
          <table className="data-table"><thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>{sched.data.rows.map((r) => { const [c, l] = INSTALMENT[r.status]; return <tr key={r.number}><td>{r.number}</td><td>{day(r.dueDate)}</td><td>{tzs(r.amount)}</td><td>{tzs(r.paidAmount)}</td><td>{tzs(r.balance)}</td><td><span className={`badge ${c}`}>{l}</span></td></tr>; })}</tbody></table>
        </Modal>
      )}
    </div>
  );
}
