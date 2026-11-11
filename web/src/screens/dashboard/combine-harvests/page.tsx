'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { farmId } from '@/lib/farm-id';
import { harvestCollectionsApi, irrigationApi, riceVarietiesApi } from '@/lib/api';
import { useSchemeScope } from '@/screens/dashboard/irrigation/useSchemeScope';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog, Empty, Field, LoadError, Notice, PageHeader, StatCard, TableSkeleton, Tabs, errMsg, fmtDate, fmtNum, todayISO, useApi, useCan, useDebounced } from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
const POSITION: Record<string, string> = { BLOCK_LEADER: 'Block leader', CANAL_LEADER: 'Canal leader' };

/** Opens a one-page receipt for the browser to print. */
function printReceipt(r: any) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const row = (k: string, v: string) => `<tr><td style="color:#555;padding:3px 12px 3px 0;vertical-align:top">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`;
  const rows = [
    row('Farm ID', r.farmId), r.farmer ? row('Farmer', `${r.farmer.name} (${r.farmer.memberNumber})`) : '',
    row('Combine harvester', `${r.combine.registrationNumber}${r.combine.make ? ` · ${r.combine.make} ${r.combine.model ?? ''}` : ''}`), row('Owner', r.combine.ownerName), r.combine.operatorName ? row('Operator', r.combine.operatorName) : '',
    r.riceType ? row('Rice type', r.riceType) : '', row('Harvested on', String(r.harvestedOn)), row('Harvest', `${fmtNum(r.totalBags, 2)} bags${r.basketsCounted ? ` (${r.bagsCounted} bags + ${r.basketsCounted} baskets at ${r.basketsPerBag} baskets a bag)` : ''}${r.quantityKg ? `, ${r.quantityKg} kg` : ''}`),
    row('Amount', tzs(r.amount)), row('Status', r.status === 'COLLECTED' ? 'Collected' : 'NOT COLLECTED YET'),
    r.status === 'COLLECTED' ? row('Collected by', `${r.collectedByName} (${POSITION[r.collectedByPosition] ?? ''}) on ${String(r.collectedAt).slice(0, 10)}`) : '',
  ].join('');
  w.document.write(`<!doctype html><title>Receipt ${esc(r.receiptNo)}</title><body style="font-family:Arial,sans-serif;max-width:380px;margin:24px auto"><h2 style="margin:0">${esc(r.amcos)}</h2><div style="margin:2px 0 14px;color:#555">Combine harvesting payment receipt ${esc(r.receiptNo)}</div><table>${rows}</table><p style="margin-top:26px;color:#555;font-size:12px">${r.voidedAt ? 'THIS RECEIPT HAS BEEN VOIDED.' : 'Keep this receipt as proof of payment.'}</p><script>window.onload=function(){window.print()}</script></body>`);
  w.document.close();
}


interface Opt { id: string; label: string; sub?: string; raw: any }

