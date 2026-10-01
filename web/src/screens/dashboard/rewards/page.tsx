'use client';
import { Fragment, useEffect, useState } from 'react';
import { rewardsApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface Winner {
  id: string;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  status: string;
}
interface Campaign {
  id: string;
  name: string;
  sponsor?: string;
  rewardType: string;
  rewardQuantity?: number;
  numberOfWinners: number;
  status: string;
  winners?: Winner[];
}

interface FeedbackDialog {
  title: string;
  message: string;
}

type ApiError = { response?: { data?: { message?: string | string[] } } };

const REWARD_TYPES = ['FERTILIZER', 'SEEDS', 'MACHINE_SERVICE', 'IRRIGATION_SUPPORT', 'TRAINING', 'INPUT_VOUCHER', 'CERTIFICATE', 'OTHER'];

const getErrorMessage = (error: unknown, fallback: string) => {
  const message = (error as ApiError)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || fallback;
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    DRAFT: 'badge-gray', ACTIVE: 'badge-blue', SELECTION_PENDING: 'badge-gold',
    WINNERS_SELECTED: 'badge-gold', ANNOUNCED: 'badge-green', FULFILLED: 'badge-green', CANCELLED: 'badge-red',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s.replace(/_/g, ' ')}</span>;
};

const emptyForm = { name: '', description: '', sponsor: 'MAYODE Group', rewardType: 'FERTILIZER', rewardQuantity: '', numberOfWinners: '5' };

