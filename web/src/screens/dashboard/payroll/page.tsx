'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import MoneyInput from '@/components/MoneyInput';
import { MoneyAccountSelect } from '@/screens/dashboard/accounting/controls';
import { payrollApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, Tabs, errMsg, fmtDate, titleCase, todayISO, useApi, useCan,
} from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const monthLabel = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const thisMonth = () => todayISO().slice(0, 7);
const TIER: Record<string, string> = { CORE_ADMIN: 'Tier 1 · Core administration', FIELD_LEADERSHIP: 'Tier 2 · Field leadership and water operations', SUPPORT: 'Tier 3 · Support and auxiliary staff' };
const WAGE: Record<string, string> = { MONTHLY: 'Fixed monthly', DAILY: 'Daily rate', PIECE: 'Per piece' };
const CENTER: Record<string, string> = { ADMIN_OVERHEAD: 'Administrative overhead', FACILITY_MAINTENANCE: 'Facility maintenance', SECURITY: 'Security fund', IRRIGATION_OPS: 'Irrigation operations', WAREHOUSE_OPS: 'Warehouse operations' };
const COMPLIANCE: Record<string, string> = { NONE: '', WATER_LOG: 'Pay depends on the water days they log', CHAIRMAN_LOG: 'Pay depends on the water entries they make' };
const payText = (p: any) => (p.wageType === 'MONTHLY' ? `${tzs(p.monthlySalary)} a month` : p.wageType === 'DAILY' ? `${tzs(p.rate)} a day` : `${tzs(p.rate)} per ${p.pieceUnit ?? 'piece'}`);
const STEPS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED'];
const STEP_LABEL: Record<string, string> = { DRAFT: 'Compiled', SUBMITTED: 'Reconciled by the Accountant', APPROVED: 'Approved by the Manager', POSTED: 'Paid' };

// ───────────────────────── people ─────────────────────────