/** A searchable drop-down: opens on click with the first entries, narrows as you type, and works with the keyboard. */
function Combo({ label, hint, placeholder, selected, onClear, onPick, load, deps }: {
  label: string; hint?: string; placeholder: string; selected: string | null; onClear: () => void; onPick: (o: Opt) => void;
  load: (q: string) => Promise<Opt[]>; deps?: unknown[];
}) {
  const [text, setText] = useState(''); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
  const [list, setList] = useState<Opt[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const q = useDebounced(text.trim(), 250); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the search as in flight
    setBusy(true); setErr('');
    load(q).then((r) => { if (live) { setList(r); setActive(0); } }).catch((e) => { if (live) setErr(errMsg(e, 'Could not load the list.')); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads when the search text or the caller's inputs change
  }, [q, open, ...(deps ?? [])]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const pick = (o: Opt) => { onPick(o); setOpen(false); setText(''); };
  if (selected) {
    return <Field label={label}><div className="input-field" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><strong>{selected}</strong><button type="button" className="btn-secondary" onClick={onClear}>Change</button></div></Field>;
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <Field label={label} hint={hint}>
      <div ref={box} style={{ position: 'relative' }}>
        <input className="input-field" role="combobox" aria-controls={`combo-${label}`} aria-expanded={open} value={text} placeholder={placeholder} autoComplete="off"
          onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
        {open && (
          <div id={`combo-${label}`} role="listbox" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--surface, #fff)', border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 240, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
            {err ? <div style={{ padding: 10, fontSize: 13, color: 'var(--red-400)' }}>{err}</div> : busy && !list.length ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>Searching…</div>
              : !list.length ? <div className="muted" style={{ padding: 10, fontSize: 13 }}>Nothing matches.</div>
              : list.map((o, i) => (
                <button key={o.id} type="button" role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: i === active ? 'var(--surface-tint, rgba(0,0,0,.06))' : 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
                  <strong>{o.label}</strong><span className="muted">{o.sub}</span>
                </button>))}
          </div>
        )}
      </div>
    </Field>
  );
}

function Record({ onDone }: { onDone: (m: string) => void }) {
  const settings = useApi<any>(() => harvestCollectionsApi.settings(), []);
  const { schemeId } = useSchemeScope();
  const rice = useApi<any>(() => riceVarietiesApi.list(), []);
  const combines = useApi<any>(() => harvestCollectionsApi.combines(), []);
  const [riceId, setRiceId] = useState('');
  const riceList: any[] = (Array.isArray(rice.data) ? rice.data : rice.data?.data ?? []).filter((v: any) => v.isActive !== false);
  const [farmIdText, setFarmIdText] = useState(''); const [ctx, setCtx] = useState<any>(null); const [ctxError, setCtxError] = useState('');
  const [reg, setReg] = useState(''); const [combine, setCombine] = useState<any>(null); const [regError, setRegError] = useState('');
  const [bags, setBags] = useState(''); const [baskets, setBaskets] = useState(''); const [kg, setKg] = useState(''); const [amount, setAmount] = useState(''); const [day, setDay] = useState(todayISO());
  const [received, setReceived] = useState(true); const [collector, setCollector] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const per = settings.data?.basketsPerBag ?? 2;
  const totalBags = (Number(bags) || 0) + (Number(baskets) || 0) / per;
  const lookupFarm = async (text = farmIdText) => { setCtx(null); setCtxError(''); if (!text.trim()) return; try { const r = await harvestCollectionsApi.context(text.trim()); setCtx(r.data); setCollector(''); } catch (e) { setCtxError(errMsg(e, 'Farm ID not found.')); } };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const r: any = await harvestCollectionsApi.create({ farmId: farmIdText.trim(), registrationNumber: reg.trim(), riceVarietyId: riceId || undefined, harvestedOn: day, bags: bags ? Number(bags) : undefined, baskets: baskets ? Number(baskets) : undefined, quantityKg: kg ? Number(kg) : undefined, amount: Number(amount), collected: received, collectorFarmerId: received && collector ? collector : undefined, note: note.trim() || undefined });
      printReceipt(r.data);
      setFarmIdText(''); setCtx(null); setBags(''); setBaskets(''); setKg(''); setAmount(''); setNote('');
      onDone(`${r.data.receiptNo} saved${r.data.status === 'COLLECTED' ? ': the farmer and both leaders were texted.' : '. It is pending until the leader records the money.'}`);
    } catch (e) { setError(errMsg(e, 'Could not save the payment.')); } finally { setBusy(false); }
  };
  return (
    <section className="table-panel" style={{ padding: 16, maxWidth: 760 }}>
      <strong>Record a harvest payment</strong>
      <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 12px' }}>Enter the Farm ID and the combine’s registration number: the farmer and the machine’s details come up. A receipt is made when you save.</div>
      {error && <Notice tone="error">{error}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <Combo label="Farm ID" hint="Click to choose, or type a Farm ID such as 1:1R-1 or the farmer’s name" placeholder="Select or search a Farm ID" selected={ctx || farmIdText ? `${farmIdText}${ctx?.farmer?.name ? ` · ${ctx.farmer.name}` : ''}` : null}
            onClear={() => { setFarmIdText(''); setCtx(null); setCtxError(''); }} deps={[schemeId]}
            load={async (q) => (schemeId ? ((await irrigationApi.hectares({ schemeId, status: 'ALLOCATED', q: q || undefined, page: 1, pageSize: 20 })).data.data as any[]).map((h) => ({ id: h.id, label: farmId(h.code), sub: h.farmer?.name ?? '', raw: h })) : [])}
            onPick={(o) => { const id = farmId(o.raw.code); setFarmIdText(id); void lookupFarm(id); }} />
          {ctxError && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 12.5 }}>{ctxError}</div>}
          {ctx && <div style={{ fontSize: 12.5, marginTop: 4 }}><strong>{ctx.farmer?.name ?? 'Nobody holds this hectare'}</strong>{ctx.farmer ? ` · ${ctx.farmer.memberNumber}` : ''}<div className="muted">{ctx.leaders.map((l: any) => `${POSITION[l.position]}: ${l.name}`).join(' · ') || 'No leaders appointed'}</div></div>}
        </div>
        <div>
          <Combo label="Combine registration number" hint="Click to choose a registered combine, or type to search" placeholder="Select or search a combine" selected={reg ? `${reg}${combine?.make ? ` · ${combine.make} ${combine.model ?? ''}` : ''}` : null}
            onClear={() => { setReg(''); setCombine(null); setRegError(''); }} deps={[combines.data]}
            load={async (q) => ((combines.data?.data ?? []) as any[]).filter((c) => c.isActive !== false && (!q || `${c.registrationNumber} ${c.make ?? ''} ${c.model ?? ''} ${c.ownerName ?? ''}`.toLowerCase().includes(q.toLowerCase()))).map((c) => ({ id: c.id, label: c.registrationNumber, sub: `${c.make ?? ''} ${c.model ?? ''}`.trim() || c.ownerName || '', raw: c }))}
            onPick={(o) => { setReg(o.raw.registrationNumber); setCombine(o.raw); setRegError(''); }} />
          {regError && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 12.5 }}>{regError} Register it on the Combines tab first.</div>}
          {combine && <div style={{ fontSize: 12.5, marginTop: 4 }}><strong>{combine.registrationNumber}</strong>{combine.make ? ` · ${combine.make} ${combine.model ?? ''}` : ''}<div className="muted">Owner {combine.ownerName}{combine.operatorName ? ` · operator ${combine.operatorName}` : ''}{!combine.isActive ? ' · NOT ACTIVE' : ''}</div></div>}
        </div>
      </div>
      <div style={{ marginTop: 12, maxWidth: 360 }}>
        <Field label="Rice type"><select className="input-field" value={riceId} onChange={(e) => setRiceId(e.target.value)}><option value="">Choose the rice type…</option>{riceList.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
        <Field label="Bags"><input type="number" min={0} className="input-field" value={bags} onChange={(e) => setBags(e.target.value)} /></Field>
        <Field label="Baskets" hint={`${per} baskets = 1 bag`}><input type="number" min={0} step="any" className="input-field" value={baskets} onChange={(e) => setBaskets(e.target.value)} /></Field>
        <Field label="Kilograms (optional)"><input type="number" min={0} className="input-field" value={kg} onChange={(e) => setKg(e.target.value)} /></Field>
        <Field label="Harvested on"><input type="date" className="input-field" max={todayISO()} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      </div>
      {totalBags > 0 && <div style={{ fontSize: 13, marginTop: 6 }}>Total <strong>{fmtNum(totalBags, 2)} bags</strong>{settings.data?.pricePerBag ? <> · worth {tzs(totalBags * settings.data.pricePerBag)}</> : null}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <Field label="Amount paid (TZS)"><input type="number" min={0} className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Note"><input className="input-field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 13.5 }}><input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} /> The money has been received</label>
        {received && ctx && <div style={{ marginTop: 8, maxWidth: 320 }}><Field label="Received by" hint="Leave as it is if you are the leader who received it."><select className="input-field" value={collector} onChange={(e) => setCollector(e.target.value)}><option value="">Me</option>{ctx.leaders.map((l: any) => <option key={l.farmerId} value={l.farmerId}>{l.name} · {POSITION[l.position]}</option>)}</select></Field></div>}
        {!received && <div className="muted" style={{ fontSize: 12.5 }}>It will wait in the pending list until a leader records that the money was received.</div>}
      </div>
      <div style={{ marginTop: 14 }}><button type="button" className="btn-primary" disabled={busy || !farmIdText || !reg || !riceId || amount === ''} onClick={save}>{busy ? 'Saving…' : 'Save and print the receipt'}</button></div>
    </section>
  );
}

