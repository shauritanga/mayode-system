'use client';

import { useState } from 'react';
import { riceVarietiesApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';

export type Variety = {
  id: string; name: string; code?: string | null; maturityDays?: number | null; description?: string | null;
  isActive: boolean; hasCalendar: boolean; calendarVersion?: number | null; cropCycleCount?: number;
};

/** Super Admin's catalog of rice varieties. Farmers pick from the active ones when they start a crop cycle. */
export default function VarietiesPanel({ varieties, canEdit, onChanged, onError }: {
  varieties: Variety[]; canEdit: boolean; onChanged: () => void; onError: (m: string) => void;
}) {
  const [form, setForm] = useState({ name: '', code: '', maturityDays: '' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', code: '', maturityDays: '' });

  const days = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const add = async () => {
    if (!form.name.trim()) { onError('Give the variety a name.'); return; }
    setBusy(true);
    try {
      await riceVarietiesApi.create({ name: form.name.trim(), code: form.code.trim() || undefined, maturityDays: days(form.maturityDays) });
      setForm({ name: '', code: '', maturityDays: '' });
      onChanged();
    } catch (e) { onError(apiErrorMessage(e, 'Could not add the variety.')); } finally { setBusy(false); }
  };

  const save = async (id: string) => {
    setBusy(true);
    try {
      await riceVarietiesApi.update(id, { name: draft.name.trim(), code: draft.code.trim() || undefined, maturityDays: days(draft.maturityDays) });
      setEditing(null);
      onChanged();
    } catch (e) { onError(apiErrorMessage(e, 'Could not save the variety.')); } finally { setBusy(false); }
  };

  const toggle = async (v: Variety) => {
    setBusy(true);
    try { await riceVarietiesApi.update(v.id, { isActive: !v.isActive }); onChanged(); }
    catch (e) { onError(apiErrorMessage(e, 'Could not update the variety.')); } finally { setBusy(false); }
  };

  return <details className="action-panel" style={{ marginBottom: 16 }} open={varieties.length === 0}>
    <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>Rice varieties ({varieties.length})</summary>
    <p className="ua-hint" style={{ margin: '10px 0' }}>
      Farmers choose from these. Days to harvest lets the system work out the expected harvest date from the planting date, so harvest-relative tasks land on the right day for each variety. Varieties already used by crop cycles can be hidden but not deleted.
    </p>
    {varieties.length > 0 && <div style={{ overflowX: 'auto' }}><table className="data-table">
      <thead><tr><th>Name</th><th>Code</th><th>Days to harvest</th><th>Calendar</th><th>Crop cycles</th><th /></tr></thead>
      <tbody>{varieties.map((v) => editing === v.id ? <tr key={v.id}>
        <td><input className="input-field" aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
        <td><input className="input-field" aria-label="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></td>
        <td><input className="input-field" aria-label="Days to harvest" type="number" min={30} max={300} value={draft.maturityDays} onChange={(e) => setDraft({ ...draft, maturityDays: e.target.value })} /></td>
        <td colSpan={2} />
        <td style={{ whiteSpace: 'nowrap' }}><button className="btn-primary" disabled={busy} onClick={() => save(v.id)}>Save</button> <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button></td>
      </tr> : <tr key={v.id} style={v.isActive ? undefined : { opacity: 0.6 }}>
        <td>{v.name} {!v.isActive && <span className="badge badge-gold">Hidden</span>}</td>
        <td>{v.code || '—'}</td>
        <td>{v.maturityDays ?? '—'}</td>
        <td>{v.hasCalendar ? <span className="badge badge-green">Version {v.calendarVersion}</span> : <span className="ua-hint">Uses default</span>}</td>
        <td>{v.cropCycleCount ?? 0}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{canEdit && <>
          <button className="btn-secondary" disabled={busy} onClick={() => { setEditing(v.id); setDraft({ name: v.name, code: v.code ?? '', maturityDays: v.maturityDays?.toString() ?? '' }); }}>Edit</button>{' '}
          <button className="btn-secondary" disabled={busy} onClick={() => toggle(v)}>{v.isActive ? 'Hide' : 'Restore'}</button>
        </>}</td>
      </tr>)}</tbody>
    </table></div>}
    {canEdit && <div className="form-grid" style={{ marginTop: 12, alignItems: 'end' }}>
      <label className="form-label">Variety name<input className="input-field" placeholder="e.g. SARO 5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="form-label">Short code (optional)<input className="input-field" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
      <label className="form-label">Days from planting to harvest<input className="input-field" type="number" min={30} max={300} placeholder="e.g. 120" value={form.maturityDays} onChange={(e) => setForm({ ...form, maturityDays: e.target.value })} /></label>
      <button className="btn-primary" disabled={busy} onClick={add}>{busy ? 'Saving…' : 'Add variety'}</button>
    </div>}
  </details>;
}
