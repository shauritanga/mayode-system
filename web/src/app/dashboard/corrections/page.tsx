'use client';
import { useEffect, useState } from 'react';
import { farmCorrectionsApi } from '@/lib/api';

interface SuggestedUpdate {
  id: string;
  farm?: { farmCode: string; name?: string };
  fieldName: string;
  currentValue?: string | null;
  suggestedValue: string;
  evidenceUrls: string[];
  reviewStatus: string;
  createdAt: string;
}
interface DataConflict {
  id: string;
  farm?: { farmCode: string; name?: string };
  fieldName: string;
  value: string;
  sourceType: string;
  recordedAt: string;
}

type Tab = 'suggestions' | 'conflicts';

const statusBadge = (s: string) => {
  const map: Record<string, string> = { PENDING: 'badge-gold', APPROVED: 'badge-green', MERGED: 'badge-green', REJECTED: 'badge-red' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
};

export default function CorrectionsPage() {
  const [tab, setTab] = useState<Tab>('suggestions');
  const [updates, setUpdates] = useState<SuggestedUpdate[]>([]);
  const [conflicts, setConflicts] = useState<DataConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      farmCorrectionsApi.listAll().then(res => setUpdates(res.data || [])),
      farmCorrectionsApi.listConflicts().then(res => setConflicts(res.data || [])),
    ]).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const review = async (id: string, decision: 'APPROVED' | 'REJECTED' | 'MERGED') => {
    setBusy(id);
    try {
      await farmCorrectionsApi.review(id, { decision });
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const pending = updates.filter(u => u.reviewStatus === 'PENDING');

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Farm Data Corrections</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Farmer-suggested corrections and conflicting source data awaiting review</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div className="stat-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gold-400)', fontFamily: 'Outfit, sans-serif' }}>{pending.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>Pending suggestions</div>
        </div>
        <div className="stat-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--red-400)', fontFamily: 'Outfit, sans-serif' }}>{conflicts.length}</div>
          <div style={{ fontSize: '12px', color: 'var(--neutral-500)', marginTop: '2px' }}>Conflicting values</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['suggestions', 'conflicts'] as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '13px', padding: '8px 16px' }} onClick={() => setTab(t)}>
            {t === 'suggestions' ? 'Suggested corrections' : 'Data conflicts'}
          </button>
        ))}
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading…</div>
        ) : tab === 'suggestions' ? (
          updates.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No suggested corrections yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Farm</th><th>Field</th><th>Current</th><th>Suggested</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {updates.map(u => (
                    <tr key={u.id}>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{u.farm?.farmCode || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{u.fieldName}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{u.currentValue || '—'}</td>
                      <td style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 }}>{u.suggestedValue}</td>
                      <td>{statusBadge(u.reviewStatus)}</td>
                      <td>
                        {u.reviewStatus === 'PENDING' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn-primary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={busy === u.id} onClick={() => review(u.id, 'APPROVED')}>Approve</button>
                            <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={busy === u.id} onClick={() => review(u.id, 'REJECTED')}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          conflicts.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No conflicting data values.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Farm</th><th>Field</th><th>Value</th><th>Source</th><th>Recorded</th></tr></thead>
                <tbody>
                  {conflicts.map(c => (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{c.farm?.farmCode || '—'}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{c.fieldName}</td>
                      <td style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 }}>{c.value}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{c.sourceType}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{new Date(c.recordedAt).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--neutral-500)' }}>
                Open the farm's detail page to pick the approved value for each conflicting field.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
