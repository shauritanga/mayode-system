'use client';

import { useMemo, useState } from 'react';
import { accountingApi } from '@/lib/api';
import ErrorBanner from '@/components/ErrorBanner';
import { Badge, Head, errText, shortDate, today, useLoad } from './controls';

const REPORTS: { key: string; name: string; asAt: boolean; hint: string }[] = [
  { key: 'COMPREHENSIVE_INCOME', name: 'Statement of Comprehensive Income', asAt: false, hint: 'Revenue, expenses and the surplus or deficit for the period' },
  { key: 'INCOME_EXPENDITURE', name: 'Income and Expenditure Statement', asAt: false, hint: 'Income against expenditure for the period' },
  { key: 'FINANCIAL_POSITION', name: 'Statement of Financial Position', asAt: true, hint: 'Balance sheet: assets, liabilities and equity at a date' },
  { key: 'CASH_FLOWS', name: 'Statement of Cash Flows', asAt: false, hint: 'Operating, investing and financing cash movements' },
  { key: 'CHANGES_IN_EQUITY', name: 'Statement of Changes in Equity', asAt: false, hint: 'Opening equity, surplus for the period and closing equity' },
  { key: 'TRIAL_BALANCE', name: 'Trial Balance', asAt: true, hint: 'Every account balance at a date' },
  { key: 'GENERAL_LEDGER', name: 'General Ledger', asAt: false, hint: 'Each account with its opening balance and every entry in the period' },
];
const FORMATS = [{ key: 'PDF', label: 'PDF' }, { key: 'DOCX', label: 'Word (DOCX)' }, { key: 'XLSX', label: 'Excel (XLSX)' }] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (v: string) => new Date(v).toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const nameOf = (key: string) => REPORTS.find((r) => r.key === key)?.name ?? key;

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function ReportExportView() {
  const thisYear = Number(today().slice(0, 4));
  const [report, setReport] = useState(REPORTS[0].key);
  const [mode, setMode] = useState<'year' | 'month' | 'range'>('year');
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(Number(today().slice(5, 7)));
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(today());
  const [approvedBy, setApprovedBy] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const archive = useLoad<any[]>(() => accountingApi.reportArchive({ report: filter || undefined, limit: 100 }), [filter]);
  const meta = REPORTS.find((r) => r.key === report)!;
  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => thisYear - i), [thisYear]);

  const period = () => (mode === 'year' ? { year } : mode === 'month' ? { year, month } : { from, to });
  const asAtDate = mode === 'year' ? `31 December ${year}` : mode === 'month' ? `end of ${MONTHS[month - 1]} ${year}` : to;

  const download = async (id: string, fileName: string) => {
    const res = await accountingApi.downloadReport(id);
    saveBlob(res.data as Blob, fileName);
  };
  const generate = async (format: string) => {
    setBusy(format); setErr(''); setNotice('');
    try {
      const row = (await accountingApi.generateReport({ report, format, ...period(), approvedBy: approvedBy.trim() || undefined })).data;
      await download(row.id, row.fileName);
      setNotice(`${row.title} was downloaded and saved in the archive below.`);
      archive.reload();
    } catch (e: any) {
      // a failed blob request carries its JSON error as a Blob
      let msg = errText(e, 'Could not create the report.');
      try { const t = await e?.response?.data?.text?.(); if (t) msg = JSON.parse(t).message ?? msg; } catch { /* keep msg */ }
      setErr(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally { setBusy(''); }
  };
  const again = async (row: any) => {
    setBusy(row.id); setErr('');
    try { await download(row.id, row.fileName); } catch (e) { setErr(errText(e, 'Could not download this report.')); } finally { setBusy(''); }
  };

  return <div>
    <Head text="Official statements for a chosen period, as print-ready PDF, editable Word or Excel files. Every file you create is kept in the archive below." />
    <ErrorBanner message={err || archive.error} onDismiss={() => { setErr(''); archive.setError(''); }} />
    {notice && <div className="glass-card" style={{ padding: 12, marginBottom: 12, color: 'var(--green-400, #4ade80)' }}>{notice}</div>}

    <section className="glass-card" style={{ padding: 20, marginBottom: 16, display: 'grid', gap: 14 }}>
      <label className="form-label">Report
        <select className="input-field" value={report} onChange={(e) => setReport(e.target.value)}>
          {REPORTS.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>{meta.hint}</span>
      </label>

      <div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{meta.asAt ? 'Balances as at' : 'Reporting period'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {([['year', 'Financial year'], ['month', 'Month'], ['range', meta.asAt ? 'A date' : 'Custom date range']] as const).map(([k, label]) =>
            <button key={k} type="button" className={mode === k ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode(k)}>{label}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {mode !== 'range' && <label className="form-label">Year
            <select className="input-field" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>}
          {mode === 'month' && <label className="form-label">Month
            <select className="input-field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>}
          {mode === 'range' && !meta.asAt && <label className="form-label">From<input className="input-field" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>}
          {mode === 'range' && <label className="form-label">{meta.asAt ? 'As at' : 'To'}<input className="input-field" type="date" value={to} min={meta.asAt ? undefined : from} onChange={(e) => setTo(e.target.value)} /></label>}
        </div>
        {meta.asAt && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>The statement will show balances as at {asAtDate}.</div>}
      </div>

      <label className="form-label">Approved by (optional)
        <input className="input-field" value={approvedBy} maxLength={120} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Name of the chairman or manager; left as a signature line when empty" />
      </label>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {FORMATS.map((f) => <button key={f.key} type="button" className="btn-primary" disabled={!!busy || (mode === 'range' && (!to || (!meta.asAt && !from)))} onClick={() => void generate(f.key)}>
          {busy === f.key ? 'Preparing…' : `Download ${f.label}`}</button>)}
      </div>
    </section>

    <section className="table-panel">
      <div className="section-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <strong>Archive of generated reports</strong>
        <select className="input-field" style={{ maxWidth: 280 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All reports</option>{REPORTS.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </div>
      {archive.loading ? <div style={{ padding: 24, textAlign: 'center' }}>Loading archive…</div> : !archive.data?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No reports have been generated yet.</div> :
        <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Report</th><th>Period</th><th>Format</th><th>Size</th><th>Prepared by</th><th>Generated</th><th /></tr></thead><tbody>
          {archive.data.map((r: any) => <tr key={r.id}>
            <td><strong>{nameOf(r.reportType)}</strong><div className="muted" style={{ fontSize: 12 }}>{r.title}</div></td>
            <td>{r.periodFrom ? `${shortDate(r.periodFrom)} – ${shortDate(r.periodTo)}` : `As at ${shortDate(r.periodTo)}`}</td>
            <td><Badge tone="muted">{r.format}</Badge></td>
            <td>{kb(r.sizeBytes)}</td>
            <td>{r.preparedBy ?? '—'}{r.approvedBy ? <div className="muted" style={{ fontSize: 12 }}>Approved: {r.approvedBy}</div> : null}</td>
            <td>{when(r.generatedAt)}</td>
            <td><button type="button" className="btn-secondary" disabled={!!busy} onClick={() => void again(r)}>{busy === r.id ? '…' : 'Download'}</button></td>
          </tr>)}
        </tbody></table></div>}
    </section>
  </div>;
}