function PayeeForm({ payee, titles, onClose, onSaved }: { payee?: any; titles: any[]; onClose: () => void; onSaved: (m: string) => void }) {
  const editing = !!payee;
  const candidates = useApi<any[]>(editing ? null : () => payrollApi.candidates(), []);
  const [mode, setMode] = useState<'login' | 'worker'>('worker');
  const [userId, setUserId] = useState(''); const [fullName, setFullName] = useState(payee?.name ?? ''); const [phone, setPhone] = useState(payee?.phone ?? '');
  const [idType, setIdType] = useState('NIDA'); const [idNumber, setIdNumber] = useState(payee?.idNumber ?? '');
  const [titleId, setTitleId] = useState(payee?.titleId ?? '');
  const title = titles.find((t) => t.id === titleId);
  const [wageType, setWageType] = useState<string>(payee?.wageType ?? '');
  const wt = wageType || title?.wageType || 'MONTHLY';
  const [salary, setSalary] = useState(payee && payee.wageType === 'MONTHLY' ? String(payee.monthlySalary) : ''); const [rate, setRate] = useState(payee?.rate != null ? String(payee.rate) : '');
  const [pieceUnit, setPieceUnit] = useState(payee?.pieceUnit ?? '');
  const [payoutMethod, setPayoutMethod] = useState(payee?.payoutMethod ?? 'MOBILE_MONEY'); const [payoutAccount, setPayoutAccount] = useState(payee?.payoutAccount ?? ''); const [payoutName, setPayoutName] = useState(payee?.payoutName ?? '');
  const [startDate, setStartDate] = useState(todayISO()); const [contractEnd, setContractEnd] = useState(payee?.contractEnd ? String(payee.contractEnd).slice(0, 10) : '');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const pick = (id: string) => { setUserId(id); const c = candidates.data?.find((x) => x.userId === id); if (c?.suggestedTitle && !titleId) { const t = titles.find((x) => x.name === c.suggestedTitle); if (t) setTitleId(t.id); } };
  const save = async () => {
    setError('');
    if (!editing && !titleId) { setError('Choose the job title'); return; }
    if (!editing && mode === 'login' && !userId) { setError('Choose the staff member'); return; }
    if (!editing && mode === 'worker' && (fullName.trim().length < 3 || phone.trim().length < 9 || idNumber.trim().length < 4)) { setError('Enter the worker’s full name, phone number and an ID number.'); return; }
    if (wt === 'MONTHLY' && !(Number(salary) > 0)) { setError('Enter the monthly salary.'); return; }
    if (wt !== 'MONTHLY' && !(Number(rate) > 0)) { setError(wt === 'DAILY' ? 'Enter the daily rate.' : 'Enter the price per unit.'); return; }
    if (wt === 'PIECE' && !pieceUnit.trim()) { setError('Say what one unit is (a bag, a load).'); return; }
    setSaving(true);
    try {
      const pay = { wageType: wt, ...(wt === 'MONTHLY' ? { monthlySalary: Number(salary) } : { rate: Number(rate) }), ...(wt === 'PIECE' ? { pieceUnit: pieceUnit.trim() } : {}), payoutMethod, payoutAccount: payoutAccount.trim() || undefined, payoutName: payoutName.trim() || undefined, contractEnd: contractEnd || undefined };
      if (editing) { await payrollApi.updatePayee(payee.id, { ...pay, ...(titleId ? { titleId } : {}) }); onSaved(`${payee.name} updated. Changed pay or payout details need a Manager to verify them again.`); }
      else {
        await payrollApi.addPayee({ ...pay, titleId, startDate, ...(mode === 'login' ? { userId } : { fullName: fullName.trim(), phone: phone.trim(), idType, idNumber: idNumber.trim() }) });
        onSaved('Added. A Manager must verify them before they can be paid.');
      }
    } catch (e) { setError(errMsg(e, 'Could not save.')); setSaving(false); }
  };
  return (
    <Modal title={editing ? `Change ${payee.name}` : 'Add to the payroll'} subtitle={editing ? payee.workerCode : 'Staff with a login, or a support worker without one.'} onClose={() => !saving && onClose()} width="640px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save' : 'Add'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        {!editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={mode === 'worker' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('worker')}>Support worker (no login)</button>
            <button type="button" className={mode === 'login' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('login')}>Staff or leader (has a login)</button>
          </div>
        )}
        {!editing && mode === 'login' && (
          <Field label="Staff member *"><select className="input-field" value={userId} onChange={(e) => pick(e.target.value)}><option value="">Choose…</option>{candidates.data?.map((c) => <option key={c.userId} value={c.userId}>{c.name} · {c.phone}{c.office ? ` · ${c.office}` : ''}</option>)}</select></Field>
        )}
        {!editing && mode === 'worker' && (
          <>
            <Field label="Full name *"><input className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Phone number *" hint="Used for mobile money and the pay SMS. Must be unique."><input className="input-field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" /></Field>
              <Field label="ID *" hint="So the worker can be checked: ID type and number."><span style={{ display: 'flex', gap: 6 }}>
                <select className="input-field" style={{ width: 130 }} value={idType} onChange={(e) => setIdType(e.target.value)}><option value="NIDA">NIDA</option><option value="VOTER_ID">Voter ID</option><option value="VILLAGE_LETTER">Village letter</option><option value="OTHER">Other</option></select>
                <input className="input-field" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} /></span></Field>
            </div>
          </>
        )}
        <Field label={editing ? 'Job title (leave to keep)' : 'Job title *'} hint={title ? `${TIER[title.tier]} · ${CENTER[title.costCenter]} · ${WAGE[title.wageType]}${title.compliance !== 'NONE' ? ` · ${COMPLIANCE[title.compliance]}` : ''}` : undefined}>
          <select className="input-field" value={titleId} onChange={(e) => { setTitleId(e.target.value); setWageType(''); }}><option value="">{editing ? payee.title : 'Choose…'}</option>{titles.filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Paid"><select className="input-field" value={wt} onChange={(e) => setWageType(e.target.value)}>{Object.entries(WAGE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {wt === 'MONTHLY' ? <Field label="Monthly salary (TZS) *"><MoneyInput value={salary} onChange={(e) => setSalary(e.target.value)} /></Field>
            : <Field label={wt === 'DAILY' ? 'Daily rate (TZS) *' : 'Price per unit (TZS) *'}><MoneyInput value={rate} onChange={(e) => setRate(e.target.value)} /></Field>}
          {wt === 'PIECE' && <Field label="One unit is *"><input className="input-field" value={pieceUnit} onChange={(e) => setPieceUnit(e.target.value)} placeholder="bag, load…" /></Field>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Paid through"><select className="input-field" value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank (CRDB)</option></select></Field>
          <Field label={payoutMethod === 'BANK' ? 'Account number *' : 'Wallet number'} hint={payoutMethod === 'MOBILE_MONEY' ? 'Leave empty to use the phone number.' : undefined}><input className="input-field" value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} /></Field>
          <Field label="Account name"><input className="input-field" value={payoutName} onChange={(e) => setPayoutName(e.target.value)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!editing && <Field label="Contract starts"><input type="date" className="input-field" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>}
          <Field label="Contract ends" hint="Leave empty if open-ended."><input type="date" className="input-field" value={contractEnd} min={startDate} onChange={(e) => setContractEnd(e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function TitlesDialog({ titles, onClose, onChanged }: { titles: any[]; onClose: () => void; onChanged: () => void }) {
  const [f, setF] = useState({ name: '', tier: 'SUPPORT', costCenter: 'FACILITY_MAINTENANCE', wageType: 'MONTHLY', compliance: 'NONE' });
  const [error, setError] = useState('');
  const add = async () => {
    if (f.name.trim().length < 2) { setError('Give the title a name.'); return; }
    try { await payrollApi.createTitle({ ...f, name: f.name.trim() }); setF({ ...f, name: '' }); setError(''); onChanged(); } catch (e) { setError(errMsg(e, 'Could not add the title.')); }
  };
  return (
    <Modal title="Job titles" subtitle="Each title sets the tier, the budget line and how the person is paid." onClose={onClose} width="760px" footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Title</th><th>Tier</th><th>Budget line</th><th>Paid</th><th>Checked against</th></tr></thead><tbody>
          {titles.map((t) => <tr key={t.id}><td>{t.name}</td><td>{TIER[t.tier].split(' · ')[0]}</td><td>{CENTER[t.costCenter]}</td><td>{WAGE[t.wageType]}</td><td className="muted" style={{ fontSize: 12 }}>{t.compliance === 'NONE' ? '—' : COMPLIANCE[t.compliance]}</td></tr>)}
        </tbody></table></div>
        <strong style={{ fontSize: 13 }}>Add a title</strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 8 }}>
          <input className="input-field" placeholder="e.g. Pump Attendant" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className="input-field" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value })}>{Object.entries(TIER).map(([v, l]) => <option key={v} value={v}>{l.split(' · ')[0]}</option>)}</select>
          <select className="input-field" value={f.costCenter} onChange={(e) => setF({ ...f, costCenter: e.target.value })}>{Object.entries(CENTER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className="input-field" value={f.wageType} onChange={(e) => setF({ ...f, wageType: e.target.value })}>{Object.entries(WAGE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="input-field" style={{ maxWidth: 300 }} value={f.compliance} onChange={(e) => setF({ ...f, compliance: e.target.value })}><option value="NONE">No compliance check</option><option value="WATER_LOG">Gate opener: water days logged</option><option value="CHAIRMAN_LOG">Chairman: water entries made</option></select>
          <button type="button" className="btn-primary" onClick={add}>Add title</button>
        </div>
      </div>
    </Modal>
  );
}

function History({ payee, onClose }: { payee: any; onClose: () => void }) {
  const { data, loading, error } = useApi<any>(() => payrollApi.history(payee.id), [payee.id]);
  return (
    <Modal title={`Payment history · ${payee.name}`} subtitle={payee.workerCode} onClose={onClose} width="640px" footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <LoadError message={error} />
      {loading || !data ? <TableSkeleton rows={3} cols={3} /> : !data.payments.length ? <Empty title="Nothing paid yet" /> : (
        <><table className="data-table"><thead><tr><th>Month</th><th>How it was worked out</th><th className="num">Paid</th></tr></thead><tbody>
          {data.payments.map((p: any) => <tr key={p.period}><td>{monthLabel(p.period)}<div className="muted" style={{ fontSize: 11 }}>{fmtDate(p.paidOn)} · {titleCase(p.payMethod)}</div></td><td style={{ fontSize: 13 }}>{p.basis ?? p.title}{p.deductions ? <div className="muted" style={{ fontSize: 11 }}>Deductions {tzs(p.deductions)}</div> : null}</td><td className="num">{tzs(p.net)}</td></tr>)}
        </tbody></table><div style={{ marginTop: 8, textAlign: 'right', fontWeight: 700 }}>Total paid {tzs(data.totalPaid)}</div></>
      )}
    </Modal>
  );
}

function People() {
  const can = useCan(); const me = useAuthStore((s) => s.user);
  const [refresh, setRefresh] = useState(0);
  const people = useApi<any>(() => payrollApi.payees(), [refresh]);
  const titles = useApi<any>(() => payrollApi.titles(), [refresh]);
  const [form, setForm] = useState<{ payee?: any } | null>(null); const [showTitles, setShowTitles] = useState(false); const [history, setHistory] = useState<any>(null); const [toggling, setToggling] = useState<any>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const rows: any[] = people.data?.data ?? []; const s = people.data?.summary;
  const act = async (fn: () => Promise<any>, ok: string) => { setMessage(null); try { await fn(); setMessage({ tone: 'success', text: ok }); setRefresh((n) => n + 1); } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'That did not work.') }); } };
  return (
    <div>
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      <LoadError message={people.error} onRetry={people.reload} />
      {s && <div className="metric-grid" style={{ marginBottom: 14 }}>
        <StatCard label="People on the payroll" value={s.people} hint={`Tier 1: ${s.tiers.CORE_ADMIN} · Tier 2: ${s.tiers.FIELD_LEADERSHIP} · Tier 3: ${s.tiers.SUPPORT}`} />
        <StatCard label="Fixed monthly salaries" value={tzs(s.monthlyTotal)} hint="Daily and piece-rate pay depends on the month" />
        <StatCard label="Waiting for a Manager" value={s.unverified} tone={s.unverified ? 'warn' : 'good'} hint="Not paid until verified" />
      </div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {can('payroll', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setForm({})}>Add to the payroll</button>}
        <button type="button" className="btn-secondary" onClick={() => setShowTitles(true)}>Job titles</button>
      </div>
      {people.loading && !people.data ? <TableSkeleton cols={6} /> : !rows.length ? <Empty title="Nobody is on the payroll yet" hint="Add staff, leaders, cleaners, guards and loaders. Every worker gets a digital ID and a verified profile: no cash payouts off the books." /> : (
        (['CORE_ADMIN', 'FIELD_LEADERSHIP', 'SUPPORT'] as const).map((tier) => {
          const mine = rows.filter((r) => r.tier === tier);
          if (!mine.length) return null;
          return (
            <section key={tier} className="table-panel" style={{ marginBottom: 14 }}>
              <div className="section-toolbar"><strong>{TIER[tier]}</strong><span className="muted" style={{ fontSize: 12 }}>{mine.length} person(s)</span></div>
              <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>ID</th><th>Name</th><th>Title</th><th>Pay</th><th>Budget line</th><th>Contract</th><th>Status</th><th /></tr></thead><tbody>
                {mine.map((p) => (
                  <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.55 }}>
                    <td style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.workerCode}</td>
                    <td><strong>{p.name}</strong><div className="muted" style={{ fontSize: 11 }}>{p.phone ?? '—'} · {p.hasLogin ? 'has a login' : 'no login'}</div></td>
                    <td>{p.title}{p.compliance !== 'NONE' && <div className="muted" style={{ fontSize: 11 }}>{COMPLIANCE[p.compliance]}</div>}</td>
                    <td>{payText(p)}<div className="muted" style={{ fontSize: 11 }}>{titleCase(p.payoutMethod)} {p.payoutAccount ?? ''}</div></td>
                    <td>{CENTER[p.costCenter]}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{fmtDate(p.startDate)} – {p.contractEnd ? fmtDate(p.contractEnd) : 'open'}{p.contractEnded && <div style={{ color: '#b45309' }}>Contract ended</div>}</td>
                    <td>{!p.isActive ? <span className="badge badge-gray">Stopped</span> : p.verified ? <span className="badge badge-green">Verified</span> : <span className="badge badge-gold">Waiting for Manager</span>}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {!p.verified && p.isActive && can('payroll_approval', 'EDIT') && (p.createdById === me?.id ? <span className="muted" style={{ fontSize: 12 }}>Someone else must verify</span> : <button type="button" className="btn-primary" onClick={() => act(() => payrollApi.verifyPayee(p.id), `${p.name} is verified.`)}>Verify</button>)}{' '}
                      {can('payroll', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setForm({ payee: p })}>Change</button>}{' '}
                      <button type="button" className="btn-secondary" onClick={() => setHistory(p)}>History</button>{' '}
                      {can('payroll', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setToggling(p)}>{p.isActive ? 'Stop' : 'Resume'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody></table></div>
            </section>
          );
        })
      )}
      {form && <PayeeForm payee={form.payee} titles={titles.data?.data ?? []} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setMessage({ tone: 'success', text: m }); setRefresh((n) => n + 1); }} />}
      {showTitles && <TitlesDialog titles={titles.data?.data ?? []} onClose={() => setShowTitles(false)} onChanged={() => setRefresh((n) => n + 1)} />}
      {history && <History payee={history} onClose={() => setHistory(null)} />}
      {toggling && <ConfirmDialog title={toggling.isActive ? `Stop paying ${toggling.name}?` : `Pay ${toggling.name} again?`} confirmLabel={toggling.isActive ? 'Stop paying' : 'Resume'} danger={toggling.isActive}
        body={toggling.isActive ? 'They are left out of new pay runs. Past runs and their history are kept.' : 'They are included in new pay runs again.'}
        onConfirm={async () => { await payrollApi.updatePayee(toggling.id, { isActive: !toggling.isActive }); setMessage({ tone: 'success', text: 'Payroll updated.' }); setRefresh((n) => n + 1); }} onClose={() => setToggling(null)} />}
    </div>
  );
}