function Payments({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState('ALL'); const [refresh, setRefresh] = useState(0); const [msg, setMsg] = useState(''); const [voiding, setVoiding] = useState<any>(null);
  const { data, loading, error, reload } = useApi<any>(() => harvestCollectionsApi.list({ status }), [status, refresh]);
  const rows: any[] = data?.data ?? [];
  const collect = async (r: any) => { try { await harvestCollectionsApi.collect(r.id); setMsg('Recorded as collected. The farmer and the leaders were texted.'); setRefresh((n) => n + 1); } catch (e) { setMsg(errMsg(e, 'Could not record it.')); } };
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ marginBottom: 10 }}><select className="input-field" style={{ width: 230 }} aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All payments</option><option value="PENDING">Waiting to be collected</option><option value="COLLECTED">Collected</option></select></div>
      {loading && !data ? <TableSkeleton cols={6} /> : !rows.length ? <Empty title="No harvest payments" /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Receipt</th><th>Farm ID</th><th>Combine</th><th className="num">Bags</th><th className="num">Amount</th><th>Collected</th><th /></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.receiptNo}<div className="muted" style={{ fontSize: 11 }}>{fmtDate(r.harvestedOn)}</div></td>
              <td>{r.farmId}<div className="muted" style={{ fontSize: 11 }}>{r.farmer?.name}</div></td><td>{r.combine.registrationNumber}</td><td className="num">{fmtNum(r.totalBags, 1)}{r.riceType && <div className="muted" style={{ fontSize: 11 }}>{r.riceType}</div>}</td><td className="num">{tzs(r.amount)}</td>
              <td>{r.status === 'COLLECTED' ? <>{r.collectedByName}<div className="muted" style={{ fontSize: 11 }}>{POSITION[r.collectedByPosition]} · {fmtDate(r.collectedAt)}</div></> : <span className="badge badge-gold">Waiting{r.daysWaiting ? ` · ${r.daysWaiting} d` : ''}</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button type="button" className="btn-secondary" style={{ marginRight: 6 }} onClick={async () => { try { printReceipt((await harvestCollectionsApi.receipt(r.id)).data); } catch (e) { setMsg(errMsg(e, 'Could not open the receipt.')); } }}>Print</button>
                {canEdit && r.status === 'PENDING' && <button type="button" className="btn-primary" style={{ marginRight: 6 }} onClick={() => collect(r)}>Mark collected</button>}
                {canEdit && <button type="button" className="btn-secondary" onClick={() => setVoiding(r)}>Void</button>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
      )}
      {voiding && <ConfirmDialog title={`Void ${voiding.receiptNo}`} danger askReason reasonLabel="Why is it voided?" confirmLabel="Void payment" body={<>It stops counting in the totals. The record stays.</>}
        onConfirm={async (reason) => { await harvestCollectionsApi.void(voiding.id, reason); setMsg('Voided.'); setRefresh((n) => n + 1); }} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function Report() {
  const { data, loading, error, reload } = useApi<any>(() => harvestCollectionsApi.byCombine(), []);
  const rows: any[] = data?.data ?? []; const t = data?.totals;
  return (
    <div>
      <LoadError message={error} onRetry={reload} />
      {t && <div className="metric-grid" style={{ marginBottom: 14 }}><StatCard label="Collected" value={tzs(t.collected)} tone="good" /><StatCard label="Not collected yet" value={tzs(t.pending)} tone={t.pending ? 'warn' : 'good'} /><StatCard label="Bags harvested" value={fmtNum(t.bags, 1)} /></div>}
      {loading && !data ? <TableSkeleton cols={6} /> : !rows.length ? <Empty title="No harvest payments yet" /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Combine</th><th>Owner</th><th className="num">Hectares</th><th className="num">Bags</th><th className="num">Collected</th><th className="num">Pending</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.combine.id}><td><strong>{r.combine.registrationNumber}</strong></td><td>{r.combine.ownerName}</td><td className="num">{r.hectares}</td><td className="num">{fmtNum(r.bags, 1)}</td><td className="num">{tzs(r.collected)}</td><td className="num">{r.pending ? tzs(r.pending) : '—'}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

function CombineForm({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ registrationNumber: '', make: '', model: '', ownerName: '', ownerPhone: '', operatorName: '', operatorPhone: '' }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => { setBusy(true); setError(''); try { await harvestCollectionsApi.createCombine(Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim()))); onDone('Combine harvester registered.'); } catch (e) { setError(errMsg(e, 'Could not save.')); setBusy(false); } };
  return (
    <Modal title="Register a combine harvester" onClose={() => !busy && onClose()} width="560px" footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy || f.registrationNumber.trim().length < 3 || f.ownerName.trim().length < 2} onClick={save}>Save</button></>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Registration number *"><input className="input-field" value={f.registrationNumber} onChange={set('registrationNumber')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Make"><input className="input-field" value={f.make} onChange={set('make')} /></Field><Field label="Model"><input className="input-field" value={f.model} onChange={set('model')} /></Field></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Owner *"><input className="input-field" value={f.ownerName} onChange={set('ownerName')} /></Field><Field label="Owner phone"><input className="input-field" value={f.ownerPhone} onChange={set('ownerPhone')} /></Field></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Operator"><input className="input-field" value={f.operatorName} onChange={set('operatorName')} /></Field><Field label="Operator phone"><input className="input-field" value={f.operatorPhone} onChange={set('operatorPhone')} /></Field></div>
      </div>
    </Modal>
  );
}

