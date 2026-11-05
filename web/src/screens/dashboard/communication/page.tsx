'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useMemo, useState } from 'react';
import Modal from '@/components/Modal';
import { communicationsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, Filters, LoadError, Notice, PageHeader, Pager, StatCard, TableSkeleton, Tabs,
  errMsg, fmtDate, fmtNum, titleCase, useApi, useCan, useDebounced,
} from '@/screens/dashboard/irrigation/ui';

const SMS_LIMIT = 480;
const CHANNEL_LABEL: Record<string, string> = { SMS: 'SMS', EMAIL: 'Email', BOTH: 'SMS + Email' };
const STATUS_TONE: Record<string, string> = { SENDING: 'badge-gold', COMPLETED: 'badge-green', INTERRUPTED: 'badge-red' };
const DELIVERY_TONE: Record<string, string> = { SENT: 'badge-green', SIMULATED: 'badge-gold', FAILED: 'badge-red', SKIPPED: 'badge-gray', PENDING: 'badge-blue' };
type Mode = 'ALL' | 'CANAL' | 'BLOCK' | 'SELECTED' | 'BOARD' | 'STAFF';
const KIND_LABEL: Record<string, string> = { FARMER: 'Farmer', BOARD: 'Board member', STAFF: 'Staff' };
const DELIVERY_LABEL: Record<string, string> = { SENT: 'Sent', SIMULATED: 'Not delivered (not connected)', FAILED: 'Failed', SKIPPED: 'Skipped', PENDING: 'Waiting' };