// ───────────────────────── attendance and output ─────────────────────────

function Attendance() {
  const can = useCan();
  const [period, setPeriod] = useState(thisMonth()); const [date, setDate] = useState(todayISO()); const [picked, setPicked] = useState<string[]>([]); const [refresh, setRefresh] = useState(0);
  const people = useApi<any>(() => payrollApi.payees(), []);
  const att = useApi<any>(() => payrollApi.attendance({ period }), [period, refresh]);
  const out = useApi<any>(() => payrollApi.outputs({ period }), [period, refresh]);
  const daily = (people.data?.data ?? []).filter((p: any) => p.isActive && p.wageType === 'DAILY');
  const piece = (people.data?.data ?? []).filter((p: any) => p.isActive && p.wageType === 'PIECE');
  const [outForm, setOutForm] = useState({ payeeId: '', date: todayISO(), quantity: '', note: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const act = async (fn: () => Promise<any>, ok: string) => { setMessage(null); try { await fn(); setMessage({ tone: 'success', text: ok }); setRefresh((n) => n + 1); } catch (e) { setMessage({ tone: 'error', text: errMsg(e, 'That did not work.') }); } };
  const canRecord = can('payroll_attendance', 'CREATE');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {message && <Notice tone={message.tone} onDismiss={() => setMessage(null)}>{message.text}</Notice>}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Supervisors record the days daily-wage workers worked and the output of piece-rate workers. The Accountant’s pay run is built from these, so nobody is paid for days nobody recorded.</p>
      <section className="table-panel" style={{ padding: 16 }}>
        <strong>Daily workers: who was present</strong>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', margin: '10px 0' }}>
          <Field label="Day"><input type="date" className="input-field" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          {canRecord && <button type="button" className="btn-primary" disabled={!picked.length} onClick={() => act(async () => { await payrollApi.markDay({ date, payeeIds: picked }); setPicked([]); }, `${picked.length} marked present on ${fmtDate(date)}.`)}>Mark {picked.length || ''} present</button>}
        </div>
        {!daily.length ? <div className="muted" style={{ fontSize: 13 }}>No daily-wage workers yet.</div> : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {daily.map((p: any) => <label key={p.id} className="badge badge-gray" style={{ cursor: 'pointer', padding: '6px 10px' }}><input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))} /> {p.name} <span className="muted">· {p.workerCode}</span></label>)}</div>}
      </section>
      {piece.length > 0 && canRecord && (
        <section className="table-panel" style={{ padding: 16 }}>
          <strong>Piece-rate workers: output</strong>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1.3fr auto', gap: 8, margin: '10px 0' }}>
            <select className="input-field" aria-label="Worker" value={outForm.payeeId} onChange={(e) => setOutForm({ ...outForm, payeeId: e.target.value })}><option value="">Worker…</option>{piece.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.pieceUnit})</option>)}</select>
            <input type="date" className="input-field" aria-label="Day" value={outForm.date} max={todayISO()} onChange={(e) => setOutForm({ ...outForm, date: e.target.value })} />
            <input className="input-field" aria-label="Quantity" inputMode="decimal" placeholder="Quantity" value={outForm.quantity} onChange={(e) => setOutForm({ ...outForm, quantity: e.target.value.replace(/[^\d.]/g, '') })} />
            <input className="input-field" aria-label="Note" placeholder="Note (optional)" value={outForm.note} onChange={(e) => setOutForm({ ...outForm, note: e.target.value })} />
            <button type="button" className="btn-primary" disabled={!outForm.payeeId || !Number(outForm.quantity)} onClick={() => act(async () => { await payrollApi.addOutput({ payeeId: outForm.payeeId, date: outForm.date, quantity: Number(outForm.quantity), note: outForm.note || undefined }); setOutForm({ ...outForm, quantity: '', note: '' }); }, 'Output recorded.')}>Record</button>
          </div>
        </section>
      )}
      <div><Field label="Month"><input type="month" className="input-field" style={{ maxWidth: 200 }} value={period} max={thisMonth()} onChange={(e) => setPeriod(e.target.value)} /></Field></div>
      <LoadError message={att.error || out.error} onRetry={() => setRefresh((n) => n + 1)} />
      <section className="table-panel">
        <div className="section-toolbar"><strong>Days recorded in {monthLabel(period)}</strong></div>
        {!att.data?.data.length ? <Empty title="No days recorded" /> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Day</th><th>Worker</th><th>Worked</th><th /></tr></thead><tbody>
          {att.data.data.map((a: any) => <tr key={a.id}><td>{fmtDate(a.date)}</td><td>{a.name} <span className="muted">· {a.workerCode}</span></td><td>{a.fraction === 1 ? 'Whole day' : 'Half day'}</td>
            <td style={{ textAlign: 'right' }}>{can('payroll_attendance', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => act(() => payrollApi.removeAttendance(a.id), 'Entry removed.')}>Remove</button>}</td></tr>)}
        </tbody></table></div>}
      </section>
      {out.data?.data.length > 0 && <section className="table-panel">
        <div className="section-toolbar"><strong>Output recorded in {monthLabel(period)}</strong></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Day</th><th>Worker</th><th className="num">Quantity</th><th>Note</th></tr></thead><tbody>
          {out.data.data.map((o: any) => <tr key={o.id}><td>{fmtDate(o.date)}</td><td>{o.name}</td><td className="num">{o.quantity} {o.unit}</td><td className="muted">{o.note ?? '—'}</td></tr>)}
        </tbody></table></div>
      </section>}
    </div>
  );
}

