'use client';
import { useEffect, useState } from 'react';
import { disputesApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface Dispute {
  id: string;
  farm?: { farmCode: string; name?: string } | null;
  lease?: { renterPhone: string; renterName?: string | null } | null;
  farmingSeason?: { name: string } | null;
  type: string;
  description: string;
  status: string;
  resolution?: string | null;
  createdAt: string;
}

const RESOLVE_STATUSES = ['UNDER_REVIEW', 'FIELD_VERIFICATION_REQUIRED', 'RESOLVED', 'REJECTED', 'ESCALATED'];

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    OPEN: 'badge-red', UNDER_REVIEW: 'badge-gold', FIELD_VERIFICATION_REQUIRED: 'badge-gold',
    RESOLVED: 'badge-green', REJECTED: 'badge-red', ESCALATED: 'badge-red',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace(/_/g, ' ')}</span>;
};

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Dispute | null>(null);

  const load = () => {
    setLoading(true);
    disputesApi.getAll().then(res => setDisputes(res.data || [])).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openCount = disputes.filter(d => d.status === 'OPEN' || d.status === 'UNDER_REVIEW' || d.status === 'FIELD_VERIFICATION_REQUIRED').length;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--red-400), var(--red-300))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Disputes</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Ownership conflicts, rejected renters, and boundary disputes awaiting review</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--red-400)', fontFamily: 'Outfit, sans-serif' }}>{openCount}</div>
          <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>Open / under review</div>
        </div>
        <div className="stat-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'Outfit, sans-serif' }}>{disputes.filter(d => d.status === 'RESOLVED').length}</div>
          <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>Resolved</div>
        </div>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading…</div>
        ) : disputes.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No disputes.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Farm</th><th>Type</th><th>Description</th><th>Season</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {disputes.map(d => (
                  <tr key={d.id}>
                    <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{d.farm?.farmCode || '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{d.type.replace(/_/g, ' ')}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px', maxWidth: '320px' }}>{d.description}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{d.farmingSeason?.name || '—'}</td>
                    <td>{statusBadge(d.status)}</td>
                    <td>
                      {(d.status === 'OPEN' || d.status === 'UNDER_REVIEW' || d.status === 'FIELD_VERIFICATION_REQUIRED') && (
                        <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => setTarget(d)}>
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {target && (
        <ResolveModal dispute={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); load(); }} />
      )}
    </div>
  );
}

function ResolveModal({ dispute, onClose, onDone }: { dispute: Dispute; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState('RESOLVED');
  const [resolution, setResolution] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await disputesApi.resolve(dispute.id, { status, resolution: resolution || undefined });
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to resolve dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Resolve dispute"
      subtitle={`${dispute.farm?.farmCode} · ${dispute.type.replace(/_/g, ' ')}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <label style={{ display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '6px' }}>Status</label>
      <select className="input-field" value={status} onChange={e => setStatus(e.target.value)} style={{ marginBottom: '12px' }}>
        {RESOLVE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
      </select>

      <label style={{ display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '6px' }}>Resolution notes</label>
      <textarea className="input-field" value={resolution} onChange={e => setResolution(e.target.value)} rows={3} style={{ marginBottom: '12px', resize: 'vertical' }} />

      {error && <p style={{ color: 'var(--red-400)', fontSize: '12px' }}>{error}</p>}
    </Modal>
  );
}
