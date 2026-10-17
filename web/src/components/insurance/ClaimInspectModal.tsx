'use client';
import { useState } from 'react';
import { insuranceApi, uploadsApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import Modal from '@/components/Modal';

/** The field inspection of a claim: what was seen, photos, the loss measured, and a recommendation to the insurer. */
export default function ClaimInspectModal({ claim, onClose, onSaved }: { claim: { id: string; claimedAmount: number; inspectionNotes?: string | null; assessedLossAmount?: number | null; recommendation?: string | null; inspectionPhotoUrls?: string[] }; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState(claim.inspectionNotes ?? '');
  const [loss, setLoss] = useState(claim.assessedLossAmount != null ? String(claim.assessedLossAmount) : '');
  const [rec, setRec] = useState(claim.recommendation ?? '');
  const [photos, setPhotos] = useState<string[]>(claim.inspectionPhotoUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setError('');
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push((await uploadsApi.upload(f)).data.url);
      setPhotos((p) => [...p, ...urls]);
    } catch (e) { setError(apiErrorMessage(e, 'Could not upload the photo.')); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      await insuranceApi.inspectClaim(claim.id, {
        inspectionNotes: notes.trim() || undefined, photoUrls: photos, assessedLossAmount: loss ? Number(loss) : undefined, recommendation: rec || undefined,
      });
      onSaved();
    } catch (e) { setError(apiErrorMessage(e, 'Could not save the inspection.')); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Claim inspection" subtitle={`Claimed TZS ${claim.claimedAmount.toLocaleString()}. The insurer sees this when deciding.`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || uploading || !notes.trim()} onClick={save}>{busy ? 'Saving…' : 'Save inspection'}</button></>}>
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        <label className="form-label">What you found in the field<textarea className="input-field" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="form-label">Loss you measured (TZS)<input className="input-field" type="number" min={0} value={loss} onChange={(e) => setLoss(e.target.value)} /></label>
        <label className="form-label">Your recommendation
          <select className="input-field" value={rec} onChange={(e) => setRec(e.target.value)}>
            <option value="">No recommendation</option><option value="APPROVE">Approve the claim</option><option value="REJECT">Reject the claim</option><option value="REINSPECT">Needs another visit</option>
          </select>
        </label>
        <label className="form-label">Photos
          <input className="input-field" type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} />
        </label>
        {uploading && <span style={{ fontSize: 12 }}>Uploading…</span>}
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {photos.map((u) => (
              <div key={u} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="Inspection" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8 }} />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((p) => p.filter((x) => x !== u))} style={{ position: 'absolute', top: 2, right: 2, border: 'none', borderRadius: 9999, width: 20, height: 20, cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