// ───────────────────────── pay runs ─────────────────────────

function Payslip({ runId, lineId, onClose }: { runId: string; lineId: string; onClose: () => void }) {
  const { data: s, loading, error } = useApi<any>(() => payrollApi.payslip(runId, lineId), [runId, lineId]);
  return (
    <Modal title="Payslip" onClose={onClose} width="520px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Close</button><button type="button" className="btn-primary" onClick={() => window.print()}>Print</button></>}>
      <LoadError message={error} />
      {loading || !s ? <TableSkeleton rows={4} cols={2} /> : (
        <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
          <div><strong style={{ fontSize: 16 }}>{s.amcos}</strong><div className="muted">Payslip for {monthLabel(s.period)}</div></div>
          <div><strong>{s.name}</strong> <span className="muted">· {s.workerCode}</span><div className="muted">{s.title} · {s.costCenter}</div></div>
          <table className="data-table"><tbody>
            <tr><td>Pay<div className="muted" style={{ fontSize: 11 }}>{s.basis}</div></td><td className="num">{tzs(s.gross)}</td></tr>
            <tr><td>Deductions{s.deductionNote ? ` (${s.deductionNote})` : ''}</td><td className="num">{s.deductions ? `− ${tzs(s.deductions)}` : '—'}</td></tr>
            <tr><td><strong>Paid to you</strong></td><td className="num"><strong>{tzs(s.net)}</strong></td></tr>
          </tbody></table>
          <div className="muted" style={{ fontSize: 12 }}>{s.status === 'POSTED' ? `Paid ${fmtDate(s.paidOn)} by ${titleCase(s.payMethod)}.` : 'Not paid yet.'}</div>
        </div>
      )}
    </Modal>
  );
}

