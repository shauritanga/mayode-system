'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { reportsApi } from '@/lib/api';
import { hasPermission } from '@/lib/nav';
import { useAuthStore } from '@/store/auth.store';
import { apiError, downloadCsv } from '@/lib/download';
import { EmptyState, InsightPanel, MetricTile, money } from '@/components/role-dashboards/DashboardPrimitives';

type Entry = { id: string; entryDate: string; type: string; amount: number; description: string; invoiceNumber: string; runningBalance: number };
export default function PremiumFundPage() {
  const user = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setEntries((await reportsApi.premiumFund()).data); } catch (err) { setError(apiError(err)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = entries.filter((e) => (!from || e.entryDate.slice(0, 10) >= from) && (!to || e.entryDate.slice(0, 10) <= to));
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { await reportsApi.createPremiumExpense({ amount: Number(amount), description: description.trim(), entryDate: new Date(date).toISOString() }); setAmount(''); setDescription(''); await load(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  }
  return <div className="page-shell">
    <div><h1 className="page-title">Fairtrade Premium Fund</h1><p className="page-subtitle">Income from cooperative sales, approved expenditure, and the running fund balance.</p></div>
    {error && <div className="alert-box alert-danger" role="alert">{error}<button className="btn-secondary" onClick={() => void load()}>Retry</button></div>}
    <div className="role-grid">
      <MetricTile label="Fund balance" value={loading || error ? '—' : money(entries.at(-1)?.runningBalance ?? 0)} hint="All recorded income less expenditure" />
      <MetricTile label="Income in period" value={money(filtered.filter((e) => e.type === 'INCOME').reduce((s, e) => s + e.amount, 0))} />
      <MetricTile label="Expenditure in period" value={money(filtered.filter((e) => e.type === 'EXPENSE').reduce((s, e) => s + e.amount, 0))} tone="gold" />
    </div>
    <InsightPanel title="Fund ledger">
      <div className="form-grid"><label className="form-label">From<input className="input-field" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label><label className="form-label">To<input className="input-field" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label><button className="btn-secondary" disabled={!filtered.length} onClick={() => downloadCsv('fairtrade-premium-fund.csv', filtered)}>Export CSV</button></div>
      {loading ? <p>Loading ledger…</p> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Invoice</th><th>Type</th><th>Amount</th><th>Balance</th></tr></thead><tbody>{filtered.map((e) => <tr key={e.id}><td>{e.entryDate.slice(0, 10)}</td><td>{e.description}</td><td>{e.invoiceNumber || '—'}</td><td>{e.type}</td><td>{money(e.amount)}</td><td>{money(e.runningBalance)}</td></tr>)}</tbody></table>{!filtered.length && <EmptyState>No fund entries for this period.</EmptyState>}</div>}
    </InsightPanel>
    {hasPermission(user, 'reports', 'CREATE') && <InsightPanel title="Record fund expenditure" subtitle="Premium income is generated from sales. Record the purpose and decision reference for each expense."><form className="form-grid" onSubmit={submit}><label className="form-label">Amount (TZS)<input className="input-field" type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label className="form-label">Date<input className="input-field" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label><label className="form-label form-grid-wide">Purpose / decision reference<textarea className="input-field" required value={description} onChange={(e) => setDescription(e.target.value)} /></label><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record expenditure'}</button></form></InsightPanel>}
  </div>;
}
