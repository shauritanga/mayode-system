'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { farmId } from '@/lib/farm-id';
import { irrigationApi } from '@/lib/api';
import { BASE, ConfirmDialog, Empty, LoadError, Notice, StatusBadge, TableSkeleton, fmtDate, useApi, useIrrigation } from './ui';

/**
 * Requests to release a dependent's hectare from its guardian when the dependent comes of age. The guardian asks in the app (or at
 * the office); a Manager or Accountant approves, which ends the guardianship and leaves the member independent.
 */
export function Emancipations() {
  const { can } = useIrrigation();
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<{ kind: 'approve' | 'reject'; row: any } | null>(null);
  const [message, setMessage] = useState('');
  const { data, loading, error, reload } = useApi<any>(() => irrigationApi.emancipations({ status: status || undefined, pageSize: 25 }), [status, refresh]);
  const canApprove = can('irrigation_transfer_approval', 'EDIT');
  const rows: any[] = data?.data ?? [];
  const done = (text: string) => { setMessage(text); setRefresh((n) => n + 1); };
  return (
    <section className="table-panel" style={{ marginTop: 16 }}>
      <div className="section-toolbar">
        <strong>Coming of age: release from guardian</strong>
        <select className="input-field" style={{ width: 170 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING_APPROVAL">Waiting for approval</option><option value="">All</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Withdrawn</option>
        </select>
      </div>
      {message && <div style={{ padding: '0 16px' }}><Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice></div>}
      <LoadError message={error} onRetry={reload} />
      {loading && !data ? <TableSkeleton cols={6} rows={3} /> : !rows.length ? (
        <Empty title="No requests" hint="A guardian asks from the MAYODE app when a dependent reaches adulthood. You can also file one from the hectare page." />
      ) : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Registered to</th><th>Guardian</th><th>Note</th><th>Asked</th><th>Status</th><th /></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`${BASE}/structure/hectares/${r.hectare.id}`} style={{ fontWeight: 600 }}>{farmId(r.hectare.code)}</Link></td>
              <td>{r.holder?.name}<div className="muted" style={{ fontSize: 11 }}>{r.holder?.age != null ? `${r.holder.age} years old` : 'Date of birth not on record'}{r.holder?.age != null && r.holder.age < 18 ? ' · under 18' : ''}</div></td>
              <td>{r.guardian?.name}</td>
              <td style={{ maxWidth: 220 }}>{r.note ?? '—'}{r.decisionNote && <div className="muted" style={{ fontSize: 11 }}>{r.decisionNote}</div>}</td>
              <td>{fmtDate(r.createdAt)}</td>
              <td><StatusBadge value={r.status} label={r.status === 'PENDING_APPROVAL' ? 'Waiting' : undefined} /></td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {r.status === 'PENDING_APPROVAL' && canApprove && <><button type="button" className="btn-primary" onClick={() => setAction({ kind: 'approve', row: r })}>Approve</button> <button type="button" className="btn-secondary" onClick={() => setAction({ kind: 'reject', row: r })}>Reject</button></>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {action && <ConfirmDialog
        title={action.kind === 'approve' ? 'Release this hectare from its guardian?' : 'Reject this request'} danger={action.kind === 'reject'}
        askReason={action.kind === 'reject'} reasonLabel="Reason (sent to the family)" confirmLabel={action.kind === 'approve' ? 'Approve' : 'Reject'}
        body={action.kind === 'approve'
          ? <>{action.row.guardian?.name} stops being guardian of <strong>{farmId(action.row.hectare.code)}</strong>. It stays registered to <strong>{action.row.holder?.name}</strong>, who becomes an independent member. Both are told by SMS.</>
          : <>The guardianship stays as it is. The family is told why.</>}
        onConfirm={async (reason) => {
          if (action.kind === 'approve') await irrigationApi.approveEmancipation(action.row.id);
          else await irrigationApi.rejectEmancipation(action.row.id, { reason });
          done(action.kind === 'approve' ? 'Done. The hectare is released from its guardian.' : 'Request rejected.');
        }} onClose={() => setAction(null)} />}
    </section>
  );
}
