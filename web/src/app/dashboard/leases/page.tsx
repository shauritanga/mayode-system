'use client';
import { useEffect, useState } from 'react';
import { farmLeasesApi, seasonalAssignmentsApi, farmOwnershipsApi, farmsApi, farmingSeasonsApi } from '@/lib/api';
import Modal from '@/components/Modal';

const OFFICER_METHODS = [
  'PHONE_CALL', 'IN_PERSON', 'VIDEO_CALL', 'DOCUMENT_REVIEW',
  'BLOCK_LEADER', 'CANAL_LEADER', 'COOPERATIVE_LEADER', 'NEIGHBOR',
];
const OFFICER_DECISIONS = ['VERIFIED', 'REJECTED', 'NEEDS_MORE_INFO', 'DISPUTED'];

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
  const [verifyTarget, setVerifyTarget] = useState<Lease | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      farmLeasesApi.getAll().then(res => setLeases(res.data || [])),
      seasonalAssignmentsApi.getAll().then(res => setAssignments(res.data || [])),
      farmOwnershipsApi.getAll().then(res => setOwnerships(res.data || [])),
    ]).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const pendingLeases = leases.filter(l => l.status === 'PENDING_VERIFICATION').length;
  const pendingOwnerships = ownerships.filter(o => o.confirmationStatus === 'PENDING').length;

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Leases &amp; Seasonal Assignments</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Owner-added leases, active seasonal farmers, and ownership confirmations</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAssignForm(true)}>+ Assign renter for this season</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total leases', value: leases.length, color: 'var(--accent)' },
          { label: 'Awaiting officer verify', value: pendingLeases, color: 'var(--gold-400)' },
          { label: 'Seasonal assignments', value: assignments.length, color: 'var(--blue-500)' },
          { label: 'Ownerships unconfirmed', value: pendingOwnerships, color: 'var(--red-400)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>{s.label}</div>
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
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading…</div>
        ) : tab === 'leases' ? (
          leases.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No leases yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Farm</th><th>Season</th><th>Owner</th><th>Renter</th><th>Period</th><th>Owner</th><th>Renter</th><th>Officer</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {leases.map(l => (
                    <tr key={l.id}>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{l.farm?.farmCode || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{l.farmingSeason?.name || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{l.ownerFarmer ? `${l.ownerFarmer.firstName} ${l.ownerFarmer.lastName}` : '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{l.renterFarmer ? `${l.renterFarmer.firstName} ${l.renterFarmer.lastName}` : (l.renterName || l.renterPhone)}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{fmtDate(l.leaseStartDate)} → {fmtDate(l.leaseEndDate)}</td>
                      <td>{statusBadge(l.ownerConfirmationStatus)}</td>
                      <td>{statusBadge(l.renterConfirmationStatus)}</td>
                      <td>{statusBadge(l.officerConfirmationStatus)}</td>
                      <td>{statusBadge(l.status)}</td>
                      <td>
                        {l.officerConfirmationStatus !== 'VERIFIED' && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '11px', padding: '5px 10px' }}
                            onClick={() => setVerifyTarget(l)}
                          >
                            Officer verify
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
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No seasonal assignments yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Farm</th><th>Season</th><th>Active farmer</th><th>Type</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{a.farm?.farmCode || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{a.farmingSeason?.name || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{a.activeFarmer ? `${a.activeFarmer.firstName} ${a.activeFarmer.lastName}` : '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{a.assignmentType.replace(/_/g, ' ')}</td>
                      <td>{statusBadge(a.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          ownerships.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No ownership records yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Farm</th><th>Owner</th><th>Source</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {ownerships.map(o => (
                    <tr key={o.id}>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{o.farm?.farmCode || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{o.ownerFarmer ? `${o.ownerFarmer.firstName} ${o.ownerFarmer.lastName}` : '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{o.source}</td>
                      <td>{statusBadge(o.confirmationStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {verifyTarget && (
        <OfficerVerifyModal
          lease={verifyTarget}
          onClose={() => setVerifyTarget(null)}
          onDone={() => { setVerifyTarget(null); load(); }}
        />
      )}

      {showAssignForm && (
        <AssignRenterModal
          onClose={() => setShowAssignForm(false)}
          onDone={() => { setShowAssignForm(false); load(); }}
        />
      )}
    </div>
  );
}

function AssignRenterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [farms, setFarms] = useState<{ id: string; farmCode: string; name?: string }[]>([]);
  const [season, setSeason] = useState<{ id: string; name: string } | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [farmId, setFarmId] = useState('');
  const [renterName, setRenterName] = useState('');
  const [renterPhone, setRenterPhone] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingOptions(true);
    Promise.all([
      farmsApi.getAll({ isVerified: 'true' }).then(res => setFarms(res.data?.data || res.data || [])),
      farmingSeasonsApi.getCurrent().then(res => {
        setSeason(res.data ?? null);
        if (res.data?.startDate) setStart(String(res.data.startDate).slice(0, 10));
        if (res.data?.endDate) setEnd(String(res.data.endDate).slice(0, 10));
      }).catch(() => setSeason(null)),
    ]).finally(() => setLoadingOptions(false));
  }, []);

  const submit = async () => {
    if (!farmId || !renterPhone.trim() || !start.trim() || !end.trim()) {
      setError('Select a farm and fill in renter phone, lease start and end dates.');
      return;
    }
    if (!season?.id) {
      setError('No active farming season found.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await farmLeasesApi.create({
        farmId,
        farmingSeasonId: season.id,
        renterPhone: renterPhone.trim(),
        renterName: renterName.trim() || undefined,
        leaseStartDate: start.trim(),
        leaseEndDate: end.trim(),
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not assign renter for this season.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Assign renter for this season"
      subtitle="Only verified (boundary-approved) farms can be assigned"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting || loadingOptions}>
            {submitting ? 'Saving…' : 'Assign renter'}
          </button>
        </>
      }
    >
      {loadingOptions ? (
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Loading farms and season…</p>
      ) : (
        <>
          <label style={fieldLabelStyle}>Farm</label>
          <select className="input-field" value={farmId} onChange={e => setFarmId(e.target.value)} style={{ marginBottom: '12px' }}>
            <option value="">Select a verified farm</option>
            {farms.map(f => <option key={f.id} value={f.id}>{f.farmCode}{f.name ? ` · ${f.name}` : ''}</option>)}
          </select>

          <label style={fieldLabelStyle}>Farming season</label>
          <input className="input-field" value={season?.name || 'No active season'} disabled style={{ marginBottom: '12px' }} />

          <label style={fieldLabelStyle}>Renter phone</label>
          <input className="input-field" value={renterPhone} onChange={e => setRenterPhone(e.target.value)}
            placeholder="+255712345678" style={{ marginBottom: '12px' }} />

          <label style={fieldLabelStyle}>Renter name</label>
          <input className="input-field" value={renterName} onChange={e => setRenterName(e.target.value)}
            placeholder="John Mushi" style={{ marginBottom: '12px' }} />

          <label style={fieldLabelStyle}>Lease start date</label>
          <input className="input-field" type="date" value={start} onChange={e => setStart(e.target.value)} style={{ marginBottom: '12px' }} />

          <label style={fieldLabelStyle}>Lease end date</label>
          <input className="input-field" type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ marginBottom: '12px' }} />

          <label style={fieldLabelStyle}>Notes</label>
          <textarea className="input-field" value={notes} onChange={e => setNotes(e.target.value)}
            rows={3} style={{ marginBottom: '12px', resize: 'vertical' }} />
        </>
      )}

      {error && <p style={{ color: 'var(--red-400)', fontSize: '12px' }}>{error}</p>}
    </Modal>
  );
}

function OfficerVerifyModal({ lease, onClose, onDone }: { lease: Lease; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState('VERIFIED');
  const [method, setMethod] = useState('PHONE_CALL');
  const [contactedName, setContactedName] = useState('');
  const [contactedPhone, setContactedPhone] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await farmLeasesApi.officerVerify(lease.id, {
        decision,
        method,
        contactedName: contactedName || undefined,
        contactedPhone: contactedPhone || undefined,
        evidenceUrls: evidenceUrls ? evidenceUrls.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        notes: notes || undefined,
      });
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to submit verification');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Officer verification"
      subtitle={`${lease.farm?.farmCode} · ${lease.farmingSeason?.name} · Renter: ${lease.renterFarmer ? `${lease.renterFarmer.firstName} ${lease.renterFarmer.lastName}` : (lease.renterName || lease.renterPhone)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit decision'}
          </button>
        </>
      }
    >
      <label style={fieldLabelStyle}>Decision</label>
      <select className="input-field" value={decision} onChange={e => setDecision(e.target.value)} style={{ marginBottom: '12px' }}>
        {OFFICER_DECISIONS.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
      </select>

      <label style={fieldLabelStyle}>Verification method</label>
      <select className="input-field" value={method} onChange={e => setMethod(e.target.value)} style={{ marginBottom: '12px' }}>
        {OFFICER_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
      </select>

      <label style={fieldLabelStyle}>Person contacted</label>
      <input className="input-field" value={contactedName} onChange={e => setContactedName(e.target.value)}
        placeholder="e.g. Juma Mwakalinga (block leader)" style={{ marginBottom: '12px' }} />

      <label style={fieldLabelStyle}>Contact phone</label>
      <input className="input-field" value={contactedPhone} onChange={e => setContactedPhone(e.target.value)}
        placeholder="+255713000000" style={{ marginBottom: '12px' }} />

      <label style={fieldLabelStyle}>Evidence URLs (comma-separated)</label>
      <input className="input-field" value={evidenceUrls} onChange={e => setEvidenceUrls(e.target.value)}
        placeholder="/uploads/photo.jpg, /uploads/doc.pdf" style={{ marginBottom: '12px' }} />

      <label style={fieldLabelStyle}>Notes</label>
      <textarea className="input-field" value={notes} onChange={e => setNotes(e.target.value)}
        rows={3} style={{ marginBottom: '12px', resize: 'vertical' }} />

      {error && <p style={{ color: 'var(--red-400)', fontSize: '12px' }}>{error}</p>}
    </Modal>
  );
}

const fieldLabelStyle = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '6px' } as const;

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
