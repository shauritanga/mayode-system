'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import Modal from '@/components/Modal';

/** Shown over the dashboard until a user with a temporary password chooses their own. */
export default function ChangePasswordGate() {
  const { updateUser, clearAuth } = useAuthStore();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('The new password must be at least 8 characters.');
    if (next !== confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      updateUser({ mustChangePassword: false });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not change the password.'));
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    clearAuth();
    router.replace('/login');
  };

  return (
    <Modal
      title="Choose a new password"
      subtitle="You signed in with a temporary password. Set your own to continue."
      onClose={() => undefined}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={signOut}>Sign out</button>
          <button type="submit" form="change-password-form" className="btn-primary" disabled={busy || !current || !next || !confirm}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        {error && <div className="alert-box alert-danger" role="alert">{error}</div>}
        <label className="form-label">Temporary password (from your SMS)
          <input className="input-field" type={show ? 'text' : 'password'} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="form-label">New password (at least 8 characters)
          <input className="input-field" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="form-label">Confirm new password
          <input className="input-field" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text-3)' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
        </label>
      </form>
    </Modal>
  );
}
