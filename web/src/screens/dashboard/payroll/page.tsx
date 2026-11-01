'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { payrollApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, FormGrid, LoadError, Notice, PageHeader, StatCard, StatusBadge, TableSkeleton, Tabs,
  errMsg, fmtDate, titleCase, todayISO, useApi, useCan,
} from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const METHODS = ['CASH', 'MOBILE_MONEY', 'BANK'];
const monthLabel = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const thisMonth = () => new Date().toISOString().slice(0, 7);

function Submit({ form, saving, label }: { form: string; saving: boolean; label: string }) {
  return <button type="submit" form={form} className="btn-primary" disabled={saving}>{saving ? 'Saving…' : label}</button>;
}

/** Put a staff member or leader on the payroll, or change what they are paid. */
function PayeeModal({ payee, onClose, onSaved }: { payee?: any; onClose: () => void; onSaved: (m: string) => void }) {
  const candidates = useApi<any[]>(payee ? null : () => payrollApi.candidates(), []);
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState(payee?.title ?? '');
  const [salary, setSalary] = useState(payee ? String(payee.monthlySalary) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pick = (id: string) => { setUserId(id); const c = candidates.data?.find((x) => x.userId === id); if (c && !title) setTitle(c.suggestedTitle); };
  const save = async () => {
    if (!payee && !userId) { setError('Choose who is being paid'); return; }
    if (!title.trim()) { setError('Enter what they are paid as, e.g. Cashier'); return; }
    if (salary === '' || !(Number(salary) >= 0)) { setError('Enter the monthly salary'); return; }
    setSaving(true); setError('');
    try {
      if (payee) await payrollApi.updatePayee(payee.id, { title: title.trim(), monthlySalary: Number(salary) });
      else await payrollApi.addPayee({ userId, title: title.trim(), monthlySalary: Number(salary) });
      onSaved(payee ? 'Salary updated.' : 'Added to the payroll.');
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title={payee ? `Salary: ${payee.name}` : 'Add to payroll'} onClose={() => !saving && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><Submit form="payee-form" saving={saving} label={payee ? 'Save' : 'Add'} /></>}>
      <form id="payee-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 12 }}>
        {!payee && (
          <Field label="Person" hint={candidates.data && !candidates.data.length ? 'Everyone on staff is already on the payroll. Add staff and leaders on the Staff page first.' : 'Staff and canal or block leaders of your AMCOS.'}>
            <select className="input-field" value={userId} onChange={(e) => pick(e.target.value)} autoFocus>
              <option value="">Choose…</option>
              {(candidates.data ?? []).map((c) => <option key={c.userId} value={c.userId}>{c.name}{c.suggestedTitle ? ` · ${c.suggestedTitle}` : ''}</option>)}
            </select>
          </Field>
        )}
        <FormGrid>
          <Field label="Paid as"><input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cashier, Canal leader C01…" /></Field>
          <Field label="Monthly salary (TZS)"><input className="input-field" type="number" min={0} step="1000" value={salary} onChange={(e) => setSalary(e.target.value)} /></Field>
        </FormGrid>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function Salaries({ can }: { can: (r: string, a: string) => boolean }) {
  const { data, loading, error, reload } = useApi<any>(() => payrollApi.payees(), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [toggling, setToggling] = useState<any>(null);
  return (
    <>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div className="metric-grid" style={{ marginBottom: 16 }}>
        <StatCard label="People on payroll" value={data?.summary.people ?? '—'} />
        <StatCard label="Monthly salary bill" value={data ? tzs(data.summary.monthlyTotal) : '—'} />
      </div>
      <section className="table-panel">
        <div className="section-toolbar"><strong>Staff and leaders</strong>
          {can('payroll', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add to payroll</button>}
        </div>
        {loading && !data ? <TableSkeleton cols={5} /> : !data?.data.length ? (
          <Empty title="Nobody is on the payroll yet" hint="Add each staff member and canal or block leader you pay, with their monthly salary." />
        ) : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Name</th><th>Paid as</th><th>Phone</th><th className="num">Monthly salary</th><th>Status</th><th /></tr></thead><tbody>
            {data.data.map((p: any) => (
              <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.6 }}>
                <td style={{ fontWeight: 600 }}>{p.name}</td><td>{p.title}</td><td>{p.phone}</td><td className="num">{tzs(p.monthlySalary)}</td>
                <td><StatusBadge value={p.isActive ? 'ACTIVE' : 'INACTIVE'} /></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {can('payroll', 'EDIT') && <><button type="button" className="btn-secondary" onClick={() => setEditing(p)}>Edit</button>{' '}
                    <button type="button" className="btn-secondary" onClick={() => setToggling(p)}>{p.isActive ? 'Stop paying' : 'Resume'}</button></>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      {adding && <PayeeModal onClose={() => setAdding(false)} onSaved={(m) => { setAdding(false); setMessage(m); reload(); }} />}
      {editing && <PayeeModal payee={editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); setMessage(m); reload(); }} />}
      {toggling && (
        <ConfirmDialog title={toggling.isActive ? 'Stop paying this person?' : 'Resume paying this person?'} confirmLabel={toggling.isActive ? 'Stop paying' : 'Resume'}
          body={toggling.isActive ? `${toggling.name} will be left out of new pay runs. Past pay runs are not changed.` : `${toggling.name} will be included in new pay runs again.`}
          onConfirm={async () => { await payrollApi.updatePayee(toggling.id, { isActive: !toggling.isActive }); setMessage('Payroll updated.'); reload(); }}
          onClose={() => setToggling(null)} />
      )}
    </>
  );
}

function Payslip({ runId, lineId, onClose }: { runId: string; lineId: string; onClose: () => void }) {
  const { data: s, loading, error } = useApi<any>(() => payrollApi.payslip(runId, lineId), [runId, lineId]);
  return (
    <Modal title="Payslip" onClose={onClose} width="520px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Close</button><button type="button" className="btn-primary" onClick={() => window.print()}>Print</button></>}>
      <LoadError message={error} />
      {loading || !s ? <TableSkeleton rows={4} cols={2} /> : (
        <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
          <div><strong style={{ fontSize: 16 }}>{s.amcos}</strong><div className="muted">Payslip for {monthLabel(s.period)}</div></div>
          <div><strong>{s.name}</strong><div className="muted">{s.title}</div></div>
          <table className="data-table"><tbody>
            <tr><td>Pay</td><td className="num">{tzs(s.gross)}</td></tr>
            <tr><td>Deductions{s.deductionNote ? ` (${s.deductionNote})` : ''}</td><td className="num">{s.deductions ? `− ${tzs(s.deductions)}` : '—'}</td></tr>
            <tr><td><strong>Paid to you</strong></td><td className="num"><strong>{tzs(s.net)}</strong></td></tr>
          </tbody></table>
          <div className="muted" style={{ fontSize: 12 }}>{s.status === 'POSTED' ? `Paid ${fmtDate(s.paidOn)} by ${titleCase(s.payMethod)}.` : 'Draft: not paid yet.'}</div>
        </div>
      )}
    </Modal>
  );
}

function EditLineModal({ runId, line, onClose, onSaved }: { runId: string; line: any; onClose: () => void; onSaved: () => void }) {
  const [gross, setGross] = useState(String(line.gross));
  const [deductions, setDeductions] = useState(String(line.deductions));
  const [note, setNote] = useState(line.deductionNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const net = (Number(gross) || 0) - (Number(deductions) || 0);
  const save = async () => {
    if (!(Number(gross) >= 0) || !(Number(deductions) >= 0)) { setError('Enter amounts of zero or more'); return; }
    if (Number(deductions) > Number(gross)) { setError('Deductions cannot be more than the pay'); return; }
    setSaving(true); setError('');
    try { await payrollApi.updateLine(runId, line.id, { gross: Number(gross), deductions: Number(deductions), deductionNote: note }); onSaved(); } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title={`${line.name} · ${line.title}`} onClose={() => !saving && onClose()} width="480px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><Submit form="line-form" saving={saving} label="Save" /></>}>
      <form id="line-form" onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ display: 'grid', gap: 12 }}>
        <FormGrid>
          <Field label="Pay for the month (TZS)" hint="Change for a part month or a bonus."><input className="input-field" type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} autoFocus /></Field>
          <Field label="Deductions (TZS)"><input className="input-field" type="number" min={0} value={deductions} onChange={(e) => setDeductions(e.target.value)} /></Field>
        </FormGrid>
        <Field label="Deduction note"><input className="input-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pension, advance, tax…" /></Field>
        <div>Paid to them: <strong>{tzs(net)}</strong></div>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{error}</div>}
      </form>
    </Modal>
  );
}

function PostModal({ run, onClose, onPosted }: { run: any; onClose: () => void; onPosted: (m: string) => void }) {
  const [method, setMethod] = useState('MOBILE_MONEY');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const post = async () => {
    setSaving(true); setError('');
    try {
      const res = await payrollApi.post(run.id, { payMethod: method, paidOn, notify });
      const n = res.data.notified;
      onPosted(`Pay run for ${monthLabel(run.period)} posted.${n ? ` ${n.sent} text message(s) sent${n.failed ? `, ${n.failed} failed` : ''}.` : ''}`);
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title={`Post ${monthLabel(run.period)} payroll`} onClose={() => !saving && onClose()} width="520px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn-primary" onClick={post} disabled={saving}>{saving ? 'Posting…' : 'Post and lock'}</button></>}>
      <div style={{ display: 'grid', gap: 12, fontSize: 14 }}>
        <div>This records that <strong>{tzs(run.totalNet)}</strong> was paid to {run.lines.length} {run.lines.length === 1 ? 'person' : 'people'} and adds <strong>{tzs(run.totalGross)}</strong> of salaries to your accounts{run.totalDeductions > 0 ? `, with ${tzs(run.totalDeductions)} of deductions held until you pay them on` : ''}. <strong>It cannot be changed afterwards.</strong></div>
        <FormGrid>
          <Field label="Paid by"><select className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{titleCase(m)}</option>)}</select></Field>
          <Field label="Date paid"><input className="input-field" type="date" max={todayISO()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        </FormGrid>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Text each person that their salary was paid</label>
        {error && <div role="alert" style={{ color: 'var(--red-400)' }}>{error}</div>}
      </div>
    </Modal>
  );
}

function RunDetail({ id, can, onBack, onChanged }: { id: string; can: (r: string, a: string) => boolean; onBack: () => void; onChanged: () => void }) {
  const { data: run, loading, error, reload } = useApi<any>(() => payrollApi.run(id), [id]);
  const [editing, setEditing] = useState<any>(null);
  const [slip, setSlip] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const draft = run?.status === 'DRAFT';
  return (
    <>
      <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: 12, marginBottom: 14, display: 'flex', gap: 6 }}>
        <button type="button" onClick={onBack} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>Pay runs</button><span>/</span><span>{run ? monthLabel(run.period) : '…'}</span>
      </nav>
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      {loading && !run ? <TableSkeleton cols={5} /> : run && (
        <>
          <div className="metric-grid" style={{ marginBottom: 16 }}>
            <StatCard label="Pay" value={tzs(run.totalGross)} /><StatCard label="Deductions" value={tzs(run.totalDeductions)} /><StatCard label="Paid to staff" value={tzs(run.totalNet)} />
            <StatCard label="Status" value={<StatusBadge value={run.status} label={draft ? 'Draft' : 'Posted'} />} hint={draft ? 'Not paid yet. Edit freely.' : `Paid ${fmtDate(run.paidOn)} · ${titleCase(run.payMethod)}`} />
          </div>
          <section className="table-panel">
            <div className="section-toolbar"><strong>{monthLabel(run.period)}</strong>
              <span style={{ display: 'flex', gap: 8 }}>
                {draft && can('payroll', 'DELETE') && <button type="button" className="btn-secondary" onClick={() => setDeleting(true)}>Delete draft</button>}
                {draft && can('payroll', 'EDIT') && <button type="button" className="btn-primary" onClick={() => setPosting(true)}>Post payroll</button>}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Name</th><th>Paid as</th><th className="num">Pay</th><th className="num">Deductions</th><th className="num">Paid to them</th><th /></tr></thead><tbody>
              {run.lines.map((l: any) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 600 }}>{l.name}</td><td>{l.title}</td><td className="num">{tzs(l.gross)}</td>
                  <td className="num" title={l.deductionNote ?? undefined}>{l.deductions ? tzs(l.deductions) : '—'}</td><td className="num">{tzs(l.net)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {draft && can('payroll', 'EDIT') && <button type="button" className="btn-secondary" onClick={() => setEditing(l)}>Adjust</button>}{' '}
                    <button type="button" className="btn-secondary" onClick={() => setSlip(l.id)}>Payslip</button>
                  </td>
                </tr>
              ))}
            </tbody></table></div>
          </section>
          {editing && <EditLineModal runId={id} line={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); onChanged(); }} />}
          {slip && <Payslip runId={id} lineId={slip} onClose={() => setSlip(null)} />}
          {posting && <PostModal run={run} onClose={() => setPosting(false)} onPosted={(m) => { setPosting(false); setMessage(m); reload(); onChanged(); }} />}
          {deleting && <ConfirmDialog title="Delete this draft?" danger confirmLabel="Delete draft" body="The draft pay run is removed. Nothing was paid or recorded in your accounts." onConfirm={async () => { await payrollApi.deleteRun(id); onChanged(); onBack(); }} onClose={() => setDeleting(false)} />}
        </>
      )}
    </>
  );
}

