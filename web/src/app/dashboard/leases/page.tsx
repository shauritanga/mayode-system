'use client';
import { useEffect, useState } from 'react';
import { farmLeasesApi, seasonalAssignmentsApi, farmOwnershipsApi } from '@/lib/api';

interface Lease {
  id: string;
  farm?: { farmCode: string; name?: string };
  farmingSeason?: { name: string };
  ownerFarmer?: { firstName: string; lastName: string };
  renterFarmer?: { firstName: string; lastName: string } | null;
  renterName?: string | null;
  renterPhone: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  ownerConfirmationStatus: string;
  renterConfirmationStatus: string;
  officerConfirmationStatus: string;
}
interface Assignment {
  id: string;
  farm?: { farmCode: string; name?: string };
  farmingSeason?: { name: string };
  activeFarmer?: { firstName: string; lastName: string };
  assignmentType: string;
  status: string;
}
interface Ownership {
  id: string;
  farm?: { farmCode: string; name?: string };
  ownerFarmer?: { firstName: string; lastName: string } | null;
  confirmationStatus: string;
  source: string;
}

type Tab = 'leases' | 'assignments' | 'ownerships';

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    VERIFIED: 'badge-green', ACTIVE: 'badge-green',
    PENDING: 'badge-gold', PENDING_VERIFICATION: 'badge-gold', DRAFT: 'badge-gray',
    REJECTED: 'badge-red', DISPUTED: 'badge-red', TERMINATED: 'badge-red', SUSPENDED: 'badge-red',
    COMPLETED: 'badge-blue',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace(/_/g, ' ')}</span>;
};

export default function LeasesPage() {
  const [tab, setTab] = useState<Tab>('leases');
  const [leases, setLeases] = useState<Lease[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ownerships, setOwnerships] = useState<Ownership[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      farmLeasesApi.getAll().then(res => setLeases(res.data || [])),
      seasonalAssignmentsApi.getAll().then(res => setAssignments(res.data || [])),
      farmOwnershipsApi.getAll().then(res => setOwnerships(res.data || [])),
    ]).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const officerVerify = async (id: string) => {
    setVerifying(id);
    try {
      await farmLeasesApi.officerVerify(id, {});
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setVerifying(null);
    }
  };

  const pendingLeases = leases.filter(l => l.status === 'PENDING_VERIFICATION').length;
  const pendingOwnerships = ownerships.filter(o => o.confirmationStatus === 'PENDING').length;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, #10B981, #34D399)', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: '#F9FAFB' }}>Leases &amp; Seasonal Assignments</h1>
        </div>
        <p style={{ fontSize: '13px', color: '#6B7280', marginLeft: '14px' }}>Owner-added leases, active seasonal farmers, and ownership confirmations</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total leases', value: leases.length, color: '#10B981' },
          { label: 'Awaiting officer verify', value: pendingLeases, color: '#F59E0B' },
          { label: 'Seasonal assignments', value: assignments.length, color: '#3B82F6' },
          { label: 'Ownerships unconfirmed', value: pendingOwnerships, color: '#F87171' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['leases', 'assignments', 'ownerships'] as Tab[]).map(t => (
          <button
            key={t}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '13px', padding: '8px 16px' }}
            onClick={() => setTab(t)}
          >
            {t === 'leases' ? 'Leases' : t === 'assignments' ? 'Seasonal Assignments' : 'Ownerships'}
          </button>
        ))}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>Loading…</div>
        ) : tab === 'leases' ? (
          leases.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>No leases yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Farm</th><th>Season</th><th>Owner</th><th>Renter</th><th>Period</th><th>Owner</th><th>Renter</th><th>Officer</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {leases.map(l => (
                    <tr key={l.id}>
                      <td style={{ color: '#F9FAFB', fontSize: '13px', fontWeight: 600 }}>{l.farm?.farmCode || '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{l.farmingSeason?.name || '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{l.ownerFarmer ? `${l.ownerFarmer.firstName} ${l.ownerFarmer.lastName}` : '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{l.renterFarmer ? `${l.renterFarmer.firstName} ${l.renterFarmer.lastName}` : (l.renterName || l.renterPhone)}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{fmtDate(l.leaseStartDate)} → {fmtDate(l.leaseEndDate)}</td>
                      <td>{statusBadge(l.ownerConfirmationStatus)}</td>
                      <td>{statusBadge(l.renterConfirmationStatus)}</td>
                      <td>{statusBadge(l.officerConfirmationStatus)}</td>
                      <td>{statusBadge(l.status)}</td>
                      <td>
                        {l.officerConfirmationStatus !== 'VERIFIED' && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            disabled={verifying === l.id}
                            onClick={() => officerVerify(l.id)}
                          >
                            {verifying === l.id ? 'Verifying…' : 'Officer verify'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'assignments' ? (
          assignments.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>No seasonal assignments yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Farm</th><th>Season</th><th>Active farmer</th><th>Type</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td style={{ color: '#F9FAFB', fontSize: '13px', fontWeight: 600 }}>{a.farm?.farmCode || '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{a.farmingSeason?.name || '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{a.activeFarmer ? `${a.activeFarmer.firstName} ${a.activeFarmer.lastName}` : '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{a.assignmentType.replace(/_/g, ' ')}</td>
                      <td>{statusBadge(a.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          ownerships.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>No ownership records yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Farm</th><th>Owner</th><th>Source</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {ownerships.map(o => (
                    <tr key={o.id}>
                      <td style={{ color: '#F9FAFB', fontSize: '13px', fontWeight: 600 }}>{o.farm?.farmCode || '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{o.ownerFarmer ? `${o.ownerFarmer.firstName} ${o.ownerFarmer.lastName}` : '—'}</td>
                      <td style={{ color: '#9CA3AF', fontSize: '12px' }}>{o.source}</td>
                      <td>{statusBadge(o.confirmationStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
