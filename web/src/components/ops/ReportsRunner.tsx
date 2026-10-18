'use client';
import { useState } from 'react';
import { opsApi } from '@/lib/api';
import { downloadBlob } from '@/lib/ops';
import { DataTable, Empty, ErrorNote, Field, Loading, Toolbar, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Def { key: string; title: string; group: string; description: string }

/** Runs any operations report on screen and exports it. `groups` limits which report groups a hub shows. */
export default function ReportsRunner({ groups }: { groups?: string[] }) {
  const { data: catalog } = useLoad<Def[]>(() => opsApi.reportCatalog());
  const defs = (catalog ?? []).filter((d) => !groups || groups.includes(d.group));
  const [key, setKey] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const { busy, error, run } = useAction();
  const current = defs.find((d) => d.key === (key || defs[0]?.key));
  if (!catalog) return <Loading />;
  if (!current) return <Empty>No reports are available for your role.</Empty>;
  const params = { from: from || undefined, to: to || undefined };

  const show = async () => { const r = await run(() => opsApi.runReport(current.key, params)); if (r) setRows((r.data as any).rows); };
  const exportAs = async (format: 'csv' | 'xlsx' | 'pdf') => {
    const r = await run(() => opsApi.downloadReport(current.key, { ...params, format }));
    if (r) downloadBlob(r.data as BlobPart, `${current.key}.${format}`);
  };
  const columns = rows?.length ? Object.keys(rows[0]).map((h) => ({ header: h, render: (r: Record<string, any>) => String(r[h] ?? '—') })) : [];

  return (
    <div>
      <Toolbar right={<>
        <button className="btn-secondary" disabled={busy} onClick={() => exportAs('csv')}>CSV</button>
        <button className="btn-secondary" disabled={busy} onClick={() => exportAs('xlsx')}>Excel</button>
        <button className="btn-secondary" disabled={busy} onClick={() => exportAs('pdf')}>PDF</button>
      </>}>
        <Field label="Report"><select className="input-field" value={current.key} onChange={(e) => { setKey(e.target.value); setRows(null); }}>
          {[...new Set(defs.map((d) => d.group))].map((g) => <optgroup key={g} label={g}>{defs.filter((d) => d.group === g).map((d) => <option key={d.key} value={d.key}>{d.title}</option>)}</optgroup>)}
        </select></Field>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <button className="btn-primary" disabled={busy} onClick={show}>{busy ? 'Working…' : 'Show report'}</button>
      </Toolbar>
      <p style={{ fontSize: 12, color: 'var(--neutral-500)', margin: '0 0 12px' }}>{current.description}</p>
      <ErrorNote message={error} />
      {rows && <DataTable rows={rows} columns={columns} rowKey={(r) => JSON.stringify(r)} empty="Nothing matched these dates." />}
    </div>
  );
}