function Runs({ can }: { can: (r: string, a: string) => boolean }) {
  const { data, loading, error, reload } = useApi<any[]>(() => payrollApi.runs(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [period, setPeriod] = useState(thisMonth());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (openId) return <RunDetail id={openId} can={can} onBack={() => setOpenId(null)} onChanged={reload} />;
  const start = async () => {
    setBusy(true); setProblem('');
    try { const res = await payrollApi.createRun({ period }); setStarting(false); reload(); setOpenId(res.data.id); } catch (e) { setProblem(errMsg(e)); }
    setBusy(false);
  };
  return (
    <>
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <div className="section-toolbar"><strong>Monthly pay runs</strong>
          {can('payroll', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setStarting(true)}>Start pay run</button>}
        </div>
        {loading && !data ? <TableSkeleton cols={5} /> : !data?.length ? (
          <Empty title="No pay runs yet" hint="Start a pay run for a month. It begins as a draft from everyone's salary, which you can adjust before paying." />
        ) : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Month</th><th>People</th><th className="num">Pay</th><th className="num">Paid to staff</th><th>Status</th><th /></tr></thead><tbody>
            {data.map((r) => (
              <tr key={r.id} onClick={() => setOpenId(r.id)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600 }}>{monthLabel(r.period)}</td><td>{r.people}</td><td className="num">{tzs(r.totalGross)}</td><td className="num">{tzs(r.totalNet)}</td>
                <td><StatusBadge value={r.status} label={r.status === 'DRAFT' ? 'Draft' : 'Posted'} /></td><td style={{ textAlign: 'right' }}><span className="muted">Open →</span></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      {starting && (
        <Modal title="Start pay run" onClose={() => !busy && setStarting(false)} width="420px"
          footer={<><button type="button" className="btn-secondary" onClick={() => setStarting(false)} disabled={busy}>Cancel</button><button type="button" className="btn-primary" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Start'}</button></>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Month" hint="Everyone currently on the payroll is included at their monthly salary."><input className="input-field" type="month" max={thisMonth()} value={period} onChange={(e) => setPeriod(e.target.value)} autoFocus /></Field>
            {problem && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13 }}>{problem}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Payroll: what the AMCOS pays its staff and canal or block leaders each month, posted to its own accounts. */
export default function PayrollPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<'runs' | 'salaries'>('runs');
  if (!user?.mamcosId) {
    return <><PageHeader title="Payroll" /><Empty title="Payroll belongs to an AMCOS" hint="Sign in with an AMCOS account to manage its payroll." /></>;
  }
  return (
    <div>
      <PageHeader title="Payroll" subtitle="Salaries for your staff and canal or block leaders, paid monthly and recorded in your AMCOS accounts." />
      <Tabs tabs={[{ id: 'runs', label: 'Pay runs' }, { id: 'salaries', label: 'Salaries' }]} active={tab} onChange={setTab} />
      {tab === 'runs' && <Runs can={can} />}
      {tab === 'salaries' && <Salaries can={can} />}
    </div>
  );
}