function Compose({ onSent }: { onSent: (message: string) => void }) {
  const channels = useApi<any>(() => communicationsApi.channels(), []);
  const [mode, setMode] = useState<Mode>('ALL');
  const [canalId, setCanalId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [sms, setSms] = useState(true);
  const [email, setEmail] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const farmers = useApi<any>(mode === 'SELECTED' ? () => communicationsApi.farmers({ q: q || undefined, page, pageSize: 10 }) : null, [mode, q, page]);
  const totals = useApi<any>(() => communicationsApi.farmers({ pageSize: 1 }), []);
  const channel = sms && email ? 'BOTH' : sms ? 'SMS' : email ? 'EMAIL' : null;
  const targets = useApi<any>(() => communicationsApi.targets(), []);
  const canals: any[] = targets.data?.canals ?? [];
  const canal = canals.find((c) => c.id === canalId);
  const audience = {
    audience: mode, channel,
    ...(mode === 'SELECTED' ? { farmerIds: [...selected.keys()] } : {}),
    ...(mode === 'CANAL' || mode === 'BLOCK' ? { canalId } : {}),
    ...(mode === 'BLOCK' ? { blockId } : {}),
  };
  const targetChosen = mode === 'SELECTED' ? selected.size > 0 : mode === 'CANAL' ? !!canalId : mode === 'BLOCK' ? !!canalId && !!blockId : true;
  const ready = !!channel && targetChosen;
  const preview = useApi<any>(ready ? () => communicationsApi.preview(audience) : null, [ready, mode, channel, canalId, blockId, [...selected.keys()].join(',')]);

  const segments = Math.max(1, Math.ceil(body.length / 160));
  const p = preview.data;
  const allCount = totals.data?.totals?.farmers ?? 0;
  const pageRows: any[] = farmers.data?.data ?? [];
  const allOnPage = pageRows.length > 0 && pageRows.every((f) => selected.has(f.id));

  const toggle = (f: any) => setSelected((m) => { const n = new Map(m); if (n.has(f.id)) n.delete(f.id); else n.set(f.id, f.name); return n; });
  const togglePage = () => setSelected((m) => { const n = new Map(m); pageRows.forEach((f) => (allOnPage ? n.delete(f.id) : n.set(f.id, f.name))); return n; });

  const validate = () => {
    const found: Record<string, string> = {};
    if (!channel) found.channel = 'Choose SMS, email or both';
    if (mode === 'SELECTED' && !selected.size) found.audience = 'Choose at least one farmer';
    if (mode === 'CANAL' && !canalId) found.audience = 'Choose a canal';
    if (mode === 'BLOCK' && (!canalId || !blockId)) found.audience = 'Choose a canal and a block';
    if (email && !subject.trim()) found.subject = 'An email needs a subject';
    if (!body.trim()) found.body = 'Write the message';
    else if (sms && body.length > SMS_LIMIT) found.body = `An SMS can be at most ${SMS_LIMIT} characters`;
    if (p && p.sms + p.email === 0) found.audience = 'None of these people can be reached on the chosen channel';
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const doSend = async () => {
    try {
      const res = await communicationsApi.send({ ...audience, subject: email ? subject.trim() : undefined, body: body.trim() });
      setBody(''); setSubject(''); setSelected(new Map()); setMode('ALL'); setCanalId(''); setBlockId('');
      onSent(`Sending to ${fmtNum((res.data.summary?.sms ?? 0) + (res.data.summary?.email ?? 0))} recipient(s). The counts below update as messages go out.`);
    } catch (e) { setNotice({ tone: 'error', text: errMsg(e, 'Could not send the message.') }); throw e; }
  };

  return (
    <>
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      <LoadError message={channels.error} onRetry={channels.reload} />
      {channels.data && (!channels.data.sms.configured || !channels.data.email.configured) && (
        <div className="glass-card" style={{ padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--gold-400)' }}>
          {!channels.data.sms.configured && <div><strong>SMS is not connected on this system.</strong> Messages will be recorded as &ldquo;not delivered&rdquo; until an SMS provider is set up.</div>}
          {!channels.data.email.configured && <div><strong>Email is not connected on this system.</strong> Messages will be recorded as &ldquo;not delivered&rdquo; until SMTP is set up.</div>}
        </div>
      )}

      <section className="table-panel" style={{ marginBottom: 14 }}>
        <div className="section-toolbar"><strong>1 · Who should receive it?</strong></div>
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {([
              ['ALL', 'All farmers', allCount ? `${fmtNum(allCount)} registered` : 'Every registered farmer'],
              ['CANAL', 'Farmers by canal', 'Everyone farming in one canal'],
              ['BLOCK', 'Farmers by block', 'One block of a canal'],
              ['SELECTED', 'Selected farmers', 'Pick one or several by name'],
              ['BOARD', 'Board members', targets.data ? `${fmtNum(targets.data.board)} on the board` : 'Canal and block leaders'],
              ['STAFF', 'Staff members', targets.data ? `${fmtNum(targets.data.staff)} staff` : 'Everyone on your staff list'],
            ] as [Mode, string, string][]).map(([id, label, hint]) => (
              <label key={id} className="glass-card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', cursor: 'pointer', outline: mode === id ? '2px solid var(--green-400, #4ade80)' : 'none' }}>
                <input type="radio" name="audience" checked={mode === id} onChange={() => { setMode(id); setBlockId(''); }} style={{ marginTop: 3 }} />
                <span><strong>{label}</strong><span className="muted" style={{ display: 'block', fontSize: 12 }}>{hint}</span></span>
              </label>
            ))}
          </div>
          {errors.audience && <span style={{ color: 'var(--red-400)', fontSize: 12 }}>{errors.audience}</span>}
          {(mode === 'CANAL' || mode === 'BLOCK') && (
            targets.loading && !targets.data ? <TableSkeleton rows={1} cols={2} /> : !canals.length ? <Empty title="No canals set up yet" hint="Add canals and blocks under Irrigation first." /> : (
              <Filters>
                <Field label="Canal">
                  <select className="input-field" value={canalId} onChange={(e) => { setCanalId(e.target.value); setBlockId(''); }}>
                    <option value="">Choose a canal</option>
                    {canals.map((c) => <option key={c.id} value={c.id}>{c.name} ({fmtNum(c.farmers)} farmers)</option>)}
                  </select>
                </Field>
                {mode === 'BLOCK' && (
                  <Field label="Block">
                    <select className="input-field" value={blockId} onChange={(e) => setBlockId(e.target.value)} disabled={!canal}>
                      <option value="">{canal ? 'Choose a block' : 'Choose a canal first'}</option>
                      {(canal?.blocks ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name} ({fmtNum(b.farmers)} farmers)</option>)}
                    </select>
                  </Field>
                )}
              </Filters>
            )
          )}
          {mode === 'SELECTED' && (
            <div>
              <Filters>
                <Field label="Find a farmer"><input className="input-field" placeholder="Name, member number, village or phone" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></Field>
                <div style={{ alignSelf: 'center', fontSize: 13 }}><strong>{selected.size}</strong> chosen{selected.size > 0 && <> · <button type="button" className="btn-secondary" onClick={() => setSelected(new Map())}>Clear</button></>}</div>
              </Filters>
              {farmers.loading && !farmers.data ? <TableSkeleton rows={4} cols={4} /> : !pageRows.length ? <Empty title="No farmers match" /> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label="Choose everyone on this page" checked={allOnPage} onChange={togglePage} /></th><th>Farmer</th><th>Village</th><th>Phone</th><th>Email</th></tr></thead>
                    <tbody>
                      {pageRows.map((f) => (
                        <tr key={f.id} onClick={() => toggle(f)} style={{ cursor: 'pointer' }}>
                          <td><input type="checkbox" aria-label={`Choose ${f.name}`} checked={selected.has(f.id)} onChange={() => toggle(f)} onClick={(e) => e.stopPropagation()} /></td>
                          <td><div style={{ fontWeight: 600 }}>{f.name}</div><div className="muted" style={{ fontSize: 11 }}>{f.memberNumber}</div></td>
                          <td>{f.village ?? '—'}</td><td>{f.phone ?? <span className="muted">—</span>}</td><td>{f.email ?? <span className="muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager meta={farmers.data?.meta} onPage={setPage} />
            </div>
          )}
        </div>
      </section>

      <section className="table-panel" style={{ marginBottom: 14 }}>
        <div className="section-toolbar"><strong>2 · How, and what to say</strong></div>
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
            {errors.channel && <span style={{ color: 'var(--red-400)', fontSize: 12 }}>{errors.channel}</span>}
          </div>
          {email && <Field label="Email subject *" error={errors.subject}><input className="input-field" maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
          <Field label="Message *" error={errors.body} hint={`Write {name} to insert each person's first name. ${sms ? `${body.length}/${SMS_LIMIT} characters · ${segments} SMS part${segments === 1 ? '' : 's'}` : `${body.length} characters`}`}>
            <textarea className="input-field" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Habari {name}, ..." />
          </Field>
        </div>
      </section>

      <section className="table-panel">
        <div className="section-toolbar"><strong>3 · Check and send</strong></div>
        <div style={{ padding: 16 }}>
          {!ready ? <span className="muted" style={{ fontSize: 13 }}>Choose who to send to and how, to see who can be reached.</span> : preview.loading && !p ? <TableSkeleton rows={2} cols={3} /> : p && (
            <>
              <div className="metric-grid" style={{ marginBottom: 12 }}>
                <StatCard label={mode === 'BOARD' ? 'Board members' : mode === 'STAFF' ? 'Staff chosen' : 'Farmers chosen'} value={fmtNum(p.people ?? p.farmers)} />
                {sms && <StatCard label="Will get an SMS" value={fmtNum(p.sms)} />}
                {email && <StatCard label="Will get an email" value={fmtNum(p.email)} />}
                <StatCard label="Cannot be reached" value={fmtNum(p.skipped)} tone={p.skipped ? 'warn' : undefined} />
              </div>
              {p.reasons.length > 0 && <ul className="muted" style={{ fontSize: 12, margin: '0 0 12px 18px' }}>{p.reasons.map((r: any) => <li key={r.reason}>{r.reason}: {r.count}</li>)}</ul>}
            </>
          )}
          <button type="button" className="btn-primary" disabled={!ready} onClick={() => { if (validate()) setConfirm(true); }}>Review and send</button>
        </div>
      </section>

      {confirm && p && (
        <ConfirmDialog title="Send this message?" confirmLabel="Send now"
          body={<>
            <div style={{ marginBottom: 8 }}>
              <div style={{ marginBottom: 4 }}>To: <strong>{p.label}</strong></div>
              {sms && <>An SMS to <strong>{fmtNum(p.sms)}</strong> recipient(s). </>}{email && <>An email to <strong>{fmtNum(p.email)}</strong> recipient(s).</>}
            </div>
            <div className="glass-card" style={{ padding: 10, fontSize: 13, whiteSpace: 'pre-wrap' }}>{email && <strong>{subject}{'\n'}</strong>}{body.trim()}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Sent messages cannot be recalled{sms ? ', and SMS may carry a cost' : ''}.</div>
          </>}
          onConfirm={doSend} onClose={() => setConfirm(false)} />
      )}
    </>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(() => communicationsApi.get(id, { status: status || undefined, page, pageSize: 25 }), [id, status, page]);
  const c = data?.communication;
  return (
    <Modal title={c ? (c.subject ?? 'SMS message') : 'Message'} subtitle={c ? `${CHANNEL_LABEL[c.channel]} · ${c.audienceLabel ? `${c.audienceLabel} · ` : ''}${fmtDate(c.createdAt)}` : undefined} onClose={onClose} width="780px"
      footer={<button type="button" className="btn-secondary" onClick={onClose}>Close</button>}>
      <LoadError message={error} onRetry={reload} />
      {c && <div className="glass-card" style={{ padding: 10, fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{c.body}</div>}
      <Filters>
        <Field label="Show"><select className="input-field" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Everyone</option>{Object.keys(DELIVERY_LABEL).map((s) => <option key={s} value={s}>{DELIVERY_LABEL[s]}</option>)}</select></Field>
      </Filters>
      {loading && !data ? <TableSkeleton rows={4} cols={4} /> : !data?.recipients.length ? <Empty title="No recipients in this view" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Recipient</th><th>Channel</th><th>Sent to</th><th>Result</th></tr></thead>
            <tbody>
              {data.recipients.map((r: any) => (
                <tr key={r.id}>
                  <td><div style={{ fontWeight: 600 }}>{r.farmer.name}</div><div className="muted" style={{ fontSize: 11 }}>{[KIND_LABEL[r.kind] ?? 'Farmer', r.farmer.memberNumber].filter(Boolean).join(' · ')}</div></td>
                  <td>{r.channel === 'SMS' ? 'SMS' : 'Email'}</td><td>{r.address ?? '—'}</td>
                  <td><span className={`badge ${DELIVERY_TONE[r.status]}`}>{DELIVERY_LABEL[r.status]}</span>{r.error && <div className="muted" style={{ fontSize: 11 }}>{r.error}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={data?.meta} onPage={setPage} />
    </Modal>
  );
}

function Sent({ refreshKey }: { refreshKey: number }) {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<any>(() => communicationsApi.list({ page, pageSize: 15 }), [page, refreshKey]);
  const [open, setOpen] = useState<string | null>(null);
  const sending = useMemo(() => !!data?.data.some((m: any) => m.status === 'SENDING'), [data]);
  // While a send is in progress, keep the counts moving.
  useEffect(() => { if (!sending) return; const t = setInterval(reload, 4000); return () => clearInterval(t); }, [sending, reload]);
  return (
    <>
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        {loading && !data ? <TableSkeleton cols={7} /> : !data?.data.length ? <Empty title="No messages sent yet" hint="Messages you send appear here with what happened to each." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Sent</th><th>By</th><th>Via</th><th>To</th><th>Message</th><th>Status</th><th className="num">Sent</th><th className="num">Not delivered</th><th className="num">Failed</th><th className="num">Skipped</th></tr></thead>
              <tbody>
                {data.data.map((m: any) => (
                  <tr key={m.id} onClick={() => setOpen(m.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}<div className="muted" style={{ fontSize: 11 }}>{String(m.createdAt).slice(11, 16)}</div></td>
                    <td>{m.sentBy ?? '—'}</td><td>{CHANNEL_LABEL[m.channel]}</td>
                    <td>{m.audienceLabel ?? (m.audience === 'ALL' ? 'All farmers' : 'Chosen farmers')}</td>
                    <td style={{ maxWidth: 280 }}>{m.subject && <div style={{ fontWeight: 600 }}>{m.subject}</div>}<div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</div></td>
                    <td><span className={`badge ${STATUS_TONE[m.status]}`}>{titleCase(m.status)}</span></td>
                    <td className="num">{fmtNum(m.sentCount)}</td><td className="num">{fmtNum(m.simulatedCount)}</td>
                    <td className="num" style={{ color: m.failedCount ? 'var(--red-400)' : undefined }}>{fmtNum(m.failedCount)}</td><td className="num">{fmtNum(m.skippedCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {open && <Detail id={open} onClose={() => { setOpen(null); reload(); }} />}
    </>
  );
}

/** Communication: message your AMCOS's farmers by SMS, email or both, and see what happened to every message. */
export default function CommunicationPage() {
  const user = useAuthStore((s) => s.user);
  const can = useCan();
  const [tab, setTab] = useState<'compose' | 'sent'>(can('communication', 'CREATE') ? 'compose' : 'sent');
  const [refreshKey, setRefreshKey] = useState(0);
  const [sentNotice, setSentNotice] = useState('');
  if (!user?.mamcosId) return <><PageHeader title="Communication" /><Empty title="Communication belongs to an AMCOS" hint="Sign in with an AMCOS account to message its farmers." /></>;
  return (
    <div>
      <PageHeader title="Communication" subtitle="Send SMS or email to all farmers, a canal or block, farmers you pick, board members or staff." />
      {sentNotice && <Notice tone="success" onDismiss={() => setSentNotice('')}>{sentNotice}</Notice>}
      <Tabs tabs={[...(can('communication', 'CREATE') ? [{ id: 'compose' as const, label: 'New message' }] : []), { id: 'sent' as const, label: 'Sent messages' }]} active={tab} onChange={setTab} />
      {tab === 'compose' ? <Compose onSent={(m) => { setSentNotice(m); setRefreshKey((k) => k + 1); setTab('sent'); }} /> : <Sent refreshKey={refreshKey} />}
    </div>
  );
}