export default function RewardsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectionTarget, setSelectionTarget] = useState<Campaign | null>(null);
  const [feedback, setFeedback] = useState<FeedbackDialog | null>(null);

  const load = () => {
    setLoading(true);
    rewardsApi.listCampaigns()
      .then(res => setCampaigns(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setError('');
    if (!form.name.trim() || !form.numberOfWinners) {
      setError('Campaign name and number of winners are required.');
      return;
    }
    setSubmitting(true);
    try {
      await rewardsApi.createCampaign({
        name: form.name,
        description: form.description || undefined,
        sponsor: form.sponsor || undefined,
        rewardType: form.rewardType,
        rewardQuantity: form.rewardQuantity ? Number(form.rewardQuantity) : undefined,
        numberOfWinners: Number(form.numberOfWinners),
      });
      setForm({ ...emptyForm });
      setShowForm(false);
      load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create campaign.'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    try {
      const res = await rewardsApi.getCampaign(id);
      setCampaigns(cs => cs.map(c => c.id === id ? res.data : c));
    } catch (e) { console.error(e); }
  };

  const runSelect = async (id: string) => {
    setBusy(id);
    try {
      await rewardsApi.select(id);
      setSelectionTarget(null);
      load();
      const res = await rewardsApi.getCampaign(id);
      setCampaigns(cs => cs.map(c => c.id === id ? res.data : c));
    } catch (e: unknown) {
      setSelectionTarget(null);
      setFeedback({
        title: 'Winner selection failed',
        message: getErrorMessage(e, 'The winner selection could not be completed. Please try again.'),
      });
    } finally { setBusy(null); }
  };

  const runApprove = async (id: string) => {
    setBusy(id);
    try {
      await rewardsApi.approve(id);
      load();
    } catch (e: unknown) {
      setFeedback({
        title: 'Approval failed',
        message: getErrorMessage(e, 'The winners could not be approved. Please try again.'),
      });
    } finally { setBusy(null); }
  };

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Reward Campaigns</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>Auditable, reproducible random winner selection for farmer incentives</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + New campaign
        </button>
      </div>

      {showForm && (
        <Modal
          title="New reward campaign"
          subtitle="Selection is seeded and reproducible — every winner pick is auditable"
          onClose={() => { setShowForm(false); setError(''); }}
          width="600px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={submit} disabled={submitting}>
                {submitting ? 'Saving…' : 'Create campaign'}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            <Field label="Campaign name *" value={form.name} onChange={v => set('name', v)} placeholder="Annual Fertilizer Support 2026" />
            <Field label="Sponsor" value={form.sponsor} onChange={v => set('sponsor', v)} />
            <div>
              <label style={labelStyle}>Reward type</label>
              <select className="input-field" value={form.rewardType} onChange={e => set('rewardType', e.target.value)}>
                {REWARD_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <Field label="Reward quantity" value={form.rewardQuantity} onChange={v => set('rewardQuantity', v)} placeholder="4" />
            <Field label="Number of winners *" value={form.numberOfWinners} onChange={v => set('numberOfWinners', v)} placeholder="5" />
            <Field label="Description" value={form.description} onChange={v => set('description', v)} />
          </div>
          {error && <div style={{ color: 'var(--red-400)', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
        </Modal>
      )}

      {selectionTarget && (
        <Modal
          title="Run winner selection"
          subtitle="This will record an auditable, reproducible selection for this campaign."
          onClose={() => { if (busy !== selectionTarget.id) setSelectionTarget(null); }}
          width="480px"
          footer={
            <>
              <button className="btn-secondary" onClick={() => setSelectionTarget(null)} disabled={busy === selectionTarget.id}>Cancel</button>
              <button className="btn-primary" onClick={() => runSelect(selectionTarget.id)} disabled={busy === selectionTarget.id}>
                {busy === selectionTarget.id ? 'Selecting…' : 'Run selection'}
              </button>
            </>
          }
        >
          <p style={{ color: 'var(--neutral-400)', fontSize: '14px', lineHeight: 1.6 }}>
            Are you sure you want to select {selectionTarget.numberOfWinners} winner{selectionTarget.numberOfWinners === 1 ? '' : 's'} for <strong style={{ color: 'var(--text-primary)' }}>{selectionTarget.name}</strong>?
          </p>
        </Modal>
      )}

      {feedback && (
        <Modal
          title={feedback.title}
          onClose={() => setFeedback(null)}
          width="480px"
          footer={<button className="btn-primary" onClick={() => setFeedback(null)}>Close</button>}
        >
          <p style={{ color: 'var(--neutral-400)', fontSize: '14px', lineHeight: 1.6 }}>{feedback.message}</p>
        </Modal>
      )}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No reward campaigns yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Campaign</th><th>Type</th><th>Winners</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <Fragment key={c.id}>
                    <tr>
                      <td style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{c.rewardType.replace(/_/g, ' ')}{c.rewardQuantity ? ` × ${c.rewardQuantity}` : ''}</td>
                      <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{c.numberOfWinners}</td>
                      <td>{statusBadge(c.status)}</td>
                      <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => toggleExpand(c.id)}>
                          {expanded === c.id ? 'Hide' : 'Winners'}
                        </button>
                        {(c.status === 'DRAFT' || c.status === 'ACTIVE' || c.status === 'SELECTION_PENDING') && (
                          <button className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={busy === c.id} onClick={() => setSelectionTarget(c)}>
                            {busy === c.id ? 'Selecting…' : 'Run selection'}
                          </button>
                        )}
                        {c.status === 'WINNERS_SELECTED' && (
                          <button className="btn-primary" style={{ fontSize: '11px', padding: '5px 10px' }} disabled={busy === c.id} onClick={() => runApprove(c.id)}>
                            {busy === c.id ? 'Approving…' : 'Approve & notify'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr>
                        <td colSpan={5} style={{ background: 'var(--hover-tint-1)', padding: '12px 16px' }}>
                          {!c.winners || c.winners.length === 0 ? (
                            <span style={{ color: 'var(--neutral-500)', fontSize: '12px' }}>No winners selected yet.</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {c.winners.map(w => (
                                <span key={w.id} className="badge badge-gray" style={{ fontSize: '11px' }}>
                                  {w.farmer ? `${w.farmer.firstName} ${w.farmer.lastName} (${w.farmer.controlNumber})` : '—'} — {w.status}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input className="input-field" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
