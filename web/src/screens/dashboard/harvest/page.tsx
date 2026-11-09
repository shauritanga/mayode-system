'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Modal from '@/components/Modal';
import { harvestApi } from '@/lib/api';
import { farmId } from '@/lib/farm-id';
import { useAuthStore } from '@/store/auth.store';
import {
  ConfirmDialog, Empty, Field, Filters, FormGrid, LoadError, Notice, PageHeader, StatCard, TableSkeleton, Tabs, errMsg, fmtDate, useApi, useCan,
} from '@/screens/dashboard/irrigation/ui';

const tzs = (v?: number | null) => `TZS ${Math.round(Number(v) || 0).toLocaleString('en-US')}`;

const STATUS: Record<string, { label: string; tone: string; hint: string }> = {
  GREEN: { label: 'Cleared', tone: 'badge-green', hint: 'Harvest fee paid. The combine harvester may harvest this hectare.' },
  YELLOW: { label: 'Locked · loan', tone: 'badge-gold', hint: 'Harvest fee paid, but the farmer has an unpaid loan. Do not clear until it is sorted out.' },
  RED: { label: 'Locked · unpaid', tone: 'badge-red', hint: 'Harvest fee not fully paid. Do not clear this hectare.' },
  NOT_CHARGED: { label: 'Fee not set', tone: 'badge-gray', hint: 'No harvest fee has been charged for this hectare yet.' },
  UNALLOCATED: { label: 'No holder', tone: 'badge-gray', hint: 'Nobody holds this hectare.' },
};
const RATE_TONE: Record<string, string> = { ACTIVE: 'badge-green', PENDING_APPROVAL: 'badge-gold', SUPERSEDED: 'badge-gray', REJECTED: 'badge-red' };
const RATE_LABEL: Record<string, string> = { ACTIVE: 'In use', PENDING_APPROVAL: 'Waiting for approval', SUPERSEDED: 'Replaced', REJECTED: 'Rejected' };

function useStructure() {
  const { data } = useApi<{ canals: any[]; blocks: any[]; seasons: any[] }>(() => harvestApi.structure(), []);
  return { canals: data?.canals ?? [], blocks: data?.blocks ?? [], seasons: data?.seasons ?? [] };
}

