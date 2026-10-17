'use client';
import { useEffect, useMemo, useState } from 'react';
import { insuranceApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { downloadCsv } from '@/lib/download';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { day, tzs } from '@/lib/credit';
import { APP_STATUS, RISK_BADGE, productLabel, type InsApplication } from '@/lib/insurance';
import InsuranceApplicationModal from './InsuranceApplicationModal';
import NewInsuranceApplicationModal from './NewInsuranceApplicationModal';

/** Insurance applications for whoever is looking: an insurer decides, staff record the premium, farmers apply. */
export default function InsuranceApplicationsPanel({ mode, canApply }: { mode: 'insurer' | 'staff' | 'farmer'; canApply: boolean }) {
  const [rows, setRows] = useState<InsApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const load = () => insuranceApi.applications().then((r) => { setRows(r.data ?? []); setError(''); }).catch((e) => setError(apiErrorMessage(e, 'Could not load insurance applications.'))).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!status || r.status === status) && (!q || r.reference.toLowerCase().includes(q) || r.farmerName.toLowerCase().includes(q) || r.farmer.controlNumber.toLowerCase().includes(q)));
  }, [rows, status, search]);
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <div>
      <div className="role-grid" style={{ marginBottom: 14 }}>
        <MetricTile label="Awaiting the insurer" value={count('SUBMITTED') + count('UNDER_REVIEW')} tone="gold" />
        <MetricTile label="Offer made, premium due" value={count('APPROVED')} tone="blue" />
        <MetricTile label="Cover started" value={count('ACTIVATED')} tone="green" />
        <MetricTile label="Rejected" value={count('REJECTED')} tone="red" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="input-field" type="search" placeholder="Search reference, farmer…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
          <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 190 }} aria-label="Status">
            <option value="">All statuses</option>{Object.entries(APP_STATUS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn-secondary" disabled={!shown.length} onClick={() => downloadCsv('insurance-applications.csv', shown.map((r) => ({
            Reference: r.reference, Farmer: r.farmerName, ControlNumber: r.farmer.controlNumber, Insurer: r.provider.name, Product: productLabel(r.productType),
            Hectares: r.insuredAreaHectares, Risk: r.riskLevel, SumInsured: r.sumInsured ?? '', Premium: r.premiumAmount ?? '', Status: r.status, Applied: day(r.createdAt) })))}>Export CSV</button>
        </div>
        {canApply && <button className="btn-primary" onClick={() => setApplying(true)}>+ {mode === 'farmer' ? 'Apply for insurance' : 'New application'}</button>}
      </div>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="table-panel">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div>
          : shown.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No insurance applications yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Farmer</th><th>Insurer</th><th>Product</th><th>Area</th><th>Risk</th><th>Offer</th><th>Applied</th><th>Status</th><th /></tr></thead>
              <tbody>{shown.map((r) => {
                const [c, l] = APP_STATUS[r.status] ?? ['badge-gray', r.status];
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.reference}</td>
                    <td>{r.farmerName}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{r.farmer.controlNumber}</div></td>
                    <td>{r.provider.name}</td><td>{productLabel(r.productType)}</td><td>{r.insuredAreaHectares} ha</td>
                    <td><span className={`badge ${RISK_BADGE[r.riskLevel]}`}>{r.riskLevel.toLowerCase()}</span></td>
                    <td>{r.sumInsured != null ? <>{tzs(r.sumInsured)}<div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>premium {tzs(r.premiumAmount)}</div></> : '—'}</td>
                    <td>{day(r.createdAt)}</td><td><span className={`badge ${c}`}>{l}</span></td>
                    <td style={{ textAlign: 'right' }}><button className="btn-secondary" onClick={() => setOpenId(r.id)}>Open</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
      {openId && <InsuranceApplicationModal id={openId} mode={mode} onClose={() => setOpenId(null)} onChanged={load} />}
      {applying && <NewInsuranceApplicationModal forStaff={mode !== 'farmer'} onClose={() => setApplying(false)} onCreated={() => { setApplying(false); load(); }} />}
    </div>
  );
}
