'use client';
import { useState } from 'react';
import { opsApi } from '@/lib/api';
import { ErrorNote, useAction } from './ui';

/** One click that creates the Mayode role templates (sales, accounts, warehouse, farm) for this organisation. */
export default function InstallRoles() {
  const { busy, error, run } = useAction();
  const [done, setDone] = useState('');
  const go = async () => {
    const r = await run(() => opsApi.installRoles());
    if (r) {
      const d = r.data as { created: string[]; alreadyExisted: string[]; skippedBecauseYouDoNotHoldThesePermissions: string[] };
      setDone(`${d.created.length ? `Created: ${d.created.join(', ')}. ` : ''}${d.alreadyExisted.length ? `Already there: ${d.alreadyExisted.join(', ')}. ` : ''}${d.skippedBecauseYouDoNotHoldThesePermissions.length ? `Skipped (you lack the permissions): ${d.skippedBecauseYouDoNotHoldThesePermissions.join(', ')}.` : ''}`);
    }
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <button className="btn-secondary" disabled={busy} onClick={go}>{busy ? 'Setting up…' : 'Install Mayode roles'}</button>
      {done && <span style={{ fontSize: 12, marginLeft: 10, color: 'var(--neutral-500)' }}>{done}</span>}
      <ErrorNote message={error} />
    </div>
  );
}
