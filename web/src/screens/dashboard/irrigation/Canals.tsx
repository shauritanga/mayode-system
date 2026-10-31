'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import Modal from '@/components/Modal';
import { BlockFormModal } from './Blocks';
import {
  BASE, CardsSkeleton, ConfirmDialog, DocumentsPanel, Empty, Field, Filters, FormGrid, HistoryPanel, LoadError, Notice, PageHeader, Panel, Pager,
  ProgressBar, StatCard, StatusBadge, TableSkeleton, Tabs, errMsg, fmtDate, fmtHa, fmtNum, titleCase, useApi, useIrrigation,
} from './ui';

const STATUSES = ['PLANNED', 'ACTIVE', 'UNDER_MAINTENANCE', 'INACTIVE'];

function CanalFormModal({ canal, schemeId, nextNumber, onClose, onSaved }: { canal?: any; schemeId: string; nextNumber: number; onClose: () => void; onSaved: (m: string) => void }) {
  const editing = !!canal;
  const [form, setForm] = useState({
    canalNumber: canal ? String(canal.canalNumber) : String(nextNumber), code: canal?.code ?? '', name: canal?.name ?? '', status: canal?.status ?? 'ACTIVE',
    description: canal?.description ?? '', lengthKm: canal?.lengthKm == null ? '' : String(canal.lengthKm), headworks: canal?.headworks ?? '', infrastructureNotes: canal?.infrastructureNotes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const save = async () => {
    const found: Record<string, string> = {};
    if (!editing && !(Number(form.canalNumber) >= 1 && Number(form.canalNumber) <= 99)) found.canalNumber = 'Enter a canal number from 1 to 99';
    if (form.lengthKm !== '' && !(Number(form.lengthKm) >= 0)) found.lengthKm = 'Length must be zero or more';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true); setError('');
    const body: any = { status: form.status, description: form.description.trim() || undefined, headworks: form.headworks.trim() || undefined, infrastructureNotes: form.infrastructureNotes.trim() || undefined, ...(form.lengthKm !== '' ? { lengthKm: Number(form.lengthKm) } : {}) };
    if (form.code.trim()) body.code = form.code.trim();
    try {
      if (editing) { await irrigationApi.updateCanal(canal.id, body); onSaved('Canal saved.'); }
      else { await irrigationApi.createCanal({ ...body, schemeId, canalNumber: Number(form.canalNumber) }); onSaved('Canal added.'); }
    } catch (e) { setError(errMsg(e, 'Could not save the canal.')); setSaving(false); }
  };
  return (
    <Modal title={editing ? `Edit ${canal.code}` : 'Add canal'} onClose={() => !saving && onClose()} width="560px"
      footer={<><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" form="canal-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save canal' : 'Add canal'}</button></>}>
      <form id="canal-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <FormGrid>
          <Field label="Canal number *" error={errors.canalNumber}><input type="number" min={1} max={99} className="input-field" value={form.canalNumber} onChange={(e) => set('canalNumber', e.target.value)} disabled={editing} /></Field>
          <Field label="Canal code" hint="Defaults to C01, C02 …"><input className="input-field" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder={editing ? undefined : `C${String(form.canalNumber || '').padStart(2, '0')}`} /></Field>
          <Field label="Status"><select className="input-field" value={form.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
          <Field label="Length (km)" error={errors.lengthKm}><input type="number" step="0.01" min={0} className="input-field" value={form.lengthKm} onChange={(e) => set('lengthKm', e.target.value)} /></Field>
          <Field label="Intake"><input className="input-field" value={form.headworks} onChange={(e) => set('headworks', e.target.value)} /></Field>
          <Field label="Description" wide><textarea className="input-field" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          {editing && <Field label="Infrastructure notes" wide><textarea className="input-field" rows={3} value={form.infrastructureNotes} onChange={(e) => set('infrastructureNotes', e.target.value)} placeholder="Gates, structures, lining, condition" /></Field>}
        </FormGrid>
        {error && <div role="alert" style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </form>
    </Modal>
  );
}

/** Page 3 — canal register. */
export function CanalList() {
  const { schemeId, can } = useIrrigation();
  const search = useSearchParams();
  const [filters, setFilters] = useState({ q: '', status: '', hasLeader: '', archived: '' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ canal?: any } | null>(search.get('add') ? {} : null);
  const [message, setMessage] = useState('');
  const { data, loading, error, reload } = useApi<any>(schemeId ? () => irrigationApi.canals({ schemeId, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, pageSize: 20 }) : null, [schemeId, JSON.stringify(filters), page]);
  const setFilter = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const nextNumber = (data?.data ?? []).reduce((m: number, c: any) => Math.max(m, c.canalNumber), 0) + 1;
  return (
    <>
      <PageHeader title="Canal List" subtitle="The scheme's canals with their block counts, area and leaders." crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Canal List' }]}
        actions={can('irrigation', 'CREATE') && schemeId ? <button type="button" className="btn-primary" onClick={() => setForm({})}>Add canal</button> : undefined} />
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <LoadError message={error} onRetry={reload} />
      <section className="table-panel">
        <Filters>
          <Field label="Search"><input className="input-field" placeholder="Code or name" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} /></Field>
          <Field label="Status"><select className="input-field" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></Field>
          <Field label="Canal leader"><select className="input-field" value={filters.hasLeader} onChange={(e) => setFilter('hasLeader', e.target.value)}><option value="">All</option><option value="true">Assigned</option><option value="false">Not assigned</option></select></Field>
          <Field label="Show"><select className="input-field" value={filters.archived} onChange={(e) => setFilter('archived', e.target.value)}><option value="">Current canals</option><option value="true">Archived canals</option></select></Field>
        </Filters>
        {loading ? <TableSkeleton cols={8} /> : !data?.data.length ? (
          <Empty title={Object.values(filters).some(Boolean) ? 'No canals match these filters' : 'No canals registered yet'} hint="Add the canals numbered 1 to 6, then add each canal's blocks."
            action={can('irrigation', 'CREATE') && schemeId && !Object.values(filters).some(Boolean) ? <button type="button" className="btn-primary" onClick={() => setForm({})}>Add canal</button> : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th className="num">No.</th><th>Code</th><th>Name</th><th className="num">Blocks</th><th className="num">Total block area</th><th>Canal leader</th><th>Status</th><th /></tr></thead><tbody>
            {data.data.map((c: any) => (
              <tr key={c.id}>
                <td className="num" style={{ fontWeight: 600 }}>{c.canalNumber}</td>
                <td><Link href={`${BASE}/structure/canals/${c.id}`}>{c.code}</Link></td><td>{c.name}</td>
                <td className="num">{c.blockCount}</td><td className="num">{fmtHa(c.totalBlockArea)}</td>
                <td>{c.leader ? <>{c.leader.name}{c.leader.state === 'TERM_EXPIRED' && <> <StatusBadge value="TERM_EXPIRED" label="Term expired" /></>}</> : <StatusBadge value="UNASSIGNED" label="No leader" />}</td>
                <td><StatusBadge value={c.archivedAt ? 'INACTIVE' : c.status} label={c.archivedAt ? 'Archived' : undefined} /></td>
                <td style={{ whiteSpace: 'nowrap' }}><Link className="btn-secondary" href={`${BASE}/structure/canals/${c.id}`}>View</Link>{' '}{can('irrigation', 'EDIT') && !c.archivedAt && <button type="button" className="btn-secondary" onClick={() => setForm({ canal: c })}>Edit</button>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        <Pager meta={data?.meta} onPage={setPage} />
      </section>
      {form && <CanalFormModal canal={form.canal} schemeId={schemeId} nextNumber={nextNumber} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setMessage(m); reload(); }} />}
    </>
  );
}

type CanalTab = 'overview' | 'blocks' | 'leader' | 'infrastructure' | 'documents' | 'history';

/** Page 4 — canal profile. */
export function CanalDetail({ id }: { id: string }) {
  const { can } = useIrrigation();
  const [tab, setTab] = useState<CanalTab>('overview');
  const canal = useApi<any>(() => irrigationApi.canal(id), [id]);
  const leaders = useApi<any>(tab === 'leader' ? () => irrigationApi.leadership({ canalId: id, position: 'CANAL_LEADER', pageSize: 50 }) : null, [id, tab]);
  const [editing, setEditing] = useState(false);
  const [addBlock, setAddBlock] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [message, setMessage] = useState('');
  const c = canal.data;
  const s = c?.summary;
  const pct = s && s.hectareUnits ? Math.round((s.allocatedUnits / s.hectareUnits) * 1000) / 10 : 0;
  return (
    <>
      <PageHeader title={c ? `${c.code} · ${c.name}` : 'Canal'} subtitle={c ? `${c.scheme.name}` : undefined}
        crumbs={[{ label: 'Irrigation', href: BASE }, { label: 'Canal List', href: `${BASE}/structure/canals` }, { label: c?.code ?? '…' }]}
        actions={c && <>
          <StatusBadge value={c.archivedAt ? 'INACTIVE' : c.status} label={c.archivedAt ? 'Archived' : undefined} />
          {can('irrigation', 'EDIT') && !c.archivedAt && <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
          {can('irrigation', 'DELETE') && !c.archivedAt && <button type="button" className="btn-secondary" onClick={() => setArchiveOpen(true)}>Archive</button>}
          {can('irrigation', 'EDIT') && c.archivedAt && <button type="button" className="btn-secondary" onClick={async () => { try { await irrigationApi.restoreCanal(id); canal.reload(); } catch (e) { setMessage(errMsg(e)); } }}>Restore</button>}
        </>} />
      <LoadError message={canal.error} onRetry={canal.reload} />
      {message && <Notice tone="success" onDismiss={() => setMessage('')}>{message}</Notice>}
      <Tabs<CanalTab> tabs={[{ id: 'overview', label: 'Overview' }, { id: 'blocks', label: 'Blocks' }, { id: 'leader', label: 'Canal Leader' }, { id: 'infrastructure', label: 'Infrastructure' }, { id: 'documents', label: 'Documents' }, { id: 'history', label: 'History' }]} active={tab} onChange={setTab} />
      {canal.loading || !c ? <CardsSkeleton count={4} /> : (
        <>
          {tab === 'overview' && (
            <>
              <div className="metric-grid" style={{ marginBottom: 16 }}>
                <StatCard label="Blocks" value={fmtNum(c.blockCount)} hint={`Expected ${s.plannedBlocks.min}–${s.plannedBlocks.max}`} tone={c.blockCount < s.plannedBlocks.min ? 'warn' : undefined} />
                <StatCard label="Total block area" value={fmtHa(c.totalBlockArea)} />
                <StatCard label="Allocated hectares" value={fmtNum(s.allocatedUnits)} hint={`${fmtNum(s.unallocatedUnits)} unallocated`} />
                <StatCard label="Farmer allocations" value={fmtNum(s.farmerAllocations)} />
                <StatCard label="Blocks without a leader" value={fmtNum(s.blocksWithoutLeader)} tone={s.blocksWithoutLeader ? 'warn' : 'good'} />
              </div>
              <Panel title="Allocation progress"><ProgressBar pct={pct} height={14} /><div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{pct}% of {fmtNum(s.hectareUnits)} hectares allocated</div></Panel>
              <Panel title="Details"><dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, margin: 0 }}>
                {[['Canal number', c.canalNumber], ['Canal leader', c.leader ? `${c.leader.name} (${c.leader.memberNumber})` : 'Not assigned'], ['Description', c.description || '—'], ['Created', `${fmtDate(c.createdAt)}${c.createdByName ? ` by ${c.createdByName}` : ''}`]].map(([k, v]) => (
                  <div key={String(k)}><dt className="muted" style={{ fontSize: 12 }}>{k}</dt><dd style={{ margin: '2px 0 0' }}>{v as any}</dd></div>))}
              </dl></Panel>
            </>
          )}
          {tab === 'blocks' && (
            <Panel title={`Blocks (${c.blocks.length})`} pad={false} actions={can('irrigation', 'CREATE') && !c.archivedAt ? <button type="button" className="btn-primary" onClick={() => setAddBlock(true)}>Add block</button> : undefined}>
              {!c.blocks.length ? <Empty title="This canal has no blocks yet" hint={`A canal normally has ${s.plannedBlocks.min}–${s.plannedBlocks.max} blocks of 30 hectares.`} /> : (
                <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Block</th><th className="num">Area</th><th className="num">Allocated</th><th style={{ minWidth: 120 }}>Progress</th><th className="num">Farmers</th><th>Block leader</th><th>Status</th></tr></thead><tbody>
                  {c.blocks.map((b: any) => (
                    <tr key={b.id}><td><Link href={`${BASE}/structure/blocks/${b.id}`} style={{ fontWeight: 600 }}>{b.code}</Link></td><td className="num">{fmtHa(b.areaHectares)}</td>
                      <td className="num">{b.stats.allocatedUnits} / {b.stats.hectareUnits}</td><td><ProgressBar pct={b.stats.hectareUnits ? (b.stats.allocatedUnits / b.stats.hectareUnits) * 100 : 0} /></td>
                      <td className="num">{b.stats.farmerCount}</td><td>{b.leader?.name ?? <StatusBadge value="UNASSIGNED" label="No leader" />}</td><td><StatusBadge value={b.status} /></td></tr>
                  ))}
                </tbody></table></div>
              )}
            </Panel>
          )}
          {tab === 'leader' && (
            <>
              <Panel title="Current canal leader" actions={can('irrigation_leadership', 'CREATE') ? <Link className="btn-primary" href={`${BASE}/leadership/assignments?canalId=${id}`}>{c.leader ? 'Replace leader' : 'Appoint leader'}</Link> : undefined}>
                {c.leader ? <div><strong>{c.leader.name}</strong> <span className="muted">· {c.leader.memberNumber}</span><div className="muted" style={{ fontSize: 12 }}>Term {fmtDate(c.leader.termStart)} – {c.leader.termEnd ? fmtDate(c.leader.termEnd) : 'open'} {c.leader.state === 'TERM_EXPIRED' && <StatusBadge value="TERM_EXPIRED" label="Term expired" />}</div></div> : <span className="muted">No canal leader is assigned.</span>}
              </Panel>
              <Panel title="Appointment history" pad={false}>
                {leaders.loading ? <TableSkeleton rows={3} cols={4} /> : !leaders.data?.data.length ? <Empty title="No appointments recorded" /> : (
                  <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Leader</th><th>Term</th><th>Status</th><th>Replaced by</th></tr></thead><tbody>
                    {leaders.data.data.map((l: any) => <tr key={l.id}><td>{l.leader.name} <span className="muted">· {l.leader.memberNumber}</span></td><td>{fmtDate(l.termStart)} – {fmtDate(l.endedOn ?? l.termEnd)}</td><td><StatusBadge value={l.status} /></td><td>{l.replacedBy?.name ?? '—'}</td></tr>)}
                  </tbody></table></div>
                )}
              </Panel>
            </>
          )}
          {tab === 'infrastructure' && (
            <Panel title="Infrastructure summary" actions={can('irrigation', 'EDIT') && !c.archivedAt ? <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Edit</button> : undefined}>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, margin: 0 }}>
                {[['Canal length', c.lengthKm == null ? 'Not recorded' : `${fmtNum(c.lengthKm, 2)} km`], ['Intake', c.headworks || 'Not recorded'], ['Blocks served', c.blockCount], ['Command area', fmtHa(c.totalBlockArea)], ['Notes', c.infrastructureNotes || 'None recorded']].map(([k, v]) => (
                  <div key={String(k)}><dt className="muted" style={{ fontSize: 12 }}>{k}</dt><dd style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{v as any}</dd></div>))}
              </dl>
            </Panel>
          )}
          {tab === 'documents' && <DocumentsPanel schemeId={c.schemeId} canalId={id} canAdd={can('irrigation', 'CREATE')} />}
          {tab === 'history' && <HistoryPanel load={() => irrigationApi.canalHistory(id)} deps={[id, c.updatedAt]} />}
        </>
      )}
      {editing && c && <CanalFormModal canal={c} schemeId={c.schemeId} nextNumber={c.canalNumber} onClose={() => setEditing(false)} onSaved={(m) => { setEditing(false); setMessage(m); canal.reload(); }} />}
      {addBlock && c && <BlockFormModal canalId={id} canals={[c]} onClose={() => setAddBlock(false)} onSaved={(m) => { setAddBlock(false); setMessage(m); canal.reload(); }} />}
      {archiveOpen && c && <ConfirmDialog title={`Archive ${c.code}`} danger confirmLabel="Archive canal" body={<>Archiving removes <strong>{c.code}</strong> from active lists. It is refused while the canal still has blocks or a canal leader. It can be restored.</>}
        onConfirm={async () => { await irrigationApi.archiveCanal(id); canal.reload(); }} onClose={() => setArchiveOpen(false)} />}
    </>
  );
}
