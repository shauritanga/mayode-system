'use client';

import Link from 'next/link';
import { useState } from 'react';
import { publicTendersApi } from '@/lib/api';

const field = { display: 'grid', gap: 4, fontSize: 14 } as const;

/** Public sign-up for outside contractors and member groups. They are checked by an AMCOS officer before they can bid. */
export default function ContractorRegister() {
  const [f, setF] = useState({ kind: 'COMPANY', name: '', contactPerson: '', phone: '', password: '', email: '', tin: '', businessRegNo: '', memberNumber: '', equipmentCount: '0', yearsExperience: '0', equipment: '', payoutMethod: 'MOBILE_MONEY', payoutAccount: '', payoutName: '' });
  const [error, setError] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2 || f.phone.trim().length < 9 || f.password.length < 8) { setError('Enter your name, your phone number and a password of at least 8 characters.'); return; }
    setBusy(true); setError('');
    try {
      await publicTendersApi.registerContractor({
        kind: f.kind, name: f.name.trim(), contactPerson: f.contactPerson.trim() || undefined, phone: f.phone.trim(), password: f.password, email: f.email.trim() || undefined,
        tin: f.tin.trim() || undefined, businessRegNo: f.businessRegNo.trim() || undefined, memberNumber: f.memberNumber.trim() || undefined,
        equipmentCount: Number(f.equipmentCount) || 0, yearsExperience: Number(f.yearsExperience) || 0, equipment: f.equipment.trim() || undefined,
        payoutMethod: f.payoutMethod, payoutAccount: f.payoutAccount.trim() || undefined, payoutName: f.payoutName.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      const m = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(m) ? m.join('. ') : m || 'Could not register. Check your details and try again.');
    } finally { setBusy(false); }
  };
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 4 }}>Register as a contractor</h1>
      <p style={{ color: '#6b7280', marginTop: 0 }}>For companies, individuals and member groups who want to bid for canal, road and drainage maintenance on MAYOData. An AMCOS officer checks your details before you can bid. <Link href="/tenders">See open tenders</Link></p>
      {done ? (
        <div role="status" style={{ padding: 16, border: '1px solid #16a34a', borderRadius: 10 }}>
          <strong>You are registered.</strong>
          <p>An AMCOS officer will check your details and you will get an SMS when you are approved. Meanwhile you can <Link href="/login">sign in</Link> with your phone number and password to see tenders.</p>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          {error && <div role="alert" style={{ padding: 10, border: '1px solid #dc2626', borderRadius: 8, color: '#b91c1c' }}>{error}</div>}
          <label style={field}>I am a<select className="input-field" value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="COMPANY">Company</option><option value="INDIVIDUAL">Individual contractor</option><option value="MEMBER_GROUP">Member group of an AMCOS</option></select></label>
          <label style={field}>{f.kind === 'COMPANY' ? 'Company name' : f.kind === 'MEMBER_GROUP' ? 'Group name' : 'Your full name'} *<input className="input-field" value={f.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label style={field}>Contact person<input className="input-field" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={field}>Phone number *<input className="input-field" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+255…" /></label>
            <label style={field}>Password * (8+ characters)<input className="input-field" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} /></label>
          </div>
          <label style={field}>Email<input className="input-field" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
          {f.kind === 'COMPANY' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={field}>TIN<input className="input-field" value={f.tin} onChange={(e) => set('tin', e.target.value)} /></label>
            <label style={field}>Business registration number<input className="input-field" value={f.businessRegNo} onChange={(e) => set('businessRegNo', e.target.value)} /></label>
          </div>}
          {f.kind === 'MEMBER_GROUP' && <label style={field}>Member number of a registered member who stands behind the group *<input className="input-field" value={f.memberNumber} onChange={(e) => set('memberNumber', e.target.value)} /></label>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={field}>Machines you own<input className="input-field" type="number" min={0} value={f.equipmentCount} onChange={(e) => set('equipmentCount', e.target.value)} /></label>
            <label style={field}>Years of experience<input className="input-field" type="number" min={0} value={f.yearsExperience} onChange={(e) => set('yearsExperience', e.target.value)} /></label>
          </div>
          <label style={field}>Equipment you own<textarea className="input-field" rows={2} value={f.equipment} onChange={(e) => set('equipment', e.target.value)} placeholder="e.g. 2 excavators, 1 grader, 3 tippers" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <label style={field}>Get paid by<select className="input-field" value={f.payoutMethod} onChange={(e) => set('payoutMethod', e.target.value)}><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank</option></select></label>
            <label style={field}>Account / number<input className="input-field" value={f.payoutAccount} onChange={(e) => set('payoutAccount', e.target.value)} /></label>
            <label style={field}>Account name<input className="input-field" value={f.payoutName} onChange={(e) => set('payoutName', e.target.value)} /></label>
          </div>
          <button className="btn-primary" disabled={busy} type="submit">{busy ? 'Registering…' : 'Register'}</button>
        </form>
      )}
    </main>
  );
}