function Combines() {
  const can = useCan();
  const [refresh, setRefresh] = useState(0); const [adding, setAdding] = useState(false); const [msg, setMsg] = useState('');
  const list = useApi<any>(() => harvestCollectionsApi.combines(), [refresh]);
  const settings = useApi<any>(() => harvestCollectionsApi.settings(), [refresh]);
  const [bpb, setBpb] = useState(''); const [price, setPrice] = useState('');
  const rows: any[] = list.data?.data ?? []; const s = settings.data;
  const saveSettings = async () => { try { await harvestCollectionsApi.saveSettings({ basketsPerBag: Number(bpb || s?.basketsPerBag), pricePerBag: (price || s?.pricePerBag) ? Number(price || s?.pricePerBag) : undefined }); setMsg('Saved.'); setBpb(''); setPrice(''); setRefresh((n) => n + 1); } catch (e) { setMsg(errMsg(e)); } };
  return (
    <div>
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <LoadError message={list.error} onRetry={list.reload} />
      {can('combine_harvesters', 'EDIT') && s && (
        <section className="table-panel" style={{ padding: 14, marginBottom: 14, maxWidth: 620 }}>
          <strong>How the harvest is counted</strong>
          <div className="muted" style={{ fontSize: 12.5, margin: '2px 0 10px' }}>The combine fills baskets first, which are poured into bags later. Say how many baskets make a bag so the bags can be added up. The price of a bag gives each hectare’s income.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <Field label="Baskets in one bag"><input type="number" min={0.1} step="any" className="input-field" placeholder={String(s.basketsPerBag)} value={bpb} onChange={(e) => setBpb(e.target.value)} /></Field>
            <Field label="Price of one bag (TZS)"><input type="number" min={0} className="input-field" placeholder={s.pricePerBag ? String(s.pricePerBag) : 'Not set'} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <button type="button" className="btn-primary" disabled={!bpb && !price} onClick={saveSettings}>Save</button>
          </div>
        </section>
      )}
      {can('combine_harvesters', 'CREATE') && <div style={{ marginBottom: 10 }}><button type="button" className="btn-primary" onClick={() => setAdding(true)}>Register a combine</button></div>}
      {list.loading && !list.data ? <TableSkeleton cols={4} /> : !rows.length ? <Empty title="No combine harvesters registered" hint="Register each combine by its registration number before recording its payments." /> : (
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Registration</th><th>Machine</th><th>Owner</th><th>Operator</th><th /></tr></thead><tbody>
          {rows.map((c) => (
            <tr key={c.id} style={c.isActive ? undefined : { opacity: 0.55 }}><td><strong>{c.registrationNumber}</strong></td><td>{[c.make, c.model].filter(Boolean).join(' ') || '—'}</td><td>{c.ownerName}<div className="muted" style={{ fontSize: 11 }}>{c.ownerPhone}</div></td><td>{c.operatorName ?? '—'}<div className="muted" style={{ fontSize: 11 }}>{c.operatorPhone}</div></td>
              <td style={{ textAlign: 'right' }}>{can('combine_harvesters', 'EDIT') && <button type="button" className="btn-secondary" onClick={async () => { await harvestCollectionsApi.updateCombine(c.id, { isActive: !c.isActive }); setRefresh((n) => n + 1); }}>{c.isActive ? 'Stop' : 'Resume'}</button>}</td></tr>
          ))}
        </tbody></table></div>
      )}
      {adding && <CombineForm onClose={() => setAdding(false)} onDone={(m) => { setAdding(false); setMsg(m); setRefresh((n) => n + 1); }} />}
    </div>
  );
}