function EditLine({ runId, line, onClose, onSaved }: { runId: string; line: any; onClose: () => void; onSaved: () => void }) {
  const [gross, setGross] = useState(String(line.gross)); const [deductions, setDeductions] = useState(String(line.deductions)); const [note, setNote] = useState(line.deductionNote ?? '');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setError('');
    try { await payrollApi.updateLine(runId, line.id, { gross: Number(gross), deductions: Number(deductions) || 0, deductionNote: note }); onSaved(); } catch (e) { setError(errMsg(e, 'Could not save.')); setSaving(false); }
  };
  return (
    <Modal title={`Adjust ${line.name}`} subtitle={line.basis ?? line.title} onClose={onClose} width="460px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={save}>Save</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Pay (TZS)" hint="Change only for a part month or a bonus; say why below."><MoneyInput value={gross} onChange={(e) => setGross(e.target.value)} /></Field>
        <Field label="Deductions (TZS)"><MoneyInput value={deductions} onChange={(e) => setDeductions(e.target.value)} /></Field>
        <Field label="Reason or what the deduction is for"><input className="input-field" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ApproveDialog({ run, onClose, onDone }: { run: any; onClose: () => void; onDone: (m: string) => void }) {
  const [method, setMethod] = useState('MOBILE_MONEY'); const [account, setAccount] = useState(''); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError('');
    try { await payrollApi.approve(run.id, { payMethod: method, cashAccountId: account || undefined, note: note.trim() || undefined }); onDone('Approved. The Accountant can now pay it.'); } catch (e) { setError(errMsg(e, 'Could not approve.')); setBusy(false); }
  };
  return (
    <Modal title={`Approve ${monthLabel(run.period)}`} subtitle={`${tzs(run.totalNet)} to ${run.lines.length} people`} onClose={() => !busy && onClose()} width="520px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={go}>{busy ? 'Checking…' : 'Approve payment'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="muted" style={{ fontSize: 13 }}>You are confirming the run is right and the money is there. The account’s balance must cover {tzs(run.totalNet)}.</div>
        <Field label="Paid through"><select className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}><option value="MOBILE_MONEY">Mobile money</option><option value="BANK">Bank</option><option value="CASH">Cash</option></select></Field>
        <MoneyAccountSelect label="Paid from" value={account} onChange={setAccount} defaultKind={method as 'CASH' | 'BANK' | 'MOBILE_MONEY'} hint="The account the salaries will leave from." />
        <Field label="Note (optional)"><input className="input-field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function PayDialog({ run, onClose, onDone }: { run: any; onClose: () => void; onDone: (m: string) => void }) {
  const [paidOn, setPaidOn] = useState(todayISO()); const [notify, setNotify] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setError('');
    try { const r: any = (await payrollApi.post(run.id, { paidOn, notify })).data; onDone(`Paid and booked.${r.notified ? ` ${r.notified.sent} text(s) sent${r.notified.failed ? `, ${r.notified.failed} could not be sent` : ''}.` : ''}`); } catch (e) { setError(errMsg(e, 'Could not pay.')); setBusy(false); }
  };
  return (
    <Modal title={`Pay ${monthLabel(run.period)}`} subtitle={`${tzs(run.totalNet)} by ${titleCase(run.payMethod)}`} onClose={() => !busy && onClose()} width="480px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={go}>{busy ? 'Booking…' : 'Record payment'}</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="muted" style={{ fontSize: 13 }}>Send the money to each person’s bank account or wallet, then record it here. This books each budget line’s wages and cannot be undone. The Manager’s approval covered {tzs(run.available)} in the account.</div>
        <Field label="Paid on"><input type="date" className="input-field" value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <label className="form-label" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Text each person their pay</label>
      </div>
    </Modal>
  );
}

function RunDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const can = useCan();
  const { data: run, loading, error, reload } = useApi<any>(() => payrollApi.run(id), [id]);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null); const [skipped, setSkipped] = useState<any[]>([]);
  const [dialog, setDialog] = useState<any>(null);
  const done = (text: string) => { setDialog(null); setMsg({ tone: 'success', text }); reload(); onChanged(); };
  const act = async (fn: () => Promise<any>, ok: string) => { setMsg(null); try { const r = await fn(); if (r?.data?.skipped) setSkipped(r.data.skipped); setMsg({ tone: 'success', text: ok }); reload(); onChanged(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e, 'That did not work.') }); } };
  if (loading && !run) return <TableSkeleton cols={4} />;
  if (error || !run) return <><LoadError message={error || 'Pay run not found'} onRetry={reload} /><button type="button" className="btn-secondary" onClick={onBack}>Back</button></>;
  const step = STEPS.indexOf(run.status);
  const edit = can('payroll', 'EDIT'); const approve = can('payroll_approval', 'EDIT');
  return (
    <div>
      <button type="button" className="btn-secondary" onClick={onBack} style={{ marginBottom: 12 }}>← All pay runs</button>
      {msg && <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Notice>}
      <section className="table-panel" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0 }}>{monthLabel(run.period)}</h2><div className="muted" style={{ fontSize: 13 }}>{run.lines.length} people · {tzs(run.totalGross)} gross · {tzs(run.totalNet)} to pay{run.totalDeductions ? ` · ${tzs(run.totalDeductions)} held back` : ''}</div></div>
          <ol style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }} aria-label="Stage">
            {STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} className={`badge ${i < step ? 'badge-blue' : i === step ? 'badge-green' : 'badge-gray'}`}>{i + 1}. {STEP_LABEL[s]}</li>)}
          </ol>
        </div>
        {run.approveNote && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{run.approveNote}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {run.status === 'DRAFT' && edit && <button type="button" className="btn-secondary" onClick={() => act(() => payrollApi.recompile(id), 'Rebuilt from the latest attendance, output and water logs.')}>Rebuild from the records</button>}
          {run.status === 'DRAFT' && edit && <button type="button" className="btn-primary" disabled={run.overBudget} title={run.overBudget ? 'A budget line is over its limit' : ''} onClick={() => act(() => payrollApi.submit(id), 'Submitted to the Manager.')}>Submit to the Manager</button>}
          {run.status === 'DRAFT' && can('payroll', 'DELETE') && <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'delete' })}>Delete draft</button>}
          {run.status === 'SUBMITTED' && approve && <button type="button" className="btn-primary" onClick={() => setDialog({ kind: 'approve' })}>Check the money and approve</button>}
          {(run.status === 'SUBMITTED' || run.status === 'APPROVED') && approve && <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'return' })}>Send back</button>}
          {run.status === 'APPROVED' && edit && <button type="button" className="btn-primary" onClick={() => setDialog({ kind: 'pay' })}>Record the payment</button>}
        </div>
        {run.status === 'SUBMITTED' && !approve && <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Waiting for the Manager to check the money and approve.</div>}
      </section>

      {skipped.length > 0 && <Notice tone="error">Left out: {skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}</Notice>}
      <div className="metric-grid" style={{ marginBottom: 14 }}>
        {run.tiers.map((t: any) => <StatCard key={t.tier} label={TIER[t.tier].split(' · ')[0]} value={tzs(t.gross)} hint={`${t.people} person(s)`} />)}
      </div>
      <section className="table-panel" style={{ marginBottom: 14 }}>
        <div className="section-toolbar"><strong>By budget line</strong></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Budget line</th><th className="num">This run</th><th className="num">Monthly limit</th><th /></tr></thead><tbody>
          {run.costCenters.map((c: any) => <tr key={c.costCenter}><td>{c.label}</td><td className="num">{tzs(c.gross)}</td><td className="num">{c.limit == null ? <span className="muted">no limit set</span> : tzs(c.limit)}</td><td>{c.over && <span className="badge badge-red">Over budget</span>}</td></tr>)}
        </tbody></table></div>
      </section>

      {(['CORE_ADMIN', 'FIELD_LEADERSHIP', 'SUPPORT'] as const).map((tier) => {
        const lines = run.lines.filter((l: any) => l.tier === tier);
        if (!lines.length) return null;
        return (
          <section key={tier} className="table-panel" style={{ marginBottom: 14 }}>
            <div className="section-toolbar"><strong>{TIER[tier]}</strong></div>
            <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Person</th><th>How it was worked out</th><th className="num">Pay</th><th className="num">Deductions</th><th className="num">To pay</th><th /></tr></thead><tbody>
              {lines.map((l: any) => (
                <tr key={l.id}>
                  <td><strong>{l.name}</strong><div className="muted" style={{ fontSize: 11 }}>{l.title} · {CENTER[l.costCenter]}</div></td>
                  <td style={{ fontSize: 12.5, maxWidth: 300 }}>{l.basis}{l.complianceFactor != null && l.complianceFactor < 1 && <div style={{ color: '#b45309' }}>Reduced: {Math.round(l.complianceFactor * 100)}% of the stipend earned</div>}</td>
                  <td className="num">{tzs(l.gross)}</td><td className="num">{l.deductions ? `− ${tzs(l.deductions)}` : '—'}{l.deductionNote && <div className="muted" style={{ fontSize: 11 }}>{l.deductionNote}</div>}</td>
                  <td className="num"><strong>{tzs(l.net)}</strong></td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{run.status === 'DRAFT' && edit && <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'line', line: l })}>Adjust</button>}{' '}<button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'slip', line: l })}>Payslip</button></td>
                </tr>
              ))}
            </tbody></table></div>
          </section>
        );
      })}
      {dialog?.kind === 'line' && <EditLine runId={id} line={dialog.line} onClose={() => setDialog(null)} onSaved={() => done('Line updated.')} />}
      {dialog?.kind === 'slip' && <Payslip runId={id} lineId={dialog.line.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'approve' && <ApproveDialog run={run} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'pay' && <PayDialog run={run} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'return' && <ConfirmDialog title="Send back to the Accountant" askReason reasonLabel="What needs fixing" confirmLabel="Send back" body={<>The run goes back to a draft for the Accountant to correct and submit again.</>} onConfirm={async (reason) => { await payrollApi.returnRun(id, reason); done('Sent back.'); }} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <ConfirmDialog title="Delete this draft?" danger confirmLabel="Delete" body={<>The draft is removed. Attendance and output stay recorded.</>} onConfirm={async () => { await payrollApi.deleteRun(id); onBack(); onChanged(); }} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Runs() {
  const can = useCan();
  const [refresh, setRefresh] = useState(0); const [openId, setOpenId] = useState<string | null>(null); const [period, setPeriod] = useState(thisMonth()); const [creating, setCreating] = useState(false); const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, loading, error, reload } = useApi<any[]>(() => payrollApi.runs(), [refresh]);
  if (openId) return <RunDetail id={openId} onBack={() => setOpenId(null)} onChanged={() => setRefresh((n) => n + 1)} />;
  const create = async () => {
    setCreating(true); setMsg(null);
    try { const r: any = (await payrollApi.createRun({ period })).data; setOpenId(r.id); setRefresh((n) => n + 1); }
    catch (e) { setMsg({ tone: 'error', text: errMsg(e, 'Could not compile the month.') }); } finally { setCreating(false); }
  };
  const rows = data ?? [];
  return (
    <div>
      {msg && <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {can('payroll', 'CREATE') && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 14, flexWrap: 'wrap' }}>
          <Field label="Month to compile"><input type="month" className="input-field" value={period} max={thisMonth()} onChange={(e) => setPeriod(e.target.value)} /></Field>
          <button type="button" className="btn-primary" disabled={creating} onClick={create}>{creating ? 'Compiling…' : 'Compile the month'}</button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>The month is compiled from salaries, attendance, output and water-log compliance. The Accountant reconciles and submits it; the Manager checks the money and approves; then it is paid and booked.</p>
      {loading && !data ? <TableSkeleton cols={5} /> : !rows.length ? <Empty title="No pay runs yet" hint="Verify the people on the payroll, record attendance, then compile the month." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Month</th><th>People</th><th className="num">To pay</th><th>Stage</th><th /></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td>{monthLabel(r.period)}</td><td>{r.people}</td><td className="num">{tzs(r.totalNet)}</td><td><span className={`badge ${r.status === 'POSTED' ? 'badge-green' : r.status === 'DRAFT' ? 'badge-gray' : 'badge-gold'}`}>{STEP_LABEL[r.status]}</span></td><td style={{ textAlign: 'right' }}><button type="button" className="btn-secondary" onClick={() => setOpenId(r.id)}>Open</button></td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

// ───────────────────────── budgets ─────────────────────────

function Budgets() {
  const can = useCan();
  const { data, loading, error, reload } = useApi<any>(() => payrollApi.budgets(), []);
  const [edits, setEdits] = useState<Record<string, string>>({}); const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const valueOf = (b: any) => edits[b.costCenter] ?? (b.monthlyLimit == null ? '' : String(b.monthlyLimit));
  const save = async (c: string) => {
    setMsg(null);
    try { await payrollApi.setBudget(c, Number(edits[c])); setEdits((p) => { const n = { ...p }; delete n[c]; return n; }); setMsg({ tone: 'success', text: `${CENTER[c]} limit saved.` }); reload(); } catch (e) { setMsg({ tone: 'error', text: errMsg(e, 'Could not save.') }); }
  };
  return (
    <div>
      {msg && <Notice tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>The most each budget line may cost in one month’s payroll. A pay run over a limit cannot be submitted or approved. Only the Manager sets limits.</p>
      {loading && !data ? <TableSkeleton cols={3} rows={5} /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Budget line</th><th>Monthly limit (TZS)</th><th /></tr></thead><tbody>
          {data?.data.map((b: any) => <tr key={b.costCenter}><td>{b.label}</td><td style={{ maxWidth: 220 }}>{can('payroll_approval', 'EDIT') ? <MoneyInput value={valueOf(b)} onChange={(e) => setEdits({ ...edits, [b.costCenter]: e.target.value })} /> : b.monthlyLimit == null ? <span className="muted">no limit set</span> : tzs(b.monthlyLimit)}</td>
            <td>{can('payroll_approval', 'EDIT') && <button type="button" className="btn-secondary" disabled={edits[b.costCenter] === undefined || edits[b.costCenter] === ''} onClick={() => save(b.costCenter)}>Save</button>}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

// ───────────────────────── the page ─────────────────────────

type Tab = 'people' | 'attendance' | 'runs' | 'budgets';

/** Payroll: the personnel and wage registry, attendance and output, the monthly run and its three-step approval, and budget lines. */
export default function PayrollPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const [tab, setTab] = useState<Tab | null>(null);
  const tabs: { id: Tab; label: string }[] = [
    ...(can('payroll', 'VIEW') ? [{ id: 'people' as Tab, label: 'People' }] : []),
    ...(can('payroll_attendance', 'VIEW') ? [{ id: 'attendance' as Tab, label: 'Attendance & output' }] : []),
    ...(can('payroll', 'VIEW') ? [{ id: 'runs' as Tab, label: 'Pay runs' }, { id: 'budgets' as Tab, label: 'Budgets' }] : []),
  ];
  const active: Tab = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? 'people';
  if (!tabs.length) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the payroll permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Payroll" /><Empty title="Payroll belongs to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  return (
    <div>
      <PageHeader title="Payroll" subtitle="Everyone the AMCOS pays, with a verified profile: staff, leaders, and support workers. No cash payouts off the books." />
      {tabs.length > 1 && <Tabs tabs={tabs} active={active} onChange={setTab} />}
      <div style={{ marginTop: 14 }}>
        {active === 'people' && <People />}
        {active === 'attendance' && <Attendance />}
        {active === 'runs' && <Runs />}
        {active === 'budgets' && <Budgets />}
      </div>
    </div>
  );
}
