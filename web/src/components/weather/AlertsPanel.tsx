'use client';
import { useEffect, useState } from 'react';
import { weatherApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';
import { ALERT_TYPES, SEVERITY_BADGE, placeOf, typeLabel, type WxAlert } from '@/lib/weather';

interface Deliveries { byChannel: { channel: string; status: string; count: number }[]; failed: { channel: string; detail: string | null; farmer: { firstName: string; lastName: string; controlNumber: string } | null }[] }
const EMPTY = { alertType: 'GENERAL', severity: 'MEDIUM', title: '', message: '', titleSw: '', messageSw: '', region: '', district: '', ward: '' };
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');

/** Drafts first (review, edit, send or dismiss), then everything already sent with who it reached. */
export default function AlertsPanel({ onChanged }: { onChanged?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const canIssue = hasPermission(user, 'weather', 'CREATE');
  const [alerts, setAlerts] = useState<WxAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [review, setReview] = useState<WxAlert | null>(null);
  const [edit, setEdit] = useState({ title: '', message: '', titleSw: '', messageSw: '', severity: 'MEDIUM' });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [detail, setDetail] = useState<{ alert: WxAlert; d: Deliveries } | null>(null);

  const load = () => weatherApi.alerts().then((r) => { setAlerts(r.data ?? []); setError(''); }).catch((e) => setError(apiErrorMessage(e, 'Could not load alerts.'))).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openReview = (a: WxAlert) => { setReview(a); setFormError(''); setEdit({ title: a.title, message: a.message, titleSw: a.titleSw ?? '', messageSw: a.messageSw ?? '', severity: a.severity }); };
  const run = async (fn: () => Promise<unknown>, after: () => void) => {
    setBusy(true); setFormError('');
    try { await fn(); after(); await load(); onChanged?.(); } catch (e) { setFormError(apiErrorMessage(e, 'That did not work.')); } finally { setBusy(false); }
  };
  const saveEdits = () => weatherApi.updateAlert(review!.id, { title: edit.title, message: edit.message, titleSw: edit.titleSw || undefined, messageSw: edit.messageSw || undefined, severity: edit.severity });
  const openDetail = async (a: WxAlert) => {
    try { const r = await weatherApi.deliveries(a.id); setDetail({ alert: a, d: r.data }); } catch (e) { setError(apiErrorMessage(e, 'Could not load delivery details.')); }
  };
  const count = (d: Deliveries, ch: string, st: string) => d.byChannel.find((x) => x.channel === ch && x.status === st)?.count ?? 0;

  const drafts = alerts.filter((a) => a.status === 'DRAFT');
  const rest = alerts.filter((a) => a.status !== 'DRAFT');

  return (
    <div>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong>{drafts.length ? `${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting for your review` : 'Alerts'}</strong>
        {canIssue && <button className="btn-primary" onClick={() => { setForm(EMPTY); setFormError(''); setCreating(true); }}>+ New alert</button>}
      </div>

      {drafts.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          {drafts.map((a) => (
            <div key={a.id} className="glass-card" style={{ padding: 14, borderLeft: '4px solid var(--gold-400)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{a.severity.toLowerCase()}</span>{' '}
                  <span className="badge badge-gray">{typeLabel(a.alertType)}</span>{' '}
                  {a.source === 'AUTO' && <span className="badge badge-blue">From the forecast</span>}
                  <div style={{ fontWeight: 700, marginTop: 6 }}>{a.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--neutral-500)', maxWidth: 640 }}>{a.message}</div>
                  <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 4 }}>
                    {placeOf(a)}{a.evidence ? ` · ${a.evidence.totalMm} mm this week, ${a.evidence.maxDryRun} dry days in a row, ${a.evidence.farms} crops` : ''}
                  </div>
                </div>
                {canIssue && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><button className="btn-primary" onClick={() => openReview(a)}>Review and send</button></div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="table-panel">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading…</div> : rest.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--neutral-500)' }}>No alerts sent yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Type</th><th>Severity</th><th>Title</th><th>Area</th><th>Sent</th><th>SMS</th><th>App</th><th>WhatsApp</th><th>Officers</th><th /></tr></thead>
              <tbody>{rest.map((a) => (
                <tr key={a.id}>
                  <td>{typeLabel(a.alertType)}</td><td><span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{a.severity.toLowerCase()}</span></td>
                  <td style={{ fontWeight: 600 }}>{a.title}{a.status === 'DISMISSED' && <span className="badge badge-gray" style={{ marginLeft: 6 }}>dismissed</span>}</td>
                  <td>{placeOf(a)}</td><td>{day(a.sentAt ?? a.validFrom)}</td>
                  <td>{a.smsSentCount}</td><td>{a.appSentCount}</td><td>{a.whatsappSentCount}</td><td>{a.officersNotified}</td>
                  <td style={{ textAlign: 'right' }}>{a.status === 'SENT' && <button className="btn-secondary" onClick={() => openDetail(a)}>Delivery</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {review && (
        <Modal title="Review alert" subtitle={`${typeLabel(review.alertType)} · ${placeOf(review)}`} width="680px" onClose={() => setReview(null)}
          footer={<>
            <button className="btn-secondary" disabled={busy} style={{ color: 'var(--red-500)' }} onClick={() => run(() => weatherApi.dismissAlert(review.id), () => setReview(null))}>Dismiss</button>
            <button className="btn-secondary" disabled={busy} onClick={() => run(saveEdits, () => setReview(null))}>Save changes</button>
            <button className="btn-primary" disabled={busy || !edit.title.trim() || !edit.message.trim()} onClick={() => run(async () => { await saveEdits(); await weatherApi.sendAlert(review.id); }, () => setReview(null))}>Send to farmers</button>
          </>}>
          {formError && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{formError}</div>}
          <div className="alert-box alert-success" style={{ marginBottom: 12 }}>Sending texts every farmer in this area by SMS, shows it in their app, messages those who agreed on WhatsApp, and tells their field officers.</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <label className="form-label">Severity<select className="input-field" value={edit.severity} onChange={(e) => setEdit({ ...edit, severity: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="form-label">Title (English)<input className="input-field" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            <label className="form-label">Message (English)<textarea className="input-field" rows={3} value={edit.message} onChange={(e) => setEdit({ ...edit, message: e.target.value })} /></label>
            <label className="form-label">Title (Kiswahili)<input className="input-field" value={edit.titleSw} onChange={(e) => setEdit({ ...edit, titleSw: e.target.value })} /></label>
            <label className="form-label">Message (Kiswahili)<textarea className="input-field" rows={3} value={edit.messageSw} onChange={(e) => setEdit({ ...edit, messageSw: e.target.value })} /></label>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal title="New alert" subtitle="Write it in English and Kiswahili. Farmers get the language they use." width="640px" onClose={() => setCreating(false)}
          footer={<>
            <button className="btn-secondary" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-secondary" disabled={busy || !form.title.trim() || !form.message.trim()} onClick={() => run(() => weatherApi.createAlert({ ...clean(form), sendNow: false }), () => setCreating(false))}>Save as draft</button>
            <button className="btn-primary" disabled={busy || !form.title.trim() || !form.message.trim()} onClick={() => run(() => weatherApi.createAlert(clean(form)), () => setCreating(false))}>{busy ? 'Sending…' : 'Send now'}</button>
          </>}>
          {formError && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
              <label className="form-label">Type<select className="input-field" value={form.alertType} onChange={(e) => setForm({ ...form, alertType: e.target.value })}>{ALERT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="form-label">Severity<select className="input-field" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s}>{s}</option>)}</select></label>
            </div>
            <label className="form-label">Title (English)<input className="input-field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="form-label">Message (English)<textarea className="input-field" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
            <label className="form-label">Title (Kiswahili)<input className="input-field" value={form.titleSw} onChange={(e) => setForm({ ...form, titleSw: e.target.value })} /></label>
            <label className="form-label">Message (Kiswahili)<textarea className="input-field" rows={3} value={form.messageSw} onChange={(e) => setForm({ ...form, messageSw: e.target.value })} /></label>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <label className="form-label">Region<input className="input-field" placeholder="All" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></label>
              <label className="form-label">District<input className="input-field" placeholder="All" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></label>
              <label className="form-label">Ward<input className="input-field" placeholder="All" value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })} /></label>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title="Who was reached" subtitle={detail.alert.title} onClose={() => setDetail(null)} footer={<button className="btn-secondary" onClick={() => setDetail(null)}>Close</button>}>
          <table className="data-table"><thead><tr><th>Channel</th><th>Delivered</th><th>Failed</th><th>Skipped</th></tr></thead>
            <tbody>{['SMS', 'APP', 'WHATSAPP', 'OFFICER'].map((ch) => (
              <tr key={ch}><td>{ch === 'APP' ? 'Mobile app' : ch === 'OFFICER' ? 'Field officers' : ch === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}</td>
                <td>{count(detail.d, ch, 'SENT')}</td><td style={{ color: count(detail.d, ch, 'FAILED') ? 'var(--red-500)' : undefined }}>{count(detail.d, ch, 'FAILED')}</td><td>{count(detail.d, ch, 'SKIPPED')}</td></tr>
            ))}</tbody></table>
          {detail.d.failed.length > 0 && (
            <>
              <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Not reached — follow up</h4>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {detail.d.failed.slice(0, 20).map((f, i) => <li key={i}>{f.farmer ? `${f.farmer.firstName} ${f.farmer.lastName} (${f.farmer.controlNumber})` : 'Officer'} — {f.channel.toLowerCase()}{f.detail ? `: ${f.detail}` : ''}</li>)}
              </ul>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function clean(f: typeof EMPTY) {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => String(v).trim() !== ''));
}
