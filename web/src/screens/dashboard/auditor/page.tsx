'use client';

import { useEffect, useState } from 'react';
import {
  EmptyState,
  InsightPanel,
  MetricTile,
  money,
} from '@/components/role-dashboards/DashboardPrimitives';
import { reportsApi } from '@/lib/api';

export default function AuditorDashboardPage() {
  const [pack, setPack] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    reportsApi.flocertAuditPack()
      .then((result) => setPack(result.data))
      .catch(() => setError('Unable to load the audit pack for this account.'));
  }, []);

  const gaps = pack?.complianceGaps || {};
  const evidence = pack?.trustEvidence || {};

  return <div className="role-dashboard">
    {error && <EmptyState>{error}</EmptyState>}

    <div className="role-grid">
      <MetricTile label="Open rice task gaps" value={gaps.overdueRiceCalendarTasks ?? '—'} hint="Overdue agronomy/compliance tasks" tone="red" />
      <MetricTile label="Quality gaps" value={gaps.incompleteHarvestQualityChecks ?? '—'} hint="Missing harvest or warehouse checks" tone="gold" />
      <MetricTile label="Consent records" value={evidence.consentRecordCount ?? '—'} hint="Formal consent evidence" />
      <MetricTile label="Questionnaires" value={evidence.questionnaireCount ?? '—'} hint="Official field questionnaire records" tone="blue" />
      <MetricTile label="Premium balance" value={money(pack?.premiumFund?.balance)} hint="Fairtrade premium fund position" tone="purple" />
      <MetricTile label="Net farmer paid" value={money(pack?.payments?.totalNetPaid)} hint="Recorded net payments after deductions" />
    </div>

    <div className="role-two-col">
      <InsightPanel title="Traceability sample" subtitle="Recent sales linked back to contributing farmer batches.">
        {pack?.traceability?.length ? <div className="role-list">
          {pack.traceability.slice(0, 8).map((sale: any) => <div className="role-list-item" key={sale.invoiceNumber}>
            <div>
              <strong>{sale.invoiceNumber}</strong>
              <p>{sale.buyer.name} · {sale.lotNumber} · {Number(sale.quantityKg).toLocaleString()} kg</p>
            </div>
            <span className={`badge ${sale.buyer.isCertified ? 'badge-green' : 'badge-gold'}`}>{sale.buyer.isCertified ? 'Certified buyer' : 'Check buyer'}</span>
          </div>)}
        </div> : <EmptyState>No traceability records in the selected period.</EmptyState>}
      </InsightPanel>

      <InsightPanel title="Recent audit log sample" subtitle="Who changed what, when, and where available.">
        {evidence.recentAuditLogs?.length ? <div className="role-list">
          {evidence.recentAuditLogs.slice(0, 8).map((log: any) => <div className="role-list-item" key={log.id}>
            <div>
              <strong>{log.action}</strong>
              <p>{log.entityType} · {log.entityId}</p>
            </div>
            <small>{new Date(log.createdAt).toLocaleString()}</small>
          </div>)}
        </div> : <EmptyState>No audit logs loaded.</EmptyState>}
      </InsightPanel>
    </div>

    <InsightPanel title="Governance and trust evidence" subtitle="Board, member and system evidence counts.">
      <div className="role-grid">
        <MetricTile label="Meetings" value={pack?.governance?.meetingCount ?? '—'} hint="Recorded meeting minutes" tone="blue" />
        <MetricTile label="Votes" value={pack?.governance?.voteCount ?? '—'} hint="Member governance votes" tone="gold" />
        <MetricTile label="Vote responses" value={pack?.governance?.voteResponseCount ?? '—'} hint="Farmer participation evidence" />
        <MetricTile label="Community projects" value={pack?.governance?.communityProjectCount ?? '—'} hint="Premium/impact project records" tone="purple" />
      </div>
    </InsightPanel>
  </div>;
}