/** The list a Block Chairman checks before a combine harvester starts on a hectare. */
function Clearance({ blocks }: { blocks: any[] }) {
  const [blockId, setBlockId] = useState('');
  const [typeId, setTypeId] = useState('');
  const chosen = blockId || blocks[0]?.id || '';
  const { data, loading, error, reload } = useApi<any>(chosen ? () => harvestApi.clearance(chosen, typeId || undefined) : null, [chosen, typeId]);
  const s = data?.summary;
  return (
    <div>
      <Filters>
        <Field label="Block"><select className="input-field" value={chosen} onChange={(e) => { setBlockId(e.target.value); setTypeId(''); }}>
          {blocks.map((b) => <option key={b.id} value={b.id}>{farmId(b.code)}{b.name ? ` · ${b.name}` : ''}</option>)}</select></Field>
        {data?.harvests?.length > 1 && <Field label="Harvest"><select className="input-field" value={typeId || data.harvest?.typeId} onChange={(e) => setTypeId(e.target.value)}>
          {data.harvests.map((h: any) => <option key={h.typeId} value={h.typeId}>{h.season}</option>)}</select></Field>}
      </Filters>
      <LoadError message={error} onRetry={reload} />
      {data && !data.harvest && <Notice tone="error">No harvest fee has been opened for this block yet, so no hectare can be cleared. Ask the cashier to open the harvest in the Collection tab.</Notice>}
      {s && (
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <StatCard label="Cleared" value={s.green} tone="good" />
          <StatCard label="Locked · unpaid" value={s.red} tone={s.red ? 'warn' : 'good'} />
          <StatCard label="Locked · loan" value={s.yellow} tone={s.yellow ? 'warn' : 'good'} />
          <StatCard label="Fee not set" value={s.notCharged} />
          <StatCard label="No holder" value={s.unallocated} />
        </div>
      )}
      {loading && !data ? <TableSkeleton cols={6} /> : !data?.hectares?.length ? <Empty title="No hectares in this block" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Hectare</th><th>Farmer</th><th>Hectares</th><th>Harvest fee</th><th>Still owed</th><th>Clearance</th></tr></thead>
            <tbody>
              {data.hectares.map((h: any) => {
                const st = STATUS[h.status];
                return (
                  <tr key={h.hectareId}>
                    <td style={{ fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace' }}>{farmId(h.code)}</td>
                    <td>{h.farmer ? <><div>{h.farmer.name}</div><div className="muted" style={{ fontSize: 11 }}>{h.farmer.memberNumber}{h.guardian ? ` · guardian ${h.guardian.name}` : ''}</div></> : <span className="muted">—</span>}</td>
                    <td>{h.areaHectares}</td>
                    <td>{data.harvest ? tzs(h.fee) : '—'}</td>
                    <td>{h.status === 'NOT_CHARGED' || h.status === 'UNALLOCATED' ? '—' : tzs(h.farmerBalance)}{h.hasLoan && <div className="muted" style={{ fontSize: 11 }}>Has an unpaid loan</div>}</td>
                    <td><span className={`badge ${st.tone}`} title={st.hint}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpenHarvest({ blocks, seasons: list, onDone }: { blocks: any[]; seasons: any[]; onDone: (text: string) => void }) {
  const [form, setForm] = useState({ blockId: '', seasonId: '', dueDate: '' });
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blockId = form.blockId || blocks[0]?.id || '';
  const seasonId = form.seasonId || list[0]?.id || '';
  const body = (dryRun: boolean) => ({ blockId, seasonId, dueDate: form.dueDate || undefined, dryRun });

  const check = async () => {
    setBusy(true); setError('');
    try { setPreview((await harvestApi.open(body(true))).data); } catch (e) { setPreview(null); setError(errMsg(e)); } finally { setBusy(false); }
  };
  const open = async () => {
    setBusy(true); setError('');
    try {
      const res = (await harvestApi.open(body(false))).data;
      setPreview(null);
      onDone(`Harvest fee charged to ${res.created} farmer${res.created === 1 ? '' : 's'} in block ${farmId(res.block)} (${tzs(res.totalNew)} in total).`);
    } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <section className="table-panel" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Open the harvest for a block</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Charges every farmer who holds hectares in the block: hectares held x the approved rate. It appears in their AMCOS charges, and the farmer is paid up when they pay it there. Running it again only adds farmers who were not charged yet.</p>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      <FormGrid>
        <Field label="Block"><select className="input-field" value={blockId} onChange={(e) => { setForm({ ...form, blockId: e.target.value }); setPreview(null); }}>
          {blocks.map((b) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>
        <Field label="Season"><select className="input-field" value={seasonId} onChange={(e) => { setForm({ ...form, seasonId: e.target.value }); setPreview(null); }}>
          {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Pay by (optional)"><input className="input-field" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
      </FormGrid>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" disabled={busy || !blockId || !seasonId} onClick={check}>{busy && !preview ? 'Checking…' : 'Check first'}</button>
        <button type="button" className="btn-primary" disabled={busy || !preview || !preview.newCharges} onClick={open}>Charge the farmers</button>
      </div>
      {preview && (
        <div style={{ marginTop: 12, fontSize: 13.5 }}>
          Rate {tzs(preview.ratePerHectare)} per hectare ({preview.rateScope === 'BLOCK' ? 'set for this block' : preview.rateScope === 'CANAL' ? 'set for its canal' : 'AMCOS-wide'}) ·{' '}
          <strong>{preview.newCharges}</strong> farmer{preview.newCharges === 1 ? '' : 's'} to charge, {tzs(preview.totalNew)} in total
          {preview.alreadyCharged > 0 && <> · {preview.alreadyCharged} already charged</>}.
        </div>
      )}
    </section>
  );
}

function Collection({ canals, blocks, seasons, canOpen }: { canals: any[]; blocks: any[]; seasons: any[]; canOpen: boolean }) {
  const [canalId, setCanalId] = useState('');
  const chosen = canalId || canals[0]?.id || '';
  const { data, loading, error, reload } = useApi<any>(chosen ? () => harvestApi.canalSummary(chosen) : null, [chosen]);
  const [notice, setNotice] = useState('');
  return (
    <div>
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      {canOpen && blocks.length > 0 && <OpenHarvest blocks={blocks} seasons={seasons} onDone={(t) => { setNotice(t); reload(); }} />}
      <Filters>
        <Field label="Canal"><select className="input-field" value={chosen} onChange={(e) => setCanalId(e.target.value)}>
          {canals.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>
      </Filters>
      <LoadError message={error} onRetry={reload} />
      {data?.totals && (
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <StatCard label="Charged" value={tzs(data.totals.charged)} />
          <StatCard label="Collected" value={tzs(data.totals.paid)} tone="good" />
          <StatCard label="Still owed" value={tzs(data.totals.outstanding)} tone={data.totals.outstanding ? 'warn' : 'good'} />
        </div>
      )}
      {loading && !data ? <TableSkeleton cols={6} /> : !data?.blocks?.length ? <Empty title="No blocks in this canal" /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Block</th><th>Season</th><th>Farmers cleared</th><th>Charged</th><th>Collected</th><th>Still owed</th></tr></thead>
            <tbody>
              {data.blocks.map((b: any) => (
                <tr key={b.blockId}>
                  <td style={{ fontWeight: 700 }}>{farmId(b.code)}</td>
                  <td>{b.season ?? <span className="muted">Not opened</span>}</td>
                  <td>{b.season ? `${b.cleared} of ${b.farmers}` : '—'}</td>
                  <td>{b.season ? tzs(b.charged) : '—'}</td>
                  <td>{b.season ? tzs(b.paid) : '—'}</td>
                  <td>{b.season ? tzs(b.outstanding) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProposeModal({ canals, blocks, onClose, onSaved }: { canals: any[]; blocks: any[]; onClose: () => void; onSaved: (t: string) => void }) {
  const [form, setForm] = useState({ scope: 'AMCOS', canalId: '', blockId: '', rate: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const rate = Number(form.rate);
    if (!rate || rate <= 0) { setError('Enter the rate per hectare.'); return; }
    setSaving(true); setError('');
    try {
      await harvestApi.proposeRate({
        scope: form.scope, ratePerHectare: rate, note: form.note.trim() || undefined,
        canalId: form.scope === 'CANAL' ? form.canalId || canals[0]?.id : undefined, blockId: form.scope === 'BLOCK' ? form.blockId || blocks[0]?.id : undefined,
      });
      onSaved('The rate was sent for approval. A Manager must approve it before it is used.');
    } catch (e) { setError(errMsg(e)); setSaving(false); }
  };
  return (
    <Modal title="Propose a harvest fee rate" subtitle="It takes effect only after a Manager approves it." onClose={() => !saving && onClose()} width="520px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Sending…' : 'Send for approval'}</button></>}>
      {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
      <FormGrid>
        <Field label="Applies to" wide><select className="input-field" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
          <option value="AMCOS">The whole AMCOS</option><option value="CANAL">One canal</option><option value="BLOCK">One block</option></select></Field>
        {form.scope === 'CANAL' && <Field label="Canal" wide><select className="input-field" value={form.canalId || canals[0]?.id || ''} onChange={(e) => setForm({ ...form, canalId: e.target.value })}>
          {canals.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></Field>}
        {form.scope === 'BLOCK' && <Field label="Block" wide><select className="input-field" value={form.blockId || blocks[0]?.id || ''} onChange={(e) => setForm({ ...form, blockId: e.target.value })}>
          {blocks.map((b) => <option key={b.id} value={b.id}>{farmId(b.code)}</option>)}</select></Field>}
        <Field label="Rate per hectare (TZS) *" wide><input className="input-field" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value.replace(/[^\d.]/g, '') })} placeholder="e.g. 50000" /></Field>
        <Field label="Note" wide><input className="input-field" maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Why this rate (optional)" /></Field>
      </FormGrid>
    </Modal>
  );
}

function Rates({ canals, blocks }: { canals: any[]; blocks: any[] }) {
  const can = useCan();
  const me = useAuthStore((s) => s.user);
  const { data, loading, error, reload } = useApi<any[]>(() => harvestApi.rates(), []);
  const [proposing, setProposing] = useState(false);
  const [deciding, setDeciding] = useState<{ rate: any; approve: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const rows = data ?? [];
  return (
    <div>
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>One rate for the whole AMCOS; a canal or a block can have its own. Every change is approved by a Manager and the old rate is kept in the list.</p>
        {can('harvest_fees', 'CREATE') && <button type="button" className="btn-primary" onClick={() => setProposing(true)}>Propose a rate</button>}
      </div>
      {loading && !data ? <TableSkeleton cols={6} /> : !rows.length ? <Empty title="No rate yet" hint="Propose the per-hectare harvest fee. Nothing can be charged until a Manager approves it." /> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Applies to</th><th>Rate per hectare</th><th>Status</th><th>Proposed by</th><th>Decided by</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.scope === 'BLOCK' ? `Block ${farmId(r.target.replace('Block ', ''))}` : r.target}{r.note && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{r.note}</div>}</td>
                  <td>{tzs(r.ratePerHectare)}</td>
                  <td><span className={`badge ${RATE_TONE[r.status]}`}>{RATE_LABEL[r.status]}</span></td>
                  <td>{r.requestedBy ?? '—'}<div className="muted" style={{ fontSize: 11 }}>{fmtDate(r.createdAt)}</div></td>
                  <td>{r.decidedBy ?? '—'}{r.decidedAt && <div className="muted" style={{ fontSize: 11 }}>{fmtDate(r.decidedAt)}</div>}{r.decisionNote && <div className="muted" style={{ fontSize: 11 }}>{r.decisionNote}</div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.status === 'PENDING_APPROVAL' && can('harvest_fee_approval', 'EDIT') && (r.requestedById === me?.id
                      ? <span className="muted" style={{ fontSize: 12 }}>Someone else must approve</span>
                      : <><button type="button" className="btn-primary" onClick={() => setDeciding({ rate: r, approve: true })}>Approve</button>{' '}<button type="button" className="btn-secondary" onClick={() => setDeciding({ rate: r, approve: false })}>Reject</button></>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {proposing && <ProposeModal canals={canals} blocks={blocks} onClose={() => setProposing(false)} onSaved={(t) => { setProposing(false); setNotice(t); reload(); }} />}
      {deciding && (
        <ConfirmDialog title={deciding.approve ? 'Approve this rate' : 'Reject this rate'} confirmLabel={deciding.approve ? 'Approve' : 'Reject'} danger={!deciding.approve} askReason={!deciding.approve} reasonLabel="Why"
          body={<>{deciding.approve ? 'From now on, ' : ''}{deciding.rate.target} {deciding.approve ? 'is charged' : 'was proposed at'} <strong>{tzs(deciding.rate.ratePerHectare)}</strong> per hectare{deciding.approve ? '. Harvests already opened keep the rate they were opened with.' : '.'}</>}
          onConfirm={async (reason) => { await harvestApi.decideRate(deciding.rate.id, { approve: deciding.approve, note: reason || undefined }); setNotice(deciding.approve ? 'The rate is now in use.' : 'The rate was rejected.'); reload(); }}
          onClose={() => setDeciding(null)} />
      )}
    </div>
  );
}

type Tab = 'clearance' | 'collection' | 'rates';

export default function HarvestPage() {
  const can = useCan();
  const { canals, blocks, seasons } = useStructure();
  const tabs: { id: Tab; label: string }[] = [
    ...(can('harvest_clearance', 'VIEW') ? [{ id: 'clearance' as Tab, label: 'Clearance' }, { id: 'collection' as Tab, label: 'Collection' }] : []),
    ...(can('harvest_fees', 'VIEW') ? [{ id: 'rates' as Tab, label: 'Rates' }] : []),
  ];
  const [tab, setTab] = useState<Tab | null>(null);
  const active: Tab = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? 'clearance';
  return (
    <div>
      <PageHeader title="Harvest Fees" subtitle="The per-hectare harvest fee, who has paid it, and which hectares a combine harvester may clear." />
      {tabs.length > 1 && <Tabs tabs={tabs} active={active} onChange={setTab} />}
      <div style={{ marginTop: 14 }}>
        {active === 'clearance' && <Clearance blocks={blocks} />}
        {active === 'collection' && <Collection canals={canals} blocks={blocks} seasons={seasons} canOpen={can('harvest_fees', 'CREATE')} />}
        {active === 'rates' && <Rates canals={canals} blocks={blocks} />}
      </div>
    </div>
  );
}
