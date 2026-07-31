'use client';

import { useEffect, useState } from 'react';
import { reportsApi } from '@/lib/api';

type Compliance = {
  averageFarmerIncome: number; premiumFundBalance: number; fairtradePremiumEarned: number;
  totalFarmers: number; totalHectares: number; totalRevenue: number; membershipGrowthPercent: number; newMembers: number;
};

type AuditPack = {
  complianceGaps: {
    overdueRiceCalendarTasks: number;
    incompleteHarvestQualityChecks: number;
    uncertifiedBuyerSales: number;
    unverifiedSourceFarms: number;
  };
  trustEvidence: {
    consentRecordCount: number;
    questionnaireCount: number;
    auditLogSampleCount: number;
    partnerApiRequestCount: number;
    recentAuditLogs: Array<{ id: string; action: string; entityType: string; entityId: string; createdAt: string }>;
  };
  governance: {
    meetingCount: number;
    voteCount: number;
    voteResponseCount: number;
    communityProjectCount: number;
  };
  traceability: Array<{
    invoiceNumber: string;
    lotNumber: string;
    quantityKg: number;
    buyer: { name: string; isCertified: boolean };
    sourceInventoryCount: number;
    sourceFarmers: Array<{ controlNumber: string; farmer: string; quantityKg: number }>;
  }>;
};

const money = (value: number) => `TZS ${Math.round(value || 0).toLocaleString()}`;