type Tab = 'record' | 'payments' | 'report' | 'combines';

/** Combine harvest payments: who harvested which hectare, how many bags, what was paid, and which leader collected it. */
export default function CombineHarvestsPage() {
  const user = useAuthStore((s) => s.user); const can = useCan();
  const canRecord = can('harvest_collections', 'CREATE');
  const [tab, setTab] = useState<Tab>(canRecord ? 'record' : 'payments'); const [msg, setMsg] = useState(''); const [bump, setBump] = useState(0);
  if (!can('harvest_collections', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the combine harvest payments permission." />;
  if (!user?.mamcosId) return <><PageHeader title="Combine Harvests" /><Empty title="This belongs to an AMCOS" hint="Sign in with an AMCOS account." /></>;
  return (
    <div>
      <PageHeader title="Combine Harvests" subtitle="Payments for combine harvesting, tied to the Farm ID and the machine’s registration number, with the leader who collected each one." />
      {msg && <Notice tone="success" onDismiss={() => setMsg('')}>{msg}</Notice>}
      <Tabs tabs={[...(canRecord ? [{ id: 'record' as Tab, label: 'Record a payment' }] : []), { id: 'payments' as Tab, label: 'Payments' }, { id: 'report' as Tab, label: 'By combine' }, ...(can('combine_harvesters', 'VIEW') ? [{ id: 'combines' as Tab, label: 'Combines & settings' }] : [])]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 14 }} key={`${tab}-${bump}`}>
        {tab === 'record' && <Record onDone={(m) => { setMsg(m); setBump((n) => n + 1); }} />}
        {tab === 'payments' && <Payments canEdit={can('harvest_collections', 'EDIT')} />}
        {tab === 'report' && <Report />}
        {tab === 'combines' && <Combines />}
      </div>
    </div>
  );
}
