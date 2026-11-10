'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { complianceReportApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Empty, LoadError, PageHeader, StatCard, TableSkeleton, fmtDate, useApi, useCan } from '@/screens/dashboard/irrigation/ui';

const TONE: Record<string, [string, string]> = { OK: ['badge-green', 'In order'], ATTENTION: ['badge-gold', 'Look into it'], MISSING: ['badge-red', 'Missing'] };

/** The Manager's checklist: what the cooperative's records show against its governance duties. */
export default function ComplianceReportPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const { data, loading, error, reload } = useApi<any>(() => complianceReportApi.get(), []);
  if (!can('governance', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the governance permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Compliance Checklist" /><Empty title="The checklist belongs to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  const items: any[] = data?.items ?? [];
  return (
    <div>
      <PageHeader title="Compliance Checklist" subtitle="A reading of this cooperative’s own records against the duties it carries. It shows what to look into; it is not legal advice." actions={<button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>} />
      <LoadError message={error} onRetry={reload} />
      {data && <div className="metric-grid" style={{ marginBottom: 14 }}><StatCard label="In order" value={data.summary.ok} tone="good" /><StatCard label="Look into it" value={data.summary.attention} tone={data.summary.attention ? 'warn' : undefined} /><StatCard label="Missing" value={data.summary.missing} tone={data.summary.missing ? 'warn' : 'good'} /></div>}
      {loading && !data ? <TableSkeleton cols={3} /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Area</th><th>Duty</th><th>Status</th><th>What the records show</th></tr></thead><tbody>
          {items.map((i) => <tr key={i.key}><td>{i.area}</td><td>{i.label}</td><td><span className={`badge ${TONE[i.status][0]}`}>{TONE[i.status][1]}</span></td><td style={{ fontSize: 13 }}>{i.detail}</td></tr>)}
        </tbody></table></div>
      )}
      {data && <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Generated {fmtDate(data.generatedAt)}</p>}
    </div>
  );
}
