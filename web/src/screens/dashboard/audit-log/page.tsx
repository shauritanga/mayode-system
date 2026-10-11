'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { auditLogsApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import ErrorBanner from '@/components/ErrorBanner';

interface Entry {
  id: string; action: string; entityType: string; entityId: string; actorName?: string | null;
  ipAddress?: string | null; createdAt: string; newData?: Record<string, unknown> | null;
}

const LEGACY_VERB: Record<string, string> = { post: 'create', patch: 'update', put: 'update', delete: 'delete' };
const PAST: Record<string, string> = {
  create: 'Created', update: 'Updated', delete: 'Deleted', confirm: 'Confirmed', approve: 'Approved', cancel: 'Cancelled',
  loads: 'Loaded a truck for', complete: 'Completed', settle: 'Settled', collect: 'Collected payment for', receive: 'Received stock into',
  adjust: 'Adjusted stock in', keepers: 'Changed keepers of', 'close-short': 'Closed short', login: 'Signed in', lots: 'Created a lot in', records: 'Recorded in',
};

/** "sale-orders.confirm" -> "Confirmed · sale orders" */
function describe(action: string) {
  const [area, rawVerb = ''] = action.split('.');
  const verb = LEGACY_VERB[rawVerb] ?? rawVerb;
  const label = PAST[verb] ?? verb.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return `${label} · ${area.replace(/-/g, ' ')}`;
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const fetchRows = useCallback(
    () => auditLogsApi.list({ entityType: entityType.trim() || undefined, from: from || undefined, take: 200 })
      .then((r) => { setRows(r.data ?? []); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load the audit log')))
      .finally(() => setLoading(false)),
    [entityType, from],
  );
  useEffect(() => { const t = setTimeout(fetchRows, 250); return () => clearTimeout(t); }, [fetchRows]);

  return (
    <div className="ua-page">
      <div className="ua-head">
        <div>
          <h1 className="ua-title">Audit Log</h1>
          <p className="ua-sub">Every change made in the system: who did it, what they changed, and when. Newest first.</p>
        </div>
      </div>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <div className="ua-toolbar">
        <input className="input-field" placeholder="Area, e.g. sale-orders" value={entityType} onChange={(e) => setEntityType(e.target.value)} style={{ maxWidth: 260 }} aria-label="Area" />
        <input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 190 }} aria-label="From date" />
      </div>
      <div className="ua-panel">
        <div className="ua-scroll">
          <table className="data-table ua-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="ua-empty">Loading…</td></tr>
                : rows.length === 0 ? <tr><td colSpan={5} className="ua-empty"><strong>Nothing recorded</strong>Changes will appear here.</td></tr>
                : rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="ua-muted">{new Date(r.createdAt).toLocaleString()}</td>
                      <td>{r.actorName ?? 'System'}</td>
                      <td style={{ fontWeight: 600 }} title={r.action}>{describe(r.action)}</td>
                      <td className="ua-muted">{r.entityType} · {r.entityId.slice(0, 8)}</td>
                      <td style={{ textAlign: 'right' }}>{r.newData && <button className="btn-secondary ua-action" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Details'}</button>}</td>
                    </tr>
                    {open === r.id && <tr><td colSpan={5}><pre className="so-json">{JSON.stringify(r.newData, null, 2)}</pre></td></tr>}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