export default function CompliancePage() {
  const [summary, setSummary] = useState<Compliance | null>(null);
  const [auditPack, setAuditPack] = useState<AuditPack | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      reportsApi.complianceSummary(),
      reportsApi.flocertAuditPack(),
    ]).then(([summaryResult, auditResult]) => {
      setSummary(summaryResult.data);
      setAuditPack(auditResult.data);
    }).catch(() => setError('Unable to load compliance reporting data.'));
  }, []);
  const cards = summary ? [
    ['Average farmer income', money(summary.averageFarmerIncome), 'Revenue ÷ registered farmers'],
    ['Fairtrade premium fund', money(summary.premiumFundBalance), 'Income less recorded fund expenditure'],
    ['Premium earned', money(summary.fairtradePremiumEarned), 'From certified cooperative sales'],
    ['Registered farmers', summary.totalFarmers.toLocaleString(), 'Membership baseline'],
    ['Membership growth', `${summary.membershipGrowthPercent >= 0 ? '+' : ''}${summary.membershipGrowthPercent.toFixed(1)}%`, `${summary.newMembers} new members in the last 30 days`],
    ['Farm area', `${summary.totalHectares.toLocaleString()} ha`, 'Production coverage'],
    ['Cooperative revenue', money(summary.totalRevenue), 'Recorded revenue allocation'],
  ] : [];
  const gaps = auditPack?.complianceGaps;
  const evidence = auditPack?.trustEvidence;
  return <div className="page-shell">
    <div className="page-heading">
      <div>
        <p className="page-kicker">Audit evidence</p>
        <h1 className="page-title">Fairtrade Compliance</h1>
        <p className="page-subtitle">Live income, premium-fund, traceability, governance and trust evidence for FLOCERT-style review.</p>
      </div>
    </div>
    {error && <p style={{ color: 'var(--red-400)' }}>{error}</p>}
    {!summary && !error && <p style={{ color: 'var(--neutral-500)' }}>Loading compliance indicators…</p>}
    <div className="metric-grid">
      {cards.map(([label, value, sub]) => <div key={label} className="stat-card" style={{ padding: 22 }}>
        <div style={{ color: 'var(--neutral-500)', fontSize: 13 }}>{label}</div>
        <div style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 24, margin: '8px 0' }}>{value}</div>
        <div style={{ color: 'var(--accent)', fontSize: 12 }}>{sub}</div>
      </div>)}
    </div>
    {auditPack && <div style={{ display: 'grid', gap: 18, marginTop: 24 }}>
      <section className="action-panel">
        <div className="panel-header">
          <div>
            <p className="page-kicker">Open gaps</p>
            <h2 className="panel-title">Compliance attention areas</h2>
            <p className="panel-copy">These are not hidden behind totals; they are the first issues an auditor or secretary should resolve.</p>
          </div>
        </div>
        <div className="metric-grid">
          {[
            ['Overdue rice tasks', gaps?.overdueRiceCalendarTasks ?? 0, 'Mbalari task reminders past due'],
            ['Incomplete quality checks', gaps?.incompleteHarvestQualityChecks ?? 0, 'Missing harvest/drying/bagging/warehouse measurements'],
            ['Uncertified buyer sales', gaps?.uncertifiedBuyerSales ?? 0, 'Sales where buyer certification is false'],
            ['Unverified source farms', gaps?.unverifiedSourceFarms ?? 0, 'Inventory records tied to unverified farms'],
          ].map(([label, value, sub]) => <div key={label} className="stat-card" style={{ padding: 18 }}>
            <div className="muted" style={{ fontSize: 13 }}>{label}</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800, marginTop: 6 }}>{Number(value).toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>
          </div>)}
        </div>
      </section>

      <section className="action-panel">
        <div className="panel-header">
          <div>
            <p className="page-kicker">Trust records</p>
            <h2 className="panel-title">Consent, questionnaire and audit evidence</h2>
          </div>
        </div>
        <div className="metric-grid">
          {[
            ['Consent records', evidence?.consentRecordCount ?? 0],
            ['Questionnaires', evidence?.questionnaireCount ?? 0],
            ['Partner API calls', evidence?.partnerApiRequestCount ?? 0],
            ['Recent audit logs', evidence?.auditLogSampleCount ?? 0],
            ['Meetings', auditPack.governance.meetingCount],
            ['Votes', auditPack.governance.voteCount],
            ['Vote responses', auditPack.governance.voteResponseCount],
            ['Projects', auditPack.governance.communityProjectCount],
          ].map(([label, value]) => <div key={label} className="stat-card" style={{ padding: 16 }}>
            <div className="muted" style={{ fontSize: 12 }}>{label}</div>
            <strong style={{ fontSize: 20 }}>{Number(value).toLocaleString()}</strong>
          </div>)}
        </div>
      </section>

      <section className="table-panel">
        <div className="section-toolbar">
          <div>
            <p className="page-kicker">Traceability sample</p>
            <h2 className="panel-title">Recent sales back to source farmers</h2>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Invoice</th><th>Buyer</th><th>Lot</th><th>Quantity</th><th>Sources</th></tr></thead>
            <tbody>{auditPack.traceability.slice(0, 10).map((sale) => <tr key={sale.invoiceNumber}>
              <td>{sale.invoiceNumber}</td>
              <td>{sale.buyer.name} {sale.buyer.isCertified ? '✓' : '⚠'}</td>
              <td>{sale.lotNumber}</td>
              <td>{Number(sale.quantityKg).toLocaleString()} kg</td>
              <td>{sale.sourceFarmers.map((farmer) => `${farmer.controlNumber} ${farmer.quantityKg.toLocaleString()}kg`).join(', ') || `${sale.sourceInventoryCount} inventory records`}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="table-panel">
        <div className="section-toolbar">
          <div>
            <p className="page-kicker">System audit trail</p>
            <h2 className="panel-title">Recent mutating actions</h2>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Action</th><th>Entity</th><th>Entity ID</th><th>Time</th></tr></thead>
            <tbody>{evidence?.recentAuditLogs.slice(0, 10).map((log) => <tr key={log.id}>
              <td>{log.action}</td>
              <td>{log.entityType}</td>
              <td>{log.entityId}</td>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>}
    <p className="muted" style={{ fontSize: 13, marginTop: 28 }}>CSV/XLSX reports remain available from tabular report endpoints using <code>?format=csv</code> or <code>?format=xlsx</code>. The FLOCERT audit pack is structured JSON because it contains nested traceability evidence.</p>
  </div>;
}
