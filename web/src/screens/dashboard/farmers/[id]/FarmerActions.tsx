'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { api, irrigationApi, uploadsApi } from '@/lib/api';
import { Field, FormGrid, errMsg, titleCase, useApi } from '../../irrigation/ui';

const str = (v: any) => (v == null ? '' : String(v));

/** Edit the profile details an AMCOS admin may correct. The phone is the login and the ID follows the hectare, so neither is editable here. */
export function EditFarmerModal({ farmer, onClose, onSaved }: { farmer: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    firstName: str(farmer.firstName), lastName: str(farmer.lastName), gender: str(farmer.gender), dateOfBirth: str(farmer.dateOfBirth).slice(0, 10),
    idType: str(farmer.idType) || (farmer.nationalId ? 'NIDA' : ''), idNumber: str(farmer.idNumber) || str(farmer.nationalId), email: str(farmer.email), region: str(farmer.region), district: str(farmer.district), ward: str(farmer.ward), village: str(farmer.village),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    if (!v.firstName.trim() || !v.lastName.trim()) { setError('First and last name are required'); return; }
    setBusy(true); setError('');
    const body: Record<string, string> = {};
    (Object.keys(v) as (keyof typeof v)[]).forEach((k) => { if (v[k].trim()) body[k] = v[k].trim(); });
    // Only send the ID when it was changed, so editing other details never re-validates an older number.
    const idChanged = v.idType !== (str(farmer.idType) || (farmer.nationalId ? 'NIDA' : '')) || v.idNumber.trim() !== (str(farmer.idNumber) || str(farmer.nationalId));
    if (!idChanged) { delete body.idType; delete body.idNumber; }
    else if (!v.idType || !v.idNumber.trim()) { setError('Choose an ID type and enter its number'); setBusy(false); return; }
    try { await api.patch(`/farmers/${farmer.id}`, body); onSaved(); onClose(); } catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title="Edit farmer" onClose={() => !busy && onClose()} width="600px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <FormGrid>
          <Field label="First name"><input className="input-field" value={v.firstName} onChange={set('firstName')} autoFocus /></Field>
          <Field label="Last name"><input className="input-field" value={v.lastName} onChange={set('lastName')} /></Field>
          <Field label="Gender">
            <select className="input-field" value={v.gender} onChange={set('gender')}><option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select>
          </Field>
          <Field label="Date of birth"><input className="input-field" type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
          <Field label="ID type" hint="NIDA is optional: a voter ID or driver's license works instead">
            <select className="input-field" value={v.idType} onChange={set('idType')}><option value="">—</option><option value="NIDA">NIDA</option><option value="VOTER_ID">Voter ID</option><option value="DRIVER_LICENSE">Driver&apos;s license</option></select>
          </Field>
          <Field label="ID number"><input className="input-field" value={v.idNumber} onChange={set('idNumber')} disabled={!v.idType} /></Field>
          <Field label="Email"><input className="input-field" type="email" value={v.email} onChange={set('email')} /></Field>
          <Field label="Region"><input className="input-field" value={v.region} onChange={set('region')} /></Field>
          <Field label="District"><input className="input-field" value={v.district} onChange={set('district')} /></Field>
          <Field label="Ward"><input className="input-field" value={v.ward} onChange={set('ward')} /></Field>
          <Field label="Village"><input className="input-field" value={v.village} onChange={set('village')} /></Field>
        </FormGrid>
        <div className="muted" style={{ fontSize: 12 }}>Phone is the farmer&apos;s login and the farmer ID follows their hectare; use Transfer to change the hectare.</div>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}

/** Remove from the AMCOS (not erase): ends the hectare, keeps the history. Debts and loans block it until the admin confirms. */
export function RemoveFarmerModal({ farmer, onClose, onRemoved }: { farmer: any; onClose: () => void; onRemoved: () => void }) {
  const [reason, setReason] = useState('');
  const [blocked, setBlocked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (force: boolean) => {
    if (!reason.trim()) { setError('A reason is required'); return; }
    setBusy(true); setError('');
    try { await api.post(`/farmers/${farmer.id}/remove-from-amcos`, { reason: reason.trim(), force }); onRemoved(); }
    catch (e: any) {
      if (e?.response?.status === 409 && /owes|active loan/.test(errMsg(e))) setBlocked(errMsg(e)); else setError(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <Modal title="Remove from AMCOS" onClose={() => !busy && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary" style={{ background: 'var(--red-500)' }} onClick={() => submit(!!blocked)} disabled={busy}>
          {busy ? 'Working…' : blocked ? 'Remove anyway' : 'Remove farmer'}</button></>}>
      <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
        <div>
          <strong>{farmer.firstName} {farmer.lastName}</strong> will leave {farmer.mamcos?.name ?? 'the AMCOS'}. Their hectare is released and becomes free again.
          Payments, charges and history are kept; nothing is deleted.
        </div>
        {blocked && <div role="alert" style={{ color: 'var(--red-400)' }}>{blocked}</div>}
        <Field label="Reason" error={error}><textarea className="input-field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      </div>
    </Modal>
  );
}

const METHODS: [string, string][] = [
  ['VILLAGE_LETTER', 'Village / street government letter (Barua ya Utambulisho)'],
  ['LOCAL_VOTER_ID', 'Local voter ID'],
  ['GUARANTOR', 'Block or Canal Chairman guarantor'],
];

/** Tier 3: vouch for a farmer who has no NIDA, voter ID or driver's license. */
export function LocalVerificationModal({ farmer, onClose, onSaved }: { farmer: any; onClose: () => void; onSaved: () => void }) {
  const [method, setMethod] = useState('VILLAGE_LETTER');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [guarantorFarmerId, setGuarantor] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const leaders = useApi<any>(method === 'GUARANTOR' ? () => irrigationApi.leadership({ status: 'ACTIVE', pageSize: 200 }) : null, [method]);
  const chairmen: any[] = (leaders.data?.data ?? []).filter((l: any) => l.leader?.id !== farmer.id);

  const save = async () => {
    setError('');
    if (method === 'VILLAGE_LETTER' && !file) { setError('Attach a photo of the letter'); return; }
    if (method === 'LOCAL_VOTER_ID' && !reference.trim()) { setError('Enter the local voter ID number'); return; }
    if (method === 'GUARANTOR' && !guarantorFarmerId) { setError('Choose the chairman who vouches for this farmer'); return; }
    setBusy(true);
    try {
      const letterDocumentUrl = method === 'VILLAGE_LETTER' && file ? (await uploadsApi.upload(file)).data.url : undefined;
      await api.post(`/farmers/${farmer.id}/local-verifications`, {
        method, reference: reference.trim() || undefined, letterDocumentUrl,
        guarantorFarmerId: method === 'GUARANTOR' ? guarantorFarmerId : undefined, notes: notes.trim() || undefined,
      });
      onSaved(); onClose();
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title="Local verification" subtitle="For a farmer with no NIDA, voter ID or driver's license." onClose={() => !busy && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Record verification'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="How was this farmer vouched for?">
          <select className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        {method === 'VILLAGE_LETTER' && <>
          <Field label="Letter photo"><input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <Field label="Letter reference (optional)"><input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </>}
        {method === 'LOCAL_VOTER_ID' && <Field label="Local voter ID number"><input className="input-field" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
        {method === 'GUARANTOR' && (
          <Field label="Block / Canal Chairman" hint={leaders.loading ? 'Loading chairmen…' : leaders.error ? 'Could not load the chairmen list' : undefined}>
            <select className="input-field" value={guarantorFarmerId} onChange={(e) => setGuarantor(e.target.value)}>
              <option value="">Choose…</option>
              {chairmen.map((l: any) => <option key={l.id} value={l.leader.id}>{l.leader.name} · {titleCase(l.position)} {l.block?.code ?? l.canal?.code ?? ''}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notes (optional)"><input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}
