'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { BookOpen, Building2, ChartNoAxesCombined, ChevronRight, Factory, FileChartColumn, HandCoins, Landmark, Package, ReceiptText, Scale, ShoppingCart, UsersRound, Wheat } from 'lucide-react';
import { accountingApi, financeApi, inventoryApi, loansApi, mamcosApi, salesApi, suppliersApi } from '@/lib/api';
import ErrorBanner from '@/components/ErrorBanner';
import Modal from '@/components/Modal';
import { useAuthStore } from '@/store/auth.store';
import { BankReconciliationView, CashTransactionsView, DocumentsView, PeriodCloseView, TaxSettingsView, VatReturnView } from './controls';

const MENU = [
  ['Farmer Financial Accounts', 'farmer-financial-accounts', ['Farmer Ledger', 'Farmer Balances', 'Advances', 'Deductions', 'Farmer Statements']],
  ['Paddy Procurement', 'paddy-procurement', ['Paddy Purchases', 'Paddy Deliveries', 'Procurement Payables', 'Quality Adjustments']],
  ['Farmer Settlements', 'farmer-settlements', ['Settlement Batches', 'Payment Approvals', 'Partial Payments', 'Settlement Reconciliation']],
  ['Rice Sales & Receivables', 'rice-sales-receivables', ['Sales Invoices', 'Customer Receipts', 'Credit Sales', 'Customer Debtors']],
  ['Milling Cost Accounting', 'milling-cost-accounting', ['Production Costs', 'Milling Yield', 'By-products', 'Cost per Kilogram']],
  ['Cash & Banking', 'cash-banking', ['Cashbooks', 'Bank Accounts', 'Mobile Money', 'Bank Reconciliation']],
  ['Purchases & Suppliers', 'purchases-suppliers', ['Supplier Bills', 'Supplier Payments', 'Outstanding Balances']],
  ['Expenses & Income', 'expenses-income', ['Expenses', 'Other Income']],
  ['Assets & Loans', 'assets-loans', ['Equipment Register', 'Depreciation', 'Borrowings', 'Interest']],
  ['General Ledger', 'general-ledger', ['Chart of Accounts', 'Journal Entries', 'Trial Balance', 'Account Balances', 'Period Close']],
  ['Budgets & Cooperative Funds', 'budgets-cooperative-funds', ['Annual Budgets', 'Member Contributions', 'Reserves', 'Approved Allocations']],
  ['Financial Reports', 'financial-reports', ['Income Statement', 'Balance Sheet', 'Cash Flow Statement', 'Farmer Liabilities']],
  ['Tax & Compliance', 'tax-compliance', ['VAT Return', 'Tax Settings']],
] as const;

const MENU_ICONS = [UsersRound, Wheat, HandCoins, ShoppingCart, Factory, Landmark, Package, ReceiptText, Building2, BookOpen, ChartNoAxesCombined, FileChartColumn, Scale];

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const titleCase = (value: string) => value.split('-').map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');
const formatTzs = (value: number) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(Number(value) || 0);
const todayEAT = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
const unwrap = (data: any): any[] => Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data && typeof data === 'object' ? [data] : [];
const scalar = (value: any): string => {
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} records` : value.name || value.label || value.invoiceNumber || value.controlNumber || 'Details';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('day')}-${part('month')}-${part('year')}`;
  }
  return String(value);
};

export default function AccountingPage() {
  const params = useParams<{ slug?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useAuthStore((state) => state.user);
  const path = params?.slug ?? [];
  const category = MENU.find((item) => item[1] === path[0]);
  const [openCategory, setOpenCategory] = useState(path[0] ?? MENU[0][1]);
  const selectedCategory = category ?? MENU.find((item) => item[1] === openCategory) ?? MENU[0];
  const submenu = selectedCategory[2].find((item) => slug(item) === path[1]) ?? selectedCategory[2][0];
  const title = submenu;
  const [records, setRecords] = useState<any[]>([]);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trialBalanceAsOf, setTrialBalanceAsOf] = useState(todayEAT);
  const [accountBalancesAsOf, setAccountBalancesAsOf] = useState(todayEAT);
  const [accountBalanceSearch, setAccountBalanceSearch] = useState('');
  const [accountBalanceType, setAccountBalanceType] = useState('ALL');
  const [journalSearch, setJournalSearch] = useState('');
  const [journalFrom, setJournalFrom] = useState('');
  const [journalTo, setJournalTo] = useState('');
  const [journalOrigin, setJournalOrigin] = useState('');

  useEffect(() => {
    if (path[0]) setOpenCategory(path[0]);
  }, [path[0]]);

  const request = useMemo(() => {
    const key = `${path[0] ?? selectedCategory[1]}/${path[1] ?? slug(submenu)}`;
    const calls: Record<string, () => Promise<any>> = {
      'farmer-financial-accounts/farmer-ledger': () => inventoryApi.getAll(),
      'farmer-financial-accounts/farmer-balances': () => inventoryApi.getAll(),
      'farmer-financial-accounts/advances': () => loansApi.getAll(),
      'farmer-financial-accounts/deductions': () => loansApi.getAll(),
      'farmer-financial-accounts/farmer-statements': () => accountingApi.statements(),
      'paddy-procurement/paddy-purchases': () => inventoryApi.getAll(),
      'paddy-procurement/paddy-deliveries': () => inventoryApi.getAll(),
      'paddy-procurement/procurement-payables': () => accountingApi.payables(),
      'paddy-procurement/quality-adjustments': () => inventoryApi.getAll(),
      'farmer-settlements/settlement-batches': () => salesApi.list(),
      'farmer-settlements/payment-approvals': () => salesApi.list(),
      'farmer-settlements/partial-payments': () => salesApi.list(),
      'farmer-settlements/settlement-reconciliation': () => salesApi.list(),
      'rice-sales-receivables/sales-invoices': () => salesApi.list(),
      'rice-sales-receivables/customer-receipts': () => accountingApi.receivables(),
      'rice-sales-receivables/credit-sales': () => accountingApi.receivables(),
      'rice-sales-receivables/customer-debtors': () => Promise.resolve({ data: [] }),
      'milling-cost-accounting/production-costs': () => financeApi.getAllCosts(),
      'milling-cost-accounting/milling-yield': () => inventoryApi.dashboardSummary(),
      'milling-cost-accounting/by-products': () => inventoryApi.lots(),
      'milling-cost-accounting/cost-per-kilogram': () => financeApi.getAllCosts(),
      'cash-banking/cashbooks': () => accountingApi.cashFlow(),
      'cash-banking/bank-accounts': () => Promise.resolve({ data: [] }),
      'cash-banking/mobile-money': () => accountingApi.cashFlow(),
      'cash-banking/bank-reconciliation': () => Promise.resolve({ data: [] }),
      'purchases-suppliers/supplier-bills': () => Promise.resolve({ data: [] }),
      'purchases-suppliers/supplier-payments': () => accountingApi.payables(),
      'purchases-suppliers/outstanding-balances': () => accountingApi.payables(),
      'assets-loans/equipment-register': () => Promise.resolve({ data: [] }),
      'assets-loans/depreciation': () => accountingApi.trialBalance(),
      'assets-loans/borrowings': () => loansApi.getAll(),
      'assets-loans/interest': () => loansApi.getAll(),
      'general-ledger/chart-of-accounts': () => accountingApi.accounts(),
      'general-ledger/journal-entries': () => accountingApi.journalEntries({ q: journalSearch.trim() || undefined, from: journalFrom || undefined, to: journalTo || undefined, sourceType: journalOrigin || undefined }),
      'general-ledger/trial-balance': () => accountingApi.trialBalance({ to: trialBalanceAsOf }),
      'general-ledger/account-balances': () => accountingApi.accountBalances({ to: accountBalancesAsOf }),
      'budgets-cooperative-funds/annual-budgets': () => accountingApi.listBudgets(),
      'budgets-cooperative-funds/member-contributions': () => accountingApi.memberContributions(),
      'budgets-cooperative-funds/reserves': () => accountingApi.reserves(),
      'budgets-cooperative-funds/approved-allocations': () => accountingApi.approvedAllocations(),
      'financial-reports/income-statement': () => accountingApi.profitLoss(),
      'financial-reports/balance-sheet': () => accountingApi.balanceSheet(),
      'financial-reports/cash-flow-statement': () => accountingApi.cashFlow(),
      'financial-reports/farmer-liabilities': () => accountingApi.farmerLiabilities(),
      'general-ledger/period-close': () => Promise.resolve({ data: [] }),
      'expenses-income/expenses': () => Promise.resolve({ data: [] }),
      'expenses-income/other-income': () => Promise.resolve({ data: [] }),
      'tax-compliance/vat-return': () => Promise.resolve({ data: [] }),
      'tax-compliance/tax-settings': () => Promise.resolve({ data: [] }),
    };
    return calls[key] ?? (() => accountingApi.statements());
  }, [path[0], path[1], selectedCategory, submenu, trialBalanceAsOf, accountBalancesAsOf, journalSearch, journalFrom, journalTo, journalOrigin]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    request().then((result) => { if (active) setRecords(unwrap(result.data)); })
      .catch((reason) => { if (active) setError(reason?.response?.data?.message || reason?.message || 'Could not load accounting records.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, reload]);

  const isAnnualBudget = submenu === 'Annual Budgets';
  const [budgetAccounts, setBudgetAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState('');
  const [budgetDetail, setBudgetDetail] = useState<any>(null);
  const [budgetDetailLoading, setBudgetDetailLoading] = useState(false);
  const [approvingBudgetId, setApprovingBudgetId] = useState('');
  const [budgetForm, setBudgetForm] = useState({ name: '', fiscalYear: '', seasonLabel: '', startDate: '', endDate: '', mamcosId: '' });
  const [budgetLines, setBudgetLines] = useState<{ accountId: string; amount: string }[]>([{ accountId: '', amount: '' }]);
  const [contributionFormOpen, setContributionFormOpen] = useState(false);
  const [contributionSaving, setContributionSaving] = useState(false);
  const [contributionError, setContributionError] = useState('');
  const [contributionForm, setContributionForm] = useState({ farmerId: '', amount: '', contributionDate: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH', reference: '', description: '' });
  const [reserveFormOpen, setReserveFormOpen] = useState(false);
  const [reserveSaving, setReserveSaving] = useState(false);
  const [reserveError, setReserveError] = useState('');
  const [reserveCooperatives, setReserveCooperatives] = useState<{ id: string; name: string }[]>([]);
  const [reserveForm, setReserveForm] = useState({ mamcosId: '', amount: '', allocationDate: new Date().toISOString().slice(0, 10), description: '' });
  const [reversing, setReversing] = useState<any>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseDate, setReverseDate] = useState(todayEAT);
  const [reverseSaving, setReverseSaving] = useState(false);
  const [reverseError, setReverseError] = useState('');
  const [journalFormOpen, setJournalFormOpen] = useState(false);
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalError, setJournalError] = useState('');
  const [journalForm, setJournalForm] = useState({ entryDate: new Date().toISOString().slice(0, 10), description: '' });
  const emptyJournalLines = () => [{ accountId: '', side: 'debit', amount: '' }, { accountId: '', side: 'credit', amount: '' }];
  const [journalLines, setJournalLines] = useState(emptyJournalLines);

  useEffect(() => {
    if (!isAnnualBudget && submenu !== 'Journal Entries') return;
    accountingApi.accounts().then((result) => setBudgetAccounts(unwrap(result.data)))
      .catch((reason) => {
        const status = reason?.response?.status;
        const serverMessage = reason?.response?.data?.message;
        if (status === 403) setError('Your role needs Accounting → View permission to load the chart of accounts.');
        else if (serverMessage) setError(`Could not load chart of accounts: ${Array.isArray(serverMessage) ? serverMessage.join(', ') : serverMessage}`);
        else if (status) setError(`Could not load chart of accounts (HTTP ${status}).`);
        else setError('Could not reach the accounting API. Check that the backend is running and the configured API URL is correct.');
      });
  }, [isAnnualBudget, submenu]);

  useEffect(() => {
    if (!['Reserves', 'Annual Budgets'].includes(submenu) || (currentUser?.mamcosId && currentUser.role !== 'SUPER_ADMIN')) return;
    mamcosApi.getAll().then((result) => setReserveCooperatives(result.data ?? []))
      .catch((reason) => setError(reason?.response?.data?.message || 'Could not load cooperatives.'));
  }, [submenu, currentUser?.mamcosId, currentUser?.role]);

  const saveBudget = async () => {
    setBudgetSaving(true);
    setBudgetError('');
    try {
      await accountingApi.createBudget({
        name: budgetForm.name,
        mamcosId: budgetForm.mamcosId || undefined,
        fiscalYear: budgetForm.fiscalYear ? Number(budgetForm.fiscalYear) : undefined,
        seasonLabel: budgetForm.seasonLabel || undefined,
        startDate: budgetForm.startDate,
        endDate: budgetForm.endDate,
        lines: budgetLines.filter((line) => line.accountId && line.amount).map((line) => ({ accountId: line.accountId, amount: Number(line.amount) })),
      });
      setBudgetFormOpen(false);
      setBudgetForm({ name: '', fiscalYear: '', seasonLabel: '', startDate: '', endDate: '', mamcosId: '' });
      setBudgetLines([{ accountId: '', amount: '' }]);
      setReload((value) => value + 1);
    } catch (reason: any) {
      setBudgetError(reason?.response?.data?.message || 'Could not save this annual budget.');
    } finally {
      setBudgetSaving(false);
    }
  };

  const showBudgetActual = async (id: string) => {
    setBudgetDetailLoading(true);
    setBudgetDetail(null);
    try {
      const result = await accountingApi.budgetActual(id);
      setBudgetDetail(result.data);
    } catch (reason: any) {
      setError(reason?.response?.data?.message || 'Could not load budget actuals.');
    } finally {
      setBudgetDetailLoading(false);
    }
  };

  const approveBudget = async (id: string) => {
    setApprovingBudgetId(id);
    setError('');
    try {
      await accountingApi.approveBudget(id);
      setReload((value) => value + 1);
    } catch (reason: any) {
      setError(reason?.response?.data?.message || 'Could not approve this budget.');
    } finally {
      setApprovingBudgetId('');
    }
  };

  const saveContribution = async () => {
    setContributionSaving(true);
    setContributionError('');
    try {
      await accountingApi.createMemberContribution({
        ...contributionForm,
        amount: Number(contributionForm.amount),
        reference: contributionForm.reference || undefined,
        description: contributionForm.description || undefined,
      });
      setContributionFormOpen(false);
      setContributionForm({ farmerId: '', amount: '', contributionDate: new Date().toISOString().slice(0, 10), paymentMethod: 'CASH', reference: '', description: '' });
      setReload((value) => value + 1);
    } catch (reason: any) {
      setContributionError(reason?.response?.data?.message || 'Could not save the member contribution.');
    } finally {
      setContributionSaving(false);
    }
  };

  const saveReserveAllocation = async () => {
    setReserveSaving(true);
    setReserveError('');
    try {
      await accountingApi.createReserveAllocation({
        amount: Number(reserveForm.amount),
        allocationDate: reserveForm.allocationDate,
        description: reserveForm.description || undefined,
        mamcosId: reserveForm.mamcosId || undefined,
      });
      setReserveFormOpen(false);
      setReserveForm({ mamcosId: '', amount: '', allocationDate: new Date().toISOString().slice(0, 10), description: '' });
      setReload((value) => value + 1);
    } catch (reason: any) {
      setReserveError(reason?.response?.data?.message || 'Could not save this reserve allocation.');
    } finally {
      setReserveSaving(false);
    }
  };

  const reverseJournal = async () => {
    if (!reversing) return;
    setReverseSaving(true);
    setReverseError('');
    try {
      await accountingApi.reverseJournal(reversing.id, { reason: reverseReason, date: reverseDate });
      setReversing(null);
      setReverseReason('');
      setReload((value) => value + 1);
    } catch (reason: any) {
      const message = reason?.response?.data?.message;
      setReverseError(Array.isArray(message) ? message.join(', ') : message || 'Could not reverse this journal.');
    } finally {
      setReverseSaving(false);
    }
  };

  const saveJournalEntry = async () => {
    setJournalSaving(true);
    setJournalError('');
    try {
      await accountingApi.createJournalEntry({
        entryDate: journalForm.entryDate,
        description: journalForm.description,
        lines: journalLines.map((line) => ({ accountId: line.accountId, debit: line.side === 'debit' ? Number(line.amount || 0) : 0, credit: line.side === 'credit' ? Number(line.amount || 0) : 0 })),
      });
      setJournalFormOpen(false);
      setJournalForm({ entryDate: new Date().toISOString().slice(0, 10), description: '' });
      setJournalLines(emptyJournalLines());
      setReload((value) => value + 1);
    } catch (reason: any) {
      setJournalError(reason?.response?.data?.message || 'Could not post this journal entry.');
    } finally {
      setJournalSaving(false);
    }
  };

  const columns = useMemo(() => {
    const fields = new Set<string>();
    const hideSystemFields = submenu === 'Chart of Accounts' || submenu === 'Bank Accounts';
    records.forEach((record) => Object.keys(record ?? {}).filter((key) => {
      if (typeof record[key] === 'object' && record[key] !== null) return false;
      return !hideSystemFields || !['id', 'createdat', 'created_at'].includes(key.toLowerCase());
    }).forEach((key) => fields.add(key)));
    return [...fields].slice(0, 8);
  }, [records, submenu]);
  const emptyMessage = submenu === 'Bank Accounts'
    ? 'No bank accounts have been registered.'
    : submenu === 'Equipment Register'
      ? 'No equipment has been registered.'
      : `No ${title.toLowerCase()} records found.`;
  const incomeStatement = submenu === 'Income Statement' ? records[0] : null;
  const balanceSheet = submenu === 'Balance Sheet' ? records[0] : null;
  const cashFlow = submenu === 'Cash Flow Statement' ? records[0] : null;
  const farmerLiabilities = submenu === 'Farmer Liabilities' ? records[0] : null;
  const memberContributionReport = submenu === 'Member Contributions' ? records[0] : null;
  const reserveReport = submenu === 'Reserves' ? records[0] : null;
  const approvedAllocationReport = submenu === 'Approved Allocations' ? records[0] : null;
  const journalEntries = submenu === 'Journal Entries' ? records : null;
  const trialBalanceReport = submenu === 'Trial Balance' ? records[0] : null;
  const accountBalanceReport = submenu === 'Account Balances' ? records[0] : null;
  const visibleAccountBalances = (accountBalanceReport?.balances ?? []).filter((account: any) => {
    const matchesType = accountBalanceType === 'ALL' || account.type === accountBalanceType;
    const query = accountBalanceSearch.trim().toLowerCase();
    const matchesSearch = !query || `${account.code} ${account.name}`.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });
  const canEditAccounting = currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.some((permission) => permission.resource === 'accounting' && permission.action === 'EDIT');
  const canDeleteAccounting = currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.some((permission) => permission.resource === 'accounting' && permission.action === 'DELETE');
  const canCreateAccounting = currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.some((permission) => permission.resource === 'accounting' && permission.action === 'CREATE');
  const reportDate = (value?: string | null) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return scalar(value);
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  };
  const periodLabel = incomeStatement
    ? incomeStatement.period?.from || incomeStatement.period?.to
      ? `${reportDate(incomeStatement.period?.from) ?? 'Start'} – ${reportDate(incomeStatement.period?.to) ?? 'Current'}`
      : 'All available dates'
    : '';

  const customKey = `${selectedCategory[1]}/${slug(submenu)}`;
  const customView = customKey === 'cash-banking/bank-reconciliation' ? <BankReconciliationView canCreate={!!canCreateAccounting} canEdit={!!canEditAccounting} canDelete={!!canDeleteAccounting} />
    : customKey === 'general-ledger/period-close' ? <PeriodCloseView canClose={!!canEditAccounting} canReopen={!!canDeleteAccounting} />
    : customKey === 'expenses-income/expenses' ? <CashTransactionsView kind="EXPENSE" canCreate={!!canCreateAccounting} canEdit={!!canEditAccounting} />
    : customKey === 'expenses-income/other-income' ? <CashTransactionsView kind="INCOME" canCreate={!!canCreateAccounting} canEdit={!!canEditAccounting} />
    : customKey === 'tax-compliance/vat-return' ? <VatReturnView canCreate={!!canCreateAccounting} />
    : customKey === 'tax-compliance/tax-settings' ? <TaxSettingsView canEdit={!!canEditAccounting} />
    : customKey === 'rice-sales-receivables/customer-debtors' ? <DocumentsView kind="invoice" canCreate={!!canCreateAccounting} canEdit={!!canEditAccounting} />
    : customKey === 'purchases-suppliers/supplier-bills' ? <DocumentsView kind="bill" canCreate={!!canCreateAccounting} canEdit={!!canEditAccounting} />
    : null;

  return <main>
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 4, height: 26, borderRadius: 9, background: 'var(--gold-400)' }} /><h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, margin: 0 }}>{title}</h1></div>
    </div>
    <ErrorBanner message={error} onDismiss={() => setError('')} />
    <div className="accounting-layout">
      <aside className="accounting-subsidebar" aria-label="Accounting & Finance sections">
        <div className="accounting-subsidebar-heading">Accounting &amp; Finance</div>
        {MENU.map(([label, section, pages], index) => {
          const Icon = MENU_ICONS[index];
          const expanded = openCategory === section;
          return <div key={section} className="accounting-nav-group">
            <button type="button" aria-expanded={expanded} onClick={() => {
              if (expanded) setOpenCategory('');
              else {
                setOpenCategory(section);
                router.push(`/dashboard/accounting/${section}/${slug(pages[0])}`);
              }
            }} className={`accounting-nav-category ${expanded ? 'is-open' : ''}`}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              <ChevronRight size={16} className="accounting-nav-chevron" />
            </button>
            {expanded && <div className="accounting-nav-children">{pages.map((page) => {
              const href = `/dashboard/accounting/${section}/${slug(page)}`;
              const active = pathname === href || ((!path[1] && section === selectedCategory[1]) && page === selectedCategory[2][0]);
              return <Link key={page} href={href} className={`accounting-nav-child ${active ? 'is-active' : ''}`}>{page}</Link>;
            })}</div>}
          </div>;
        })}
      </aside>
      <div className="accounting-workspace">
      <>
      {customView ? customView : approvedAllocationReport ? <div className="approved-allocation-report">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}><h2 style={{ margin: 0, fontSize: 20 }}>Approved Allocations</h2><p className="muted" style={{ margin: '6px 0 0' }}>Account allocations from budgets approved by an accounting editor.</p></section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Approved allocation total</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(approvedAllocationReport.totalApproved)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Approved budgets</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{approvedAllocationReport.budgetCount ?? 0}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Account allocations</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{approvedAllocationReport.allocationCount ?? 0}</strong></div>
        </div>
        <section className="table-panel"><div className="section-toolbar"><strong>Approved account allocations</strong></div>
          {!approvedAllocationReport.allocations?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No budget allocations have been approved.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Budget</th><th>Cooperative</th><th>Fiscal year</th><th>Period</th><th>Account</th><th>Approved on</th><th className="num">Allocation (TZS)</th></tr></thead><tbody>
            {approvedAllocationReport.allocations.map((allocation: any) => <tr key={allocation.id}><td>{allocation.budgetName}</td><td>{allocation.cooperative ?? '—'}</td><td>{allocation.fiscalYear ?? '—'}</td><td>{scalar(allocation.periodStart)} – {scalar(allocation.periodEnd)}</td><td>{allocation.account?.code} · {allocation.account?.name}</td><td>{scalar(allocation.approvedAt)}</td><td className="num">{formatTzs(allocation.amount)}</td></tr>)}
          </tbody></table></div>}
        </section>
      </div> : reserveReport ? <div className="reserve-report">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 20 }}>Cooperative Reserves</h2><p className="muted" style={{ margin: '6px 0 0' }}>Appropriate retained earnings to reserves. This is an equity transfer, not a cash payment.</p></div><button type="button" className="btn-primary" onClick={() => { setReserveError(''); setReserveFormOpen(true); }}>Allocate to reserve</button></div></section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Reserve allocations</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(reserveReport.totalAllocated)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Allocation entries</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{reserveReport.allocationCount ?? 0}</strong></div>
        </div>
        <section className="table-panel"><div className="section-toolbar"><strong>Reserve allocation register</strong></div>
          {!reserveReport.allocations?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No reserve allocations have been recorded.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Cooperative</th><th>Description</th><th className="num">Amount (TZS)</th></tr></thead><tbody>
            {reserveReport.allocations.map((allocation: any) => <tr key={allocation.id}><td>{scalar(allocation.allocationDate)}</td><td>{allocation.mamcos?.name ?? '—'}</td><td>{allocation.description || 'Reserve allocation'}</td><td className="num">{formatTzs(allocation.amount)}</td></tr>)}
          </tbody></table></div>}
        </section>
        {reserveFormOpen && <Modal title="Allocate retained earnings to reserve" onClose={() => !reserveSaving && setReserveFormOpen(false)} width="520px" footer={<><button type="button" className="btn-secondary" onClick={() => setReserveFormOpen(false)} disabled={reserveSaving}>Cancel</button><button type="submit" form="reserve-allocation-form" className="btn-primary" disabled={reserveSaving}>{reserveSaving ? 'Saving…' : 'Record allocation'}</button></>}>
          <form id="reserve-allocation-form" onSubmit={(event) => { event.preventDefault(); void saveReserveAllocation(); }} style={{ display: 'grid', gap: 10 }}>
            {(!currentUser?.mamcosId || currentUser.role === 'SUPER_ADMIN') && <label className="form-label">Cooperative<select className="input-field" required value={reserveForm.mamcosId} onChange={(event) => setReserveForm({ ...reserveForm, mamcosId: event.target.value })}><option value="">Select cooperative</option>{reserveCooperatives.map((cooperative) => <option key={cooperative.id} value={cooperative.id}>{cooperative.name}</option>)}</select></label>}
            <label className="form-label">Amount (TZS)<input className="input-field" type="number" min="0.01" step="1" required value={reserveForm.amount} onChange={(event) => setReserveForm({ ...reserveForm, amount: event.target.value })} /></label>
            <label className="form-label">Allocation date<input className="input-field" type="date" required value={reserveForm.allocationDate} onChange={(event) => setReserveForm({ ...reserveForm, allocationDate: event.target.value })} /></label>
            <label className="form-label">Description<input className="input-field" value={reserveForm.description} onChange={(event) => setReserveForm({ ...reserveForm, description: event.target.value })} placeholder="e.g. Annual general reserve allocation" /></label>
            {reserveError && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{reserveError}</div>}
          </form>
        </Modal>}
      </div> : memberContributionReport ? <div className="member-contributions-report">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 20 }}>Member Contributions</h2><p className="muted" style={{ margin: '6px 0 0' }}>Record member capital contributions and post them to cooperative equity.</p></div><button type="button" className="btn-primary" onClick={() => { setContributionError(''); setContributionFormOpen(true); }}>Record contribution</button></div></section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Contributions received</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(memberContributionReport.totalContributions)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Contributing members</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{memberContributionReport.memberCount ?? 0}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Contribution records</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{memberContributionReport.paymentCount ?? 0}</strong></div>
        </div>
        <section className="table-panel"><div className="section-toolbar"><strong>Contribution register</strong></div>
          {!memberContributionReport.contributions?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No member contributions have been recorded.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Date</th><th>Member</th><th>Control number</th><th>Payment method</th><th>Reference</th><th>Description</th><th className="num">Contribution (TZS)</th></tr></thead><tbody>
            {memberContributionReport.contributions.map((contribution: any) => <tr key={contribution.id}><td>{scalar(contribution.contributionDate)}</td><td>{contribution.farmer ? `${contribution.farmer.firstName} ${contribution.farmer.lastName}` : '—'}</td><td>{contribution.farmer?.controlNumber ?? '—'}</td><td>{contribution.paymentMethod || '—'}</td><td>{contribution.reference || '—'}</td><td>{contribution.description || '—'}</td><td className="num">{formatTzs(contribution.amount)}</td></tr>)}
          </tbody></table></div>}
        </section>
        {contributionFormOpen && <Modal title="Record member contribution" onClose={() => !contributionSaving && setContributionFormOpen(false)} width="560px" footer={<><button type="button" className="btn-secondary" onClick={() => setContributionFormOpen(false)} disabled={contributionSaving}>Cancel</button><button type="submit" form="member-contribution-form" className="btn-primary" disabled={contributionSaving}>{contributionSaving ? 'Saving…' : 'Save contribution'}</button></>}>
          <form id="member-contribution-form" onSubmit={(event) => { event.preventDefault(); void saveContribution(); }} style={{ display: 'grid', gap: 10 }}>
            <label className="form-label">Member<select className="input-field" required value={contributionForm.farmerId} onChange={(event) => setContributionForm({ ...contributionForm, farmerId: event.target.value })}><option value="">Select member</option>{(memberContributionReport.members ?? []).map((member: any) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.controlNumber}</option>)}</select></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="form-label">Amount (TZS)<input className="input-field" type="number" min="0.01" step="1" required value={contributionForm.amount} onChange={(event) => setContributionForm({ ...contributionForm, amount: event.target.value })} /></label>
              <label className="form-label">Contribution date<input className="input-field" type="date" required value={contributionForm.contributionDate} onChange={(event) => setContributionForm({ ...contributionForm, contributionDate: event.target.value })} /></label>
            </div>
            <label className="form-label">Payment method<select className="input-field" value={contributionForm.paymentMethod} onChange={(event) => setContributionForm({ ...contributionForm, paymentMethod: event.target.value })}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="MOBILE_MONEY">Mobile money</option><option value="OTHER">Other</option></select></label>
            <label className="form-label">Payment reference<input className="input-field" value={contributionForm.reference} onChange={(event) => setContributionForm({ ...contributionForm, reference: event.target.value })} /></label>
            <label className="form-label">Description<input className="input-field" value={contributionForm.description} onChange={(event) => setContributionForm({ ...contributionForm, description: event.target.value })} placeholder="Optional" /></label>
            {contributionError && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{contributionError}</div>}
          </form>
        </Modal>}
      </div> : isAnnualBudget ? <div className="annual-budget-workspace">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0, fontSize: 20 }}>Annual Budgets</h2><p className="muted" style={{ margin: '6px 0 0' }}>Plan account allocations and compare approved amounts with ledger actuals.</p></div>
            <button type="button" className="btn-primary" onClick={() => { setBudgetError(''); setBudgetFormOpen(true); }}>New budget</button>
          </div>
        </section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Budgets</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{records.length}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total planned allocations</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(records.reduce((sum, budget) => sum + (budget.lines ?? []).reduce((lineSum: number, line: any) => lineSum + Number(line.amount || 0), 0), 0))}</strong></div>
        </div>
        <section className="table-panel"><div className="section-toolbar"><strong>Budget register</strong></div>
          {loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading budgets…</div> : !records.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No annual budgets have been created.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Budget</th><th>Fiscal year / season</th><th>Period</th><th>Status</th><th className="num">Planned</th><th className="num">Accounts</th><th>Actions</th></tr></thead><tbody>
            {records.map((budget) => <tr key={budget.id}><td style={{ fontWeight: 600 }}>{budget.name}</td><td>{[budget.fiscalYear, budget.seasonLabel].filter(Boolean).join(' · ') || '—'}</td><td>{scalar(budget.startDate)} – {scalar(budget.endDate)}</td><td><span className={`badge ${budget.status === 'APPROVED' ? 'badge-green' : 'badge-gold'}`}>{budget.status ?? 'DRAFT'}</span></td><td className="num">{formatTzs((budget.lines ?? []).reduce((sum: number, line: any) => sum + Number(line.amount || 0), 0))}</td><td className="num">{budget.lines?.length ?? 0}</td><td style={{ display: 'flex', gap: 6 }}><button type="button" className="btn-secondary" onClick={() => showBudgetActual(budget.id)}>View actuals</button>{budget.status === 'DRAFT' && canEditAccounting && <button type="button" className="btn-primary" disabled={approvingBudgetId === budget.id} onClick={() => void approveBudget(budget.id)}>{approvingBudgetId === budget.id ? 'Approving…' : 'Approve'}</button>}</td></tr>)}
          </tbody></table></div>}
        </section>
        {budgetFormOpen && <Modal title="Create annual budget" onClose={() => !budgetSaving && setBudgetFormOpen(false)} width="600px" footer={<><button type="button" className="btn-secondary" onClick={() => setBudgetFormOpen(false)} disabled={budgetSaving}>Cancel</button><button type="submit" form="annual-budget-form" className="btn-primary" disabled={budgetSaving}>{budgetSaving ? 'Saving…' : 'Save budget'}</button></>}>
          <form id="annual-budget-form" onSubmit={(event) => { event.preventDefault(); void saveBudget(); }} style={{ display: 'grid', gap: 10 }}>
            {(!currentUser?.mamcosId || currentUser.role === 'SUPER_ADMIN') && <label className="form-label">Cooperative<select className="input-field" required value={budgetForm.mamcosId} onChange={(event) => setBudgetForm({ ...budgetForm, mamcosId: event.target.value })}><option value="">Select cooperative</option>{reserveCooperatives.map((cooperative) => <option key={cooperative.id} value={cooperative.id}>{cooperative.name}</option>)}</select></label>}
            <label className="form-label">Budget name<input className="input-field" required value={budgetForm.name} onChange={(event) => setBudgetForm({ ...budgetForm, name: event.target.value })} placeholder="e.g. 2027 Annual Budget" /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="form-label">Fiscal year<input className="input-field" type="number" min="2000" max="2200" value={budgetForm.fiscalYear} onChange={(event) => setBudgetForm({ ...budgetForm, fiscalYear: event.target.value })} /></label>
              <label className="form-label">Season label<input className="input-field" value={budgetForm.seasonLabel} onChange={(event) => setBudgetForm({ ...budgetForm, seasonLabel: event.target.value })} placeholder="Optional" /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="form-label">Start date<input className="input-field" type="date" required value={budgetForm.startDate} onChange={(event) => setBudgetForm({ ...budgetForm, startDate: event.target.value })} /></label>
              <label className="form-label">End date<input className="input-field" type="date" required value={budgetForm.endDate} onChange={(event) => setBudgetForm({ ...budgetForm, endDate: event.target.value })} /></label>
            </div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Account allocations</div>
            {budgetLines.map((line, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px auto', gap: 8 }}>
              <select className="input-field" required value={line.accountId} onChange={(event) => setBudgetLines((current) => current.map((item, i) => i === index ? { ...item, accountId: event.target.value } : item))}><option value="">Choose account</option>{budgetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
              <input className="input-field" type="number" min="0" step="1" required placeholder="Amount (TZS)" value={line.amount} onChange={(event) => setBudgetLines((current) => current.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} />
              {budgetLines.length > 1 && <button type="button" className="btn-secondary" aria-label="Remove account allocation" onClick={() => setBudgetLines((current) => current.filter((_, i) => i !== index))}>×</button>}
            </div>)}
            <button type="button" className="btn-secondary" style={{ justifySelf: 'start' }} onClick={() => setBudgetLines((current) => [...current, { accountId: '', amount: '' }])}>Add account line</button>
            {budgetError && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{budgetError}</div>}
          </form>
        </Modal>}
        {(budgetDetail || budgetDetailLoading) && <Modal title="Budget versus actual" onClose={() => { setBudgetDetail(null); setBudgetDetailLoading(false); }} width="720px" footer={<button type="button" className="btn-secondary" onClick={() => { setBudgetDetail(null); setBudgetDetailLoading(false); }}>Close</button>}>
          {budgetDetailLoading || !budgetDetail ? <div style={{ padding: 24, textAlign: 'center' }}>Loading actuals…</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Account</th><th className="num">Budgeted (TZS)</th><th className="num">Actual (TZS)</th><th className="num">Variance (TZS)</th></tr></thead><tbody>
            {budgetDetail.lines.map((line: any) => <tr key={line.id}><td>{line.account?.code} · {line.account?.name}</td><td className="num">{formatTzs(line.amount)}</td><td className="num">{formatTzs(line.actual)}</td><td className="num" style={{ color: Number(line.variance) < 0 ? 'var(--red-500)' : 'var(--accent)' }}>{formatTzs(line.variance)}</td></tr>)}
          </tbody></table></div>}
        </Modal>}
      </div> : incomeStatement ? <div className="income-statement">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0, fontSize: 20 }}>Income Statement</h2><p className="muted" style={{ margin: '6px 0 0' }}>Cooperative income and expenditure for the selected accounting period.</p></div>
            <span className="badge badge-blue">TZS</span>
          </div>
          <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>Period: {periodLabel}</div>
        </section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total income</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(incomeStatement.income)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total expenses</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(incomeStatement.expenses)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Net surplus / (deficit)</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20, color: Number(incomeStatement.netProfit) >= 0 ? 'var(--accent)' : 'var(--red-500)' }}>{formatTzs(incomeStatement.netProfit)}</strong></div>
        </div>
        <StatementLines title="Income" lines={incomeStatement.incomeLines ?? []} />
        <StatementLines title="Expenses" lines={incomeStatement.expenseLines ?? []} />
        <div className="table-panel" style={{ marginTop: 16 }}><div className="section-toolbar"><strong>Net surplus / (deficit)</strong><strong>{formatTzs(incomeStatement.netProfit)}</strong></div></div>
      </div> : balanceSheet ? <div className="balance-sheet">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0, fontSize: 20 }}>Balance Sheet</h2><p className="muted" style={{ margin: '6px 0 0' }}>Cooperative assets, liabilities and equity at the reporting date.</p></div>
            <span className="badge badge-blue">TZS</span>
          </div>
          <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>As of {reportDate(balanceSheet.asOf) ?? 'Current date'}</div>
        </section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total assets</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(balanceSheet.assets)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total liabilities</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(balanceSheet.liabilities)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total equity</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(balanceSheet.totalEquity)}</strong></div>
        </div>
        <StatementLines title="Assets" lines={balanceSheet.assetLines ?? []} />
        <StatementLines title="Liabilities" lines={balanceSheet.liabilityLines ?? []} />
        <EquityStatementLines lines={balanceSheet.equityLines ?? []} retainedEarnings={balanceSheet.retainedEarnings ?? 0} />
        <section className="table-panel" style={{ marginTop: 16 }}>
          <div className="section-toolbar"><strong>Balance check</strong><span className={`badge ${Math.abs(Number(balanceSheet.balanceCheck ?? 0)) < 0.01 ? 'badge-green' : 'badge-red'}`}>{Math.abs(Number(balanceSheet.balanceCheck ?? 0)) < 0.01 ? 'Balanced' : 'Out of balance'}</span></div>
          <table className="data-table"><tbody>
            <tr><td>Total assets</td><td className="num">{formatTzs(balanceSheet.assets)}</td></tr>
            <tr><td>Total liabilities and equity</td><td className="num">{formatTzs(Number(balanceSheet.liabilities) + Number(balanceSheet.totalEquity))}</td></tr>
            <tr><th>Difference</th><th className="num">{formatTzs(balanceSheet.balanceCheck)}</th></tr>
          </tbody></table>
        </section>
      </div> : cashFlow ? <div className="cash-flow-statement">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0, fontSize: 20 }}>Cash Flow Statement</h2><p className="muted" style={{ margin: '6px 0 0' }}>Cash receipts and payments grouped by operating, investing and financing activity.</p></div>
            <span className="badge badge-blue">TZS</span>
          </div>
          <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>Period: {cashFlow.period?.from || cashFlow.period?.to ? `${reportDate(cashFlow.period?.from) ?? 'Start'} – ${reportDate(cashFlow.period?.to) ?? 'Current'}` : 'All available dates'}</div>
        </section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Opening cash balance</div><strong style={{ display: 'block', marginTop: 6, fontSize: 19 }}>{formatTzs(cashFlow.openingCashBalance)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Cash inflows</div><strong style={{ display: 'block', marginTop: 6, fontSize: 19 }}>{formatTzs(cashFlow.inflows)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Cash outflows</div><strong style={{ display: 'block', marginTop: 6, fontSize: 19 }}>{formatTzs(cashFlow.outflows)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Closing cash balance</div><strong style={{ display: 'block', marginTop: 6, fontSize: 19 }}>{formatTzs(cashFlow.closingCashBalance)}</strong></div>
        </div>
        <CashFlowSection title="Operating activities" data={cashFlow.operating} />
        <CashFlowSection title="Investing activities" data={cashFlow.investing} />
        <CashFlowSection title="Financing activities" data={cashFlow.financing} />
        <div className="table-panel" style={{ marginTop: 16 }}><div className="section-toolbar"><strong>Net change in cash</strong><strong>{formatTzs(cashFlow.netCashFlow)}</strong></div></div>
      </div> : trialBalanceReport ? <div className="trial-balance-report">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0, fontSize: 20 }}>Trial Balance</h2><p className="muted" style={{ margin: '6px 0 0' }}>Closing debit and credit balances for every general ledger account.</p></div>
            <label className="form-label" style={{ minWidth: 190 }}>As of date<input className="input-field" type="date" value={trialBalanceAsOf} onChange={(event) => setTrialBalanceAsOf(event.target.value)} /></label>
          </div>
        </section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total debits</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(trialBalanceReport.totalDebit)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Total credits</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(trialBalanceReport.totalCredit)}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Status</div><strong style={{ display: 'block', marginTop: 6 }}><span className={`badge ${trialBalanceReport.balanced ? 'badge-green' : 'badge-gold'}`}>{trialBalanceReport.balanced ? 'Balanced' : 'Out of balance'}</span></strong></div>
        </div>
        <section className="table-panel"><div className="section-toolbar"><strong>Account balances</strong><span className="muted">As of {reportDate(trialBalanceReport.asOf)}</span></div>
          {loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading trial balance…</div> : !trialBalanceReport.lines?.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No chart of accounts is available.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Account code</th><th>Account</th><th>Type</th><th className="num">Debit balance (TZS)</th><th className="num">Credit balance (TZS)</th></tr></thead><tbody>
            {trialBalanceReport.lines.map((line: any) => <tr key={line.code}><td>{line.code}</td><td style={{ fontWeight: 600 }}>{line.name}</td><td>{titleCase(String(line.type).toLowerCase())}</td><td className="num">{line.debitBalance ? formatTzs(line.debitBalance) : '—'}</td><td className="num">{line.creditBalance ? formatTzs(line.creditBalance) : '—'}</td></tr>)}
          </tbody><tfoot><tr><th colSpan={3}>Total</th><th className="num">{formatTzs(trialBalanceReport.totalDebit)}</th><th className="num">{formatTzs(trialBalanceReport.totalCredit)}</th></tr></tfoot></table></div>}
        </section>
        {!trialBalanceReport.balanced && <div className="table-panel" style={{ padding: 16, marginTop: 12, color: 'var(--red-400)' }}>The trial balance is out by {formatTzs(Math.abs(Number(trialBalanceReport.difference || 0)))}. Review journal entries before using these figures for reporting.</div>}
      </div> : accountBalanceReport ? <div className="account-balances-report">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0, fontSize: 20 }}>Account Balances</h2><p className="muted" style={{ margin: '6px 0 0' }}>Search account balances and ledger activity through the selected date.</p></div>
            <label className="form-label" style={{ minWidth: 190 }}>As of date<input className="input-field" type="date" value={accountBalancesAsOf} onChange={(event) => setAccountBalancesAsOf(event.target.value)} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) 220px', gap: 10, marginTop: 14 }}>
            <input className="input-field" value={accountBalanceSearch} onChange={(event) => setAccountBalanceSearch(event.target.value)} placeholder="Search by account code or name" aria-label="Search accounts" />
            <select className="input-field" value={accountBalanceType} onChange={(event) => setAccountBalanceType(event.target.value)} aria-label="Filter account type"><option value="ALL">All account types</option>{['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((type) => <option key={type} value={type}>{titleCase(type.toLowerCase())}</option>)}</select>
          </div>
        </section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Accounts shown</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{visibleAccountBalances.length} / {accountBalanceReport.accountCount}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Debit balances shown</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(visibleAccountBalances.filter((account: any) => account.balanceSide === 'DEBIT').reduce((sum: number, account: any) => sum + Number(account.balance), 0))}</strong></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Credit balances shown</div><strong style={{ display: 'block', marginTop: 6, fontSize: 20 }}>{formatTzs(visibleAccountBalances.filter((account: any) => account.balanceSide === 'CREDIT').reduce((sum: number, account: any) => sum + Number(account.balance), 0))}</strong></div>
        </div>
        <section className="table-panel"><div className="section-toolbar"><strong>General ledger balances</strong><span className="muted">Through {reportDate(accountBalanceReport.asOf)}</span></div>
          {loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading account balances…</div> : !visibleAccountBalances.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No accounts match your search and type filters.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Account code</th><th>Account name</th><th>Type</th><th className="num">Debits to date (TZS)</th><th className="num">Credits to date (TZS)</th><th>Balance side</th><th className="num">Balance (TZS)</th></tr></thead><tbody>
            {visibleAccountBalances.map((account: any) => <tr key={account.id}><td>{account.code}</td><td style={{ fontWeight: 600 }}>{account.name}</td><td>{titleCase(String(account.type).toLowerCase())}</td><td className="num">{formatTzs(account.debitActivity)}</td><td className="num">{formatTzs(account.creditActivity)}</td><td>{account.balanceSide === 'ZERO' ? '—' : titleCase(account.balanceSide.toLowerCase())}</td><td className="num">{formatTzs(account.balance)}</td></tr>)}
          </tbody></table></div>}
        </section>
      </div> : farmerLiabilities ? <div className="farmer-liabilities-report">
        <section className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Farmer Liabilities</h2>
          <p className="muted" style={{ margin: '6px 0 0' }}>Farmer loan balances and unpaid cooperative procurement are shown separately.</p>
        </section>
        <div className="metric-grid" style={{ marginBottom: 16 }}>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Farmer loan balances</div><strong style={{ display: 'block', marginTop: 6, fontSize: 19 }}>{formatTzs(farmerLiabilities.summary?.farmerLoanBalances)}</strong><div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{farmerLiabilities.summary?.farmersWithLoanBalances ?? 0} farmers</div></div>
          <div className="glass-card" style={{ padding: 16 }}><div className="muted" style={{ fontSize: 12 }}>Cooperative owes farmers</div><strong style={{ display: 'block', marginTop: 6, fontSize: 19 }}>{formatTzs(farmerLiabilities.summary?.cooperativeProcurementPayables)}</strong><div className="muted" style={{ marginTop: 4, fontSize: 12 }}>{farmerLiabilities.summary?.unpaidDeliveries ?? 0} unpaid deliveries</div></div>
        </div>
        <FarmerLiabilitySection title="Loan balances owed by farmers" empty="No outstanding farmer loan balances." rows={farmerLiabilities.loanObligations ?? []} />
        <FarmerProcurementSection rows={farmerLiabilities.procurementPayables ?? []} />
      </div> : journalEntries ? <div className="journal-entry-workspace">
        {canCreateAccounting && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}><button type="button" className="btn-primary" onClick={() => { setJournalError(''); setJournalFormOpen(true); }}>New journal entry</button></div>}
        <section className="table-panel"><div className="section-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}><strong>Journal register</strong>
          <input className="input-field" style={{ width: 200 }} placeholder="Search number or description" value={journalSearch} onChange={(event) => setJournalSearch(event.target.value)} />
          <input className="input-field" style={{ width: 150 }} type="date" aria-label="From date" value={journalFrom} onChange={(event) => setJournalFrom(event.target.value)} />
          <input className="input-field" style={{ width: 150 }} type="date" aria-label="To date" value={journalTo} onChange={(event) => setJournalTo(event.target.value)} />
          <select className="input-field" style={{ width: 170 }} aria-label="Origin" value={journalOrigin} onChange={(event) => setJournalOrigin(event.target.value)}><option value="">All origins</option><option value="MANUAL_JOURNAL">Manual journals</option><option value="REVERSAL">Reversals</option><option value="Invoice">Invoices</option><option value="Bill">Bills</option><option value="Sale">Sales</option><option value="Payroll">Payroll</option></select>
          <span className="muted" style={{ marginLeft: 'auto' }}>{journalEntries.length} entries</span></div>
          {loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading journal entries…</div> : !journalEntries.length ? <div className="muted" style={{ padding: 24, textAlign: 'center' }}>No journal entries have been posted.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Journal number</th><th>Date</th><th>Origin</th><th>Description</th><th>Account</th><th className="num">Debit (TZS)</th><th className="num">Credit (TZS)</th></tr></thead><tbody>{journalEntries.map((entry: any) => <Fragment key={`${entry.sourceType}:${entry.id}`}>
            {(entry.lines ?? []).map((line: any, index: number) => <tr key={`${entry.sourceType}:${entry.id}:${line.accountId}`}>
              <td style={{ fontWeight: 600 }}>{index === 0 ? <>{entry.entryNumber}{entry.revision > 1 && <div className="muted" style={{ fontSize: 12 }}>Adjustment</div>}{entry.reversed && <div style={{ fontSize: 12, color: 'var(--red-400)' }}>Reversed</div>}{entry.reversesJournalId && <div className="muted" style={{ fontSize: 12 }}>Reversal</div>}</> : ''}</td>
              <td>{index === 0 ? scalar(entry.entryDate) : ''}</td>
              <td>{index === 0 ? (entry.sourceType === 'MANUAL_JOURNAL' ? 'Manual' : String(entry.sourceType).replace(/([a-z])([A-Z])/g, '$1 $2')) : ''}</td>
              <td>{index === 0 ? entry.description || '—' : ''}</td>
              <td>{line.account?.code} · {line.account?.name}</td>
              <td className="num">{line.debit ? formatTzs(line.debit) : '—'}</td>
              <td className="num">{line.credit ? formatTzs(line.credit) : '—'}</td>
            </tr>)}
            <tr key={`${entry.sourceType}:${entry.id}:total`}><td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>{canEditAccounting && entry.sourceType === 'MANUAL_JOURNAL' && !entry.reversed && <button type="button" className="btn-secondary" style={{ marginRight: 12 }} onClick={() => { setReverseError(''); setReverseReason(''); setReversing(entry); }}>Reverse</button>}Journal total</td><td className="num" style={{ fontWeight: 700 }}>{formatTzs(entry.totalDebit)}</td><td className="num" style={{ fontWeight: 700 }}>{formatTzs(entry.totalCredit)}</td></tr>
          </Fragment>)}</tbody></table></div>}
        </section>
        {journalFormOpen && <Modal title="New journal entry" onClose={() => !journalSaving && setJournalFormOpen(false)} width="760px" footer={<><button type="button" className="btn-secondary" onClick={() => setJournalFormOpen(false)} disabled={journalSaving}>Cancel</button><button type="submit" form="journal-entry-form" className="btn-primary" disabled={journalSaving}>{journalSaving ? 'Posting…' : 'Post journal'}</button></>}>
          <form id="journal-entry-form" onSubmit={(event) => { event.preventDefault(); void saveJournalEntry(); }} style={{ display: 'grid', gap: 10 }}>
            <label className="form-label">Description<input className="input-field" required value={journalForm.description} onChange={(event) => setJournalForm({ ...journalForm, description: event.target.value })} placeholder="Reason for this adjustment" /></label>
            <label className="form-label">Entry date<input className="input-field" type="date" required value={journalForm.entryDate} onChange={(event) => setJournalForm({ ...journalForm, entryDate: event.target.value })} /></label>
            <div style={{ display: 'grid', gap: 8 }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 160px 32px', gap: 8, fontSize: 12, fontWeight: 700 }}><span>Account</span><span>Entry</span><span>Amount (TZS)</span><span /></div>
              {journalLines.map((line, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 160px 32px', gap: 8, alignItems: 'center' }}>
                <select className="input-field" required value={line.accountId} onChange={(event) => setJournalLines((current) => current.map((item, i) => i === index ? { ...item, accountId: event.target.value } : item))}><option value="">Choose account</option>{budgetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
                <select className="input-field" value={line.side} onChange={(event) => setJournalLines((current) => current.map((item, i) => i === index ? { ...item, side: event.target.value } : item))}><option value="debit">Debit</option><option value="credit">Credit</option></select>
                <input className="input-field" type="number" min="0.01" step="0.01" required placeholder="0.00" value={line.amount} onChange={(event) => setJournalLines((current) => current.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} />
                {journalLines.length > 2 ? <button type="button" className="btn-secondary" aria-label="Remove line" onClick={() => setJournalLines((current) => current.filter((_, i) => i !== index))}>×</button> : <span />}
              </div>)}
              <div><button type="button" className="btn-secondary" onClick={() => setJournalLines((current) => [...current, { accountId: '', side: 'debit', amount: '' }])}>Add line</button></div>
            </div>
            {(() => {
              const debits = journalLines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
              const credits = journalLines.filter((line) => line.side === 'credit').reduce((sum, line) => sum + Number(line.amount || 0), 0);
              const balanced = Math.round(debits * 100) === Math.round(credits * 100) && debits > 0;
              return <div className="muted" style={{ fontSize: 13 }}>Debits: {formatTzs(debits)} · Credits: {formatTzs(credits)} · {balanced ? <span style={{ color: '#4ade80' }}>Balanced</span> : <span style={{ color: 'var(--red-400)' }}>Difference {formatTzs(Math.abs(debits - credits))}</span>}</div>;
            })()}
            {journalError && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{journalError}</div>}
          </form>
        </Modal>}
        {reversing && <Modal title={`Reverse ${reversing.entryNumber}`} onClose={() => !reverseSaving && setReversing(null)} width="520px" footer={<><button type="button" className="btn-secondary" onClick={() => setReversing(null)} disabled={reverseSaving}>Cancel</button><button type="submit" form="reverse-journal-form" className="btn-primary" disabled={reverseSaving}>{reverseSaving ? 'Reversing…' : 'Post reversal'}</button></>}>
          <form id="reverse-journal-form" onSubmit={(event) => { event.preventDefault(); void reverseJournal(); }} style={{ display: 'grid', gap: 10 }}>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>The original stays; a mirror journal cancels it.</p>
            <label className="form-label">Reversal date<input className="input-field" type="date" required value={reverseDate} onChange={(event) => setReverseDate(event.target.value)} /></label>
            <label className="form-label">Reason<textarea className="input-field" rows={3} required minLength={5} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder="Why is this journal being reversed?" /></label>
            {reverseError && <div style={{ color: 'var(--red-400)', fontSize: 13 }}>{reverseError}</div>}
          </form>
        </Modal>}
      </div> : <section className="table-panel"><div className="section-toolbar"><strong>{title}</strong></div>
        {loading ? <div style={{ padding: 32, textAlign: 'center' }}>Loading records…</div> : !records.length ? <div style={{ padding: 32, textAlign: 'center' }}><div className="muted">{emptyMessage}</div></div> : <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr>{columns.map((column) => <th key={column}>{titleCase(column.replace(/([A-Z])/g, '-$1').replaceAll('_', '-'))}</th>)}</tr></thead><tbody>{records.map((record, index) => <tr key={record.id ?? index}>{columns.map((column) => <td key={column}>{scalar(record[column])}</td>)}</tr>)}</tbody></table></div>}
      </section>}
    </>
      </div>
    </div>
  </main>;
}

function StatementLines({ title, lines }: { title: string; lines: { code: string; name: string; balance: number }[] }) {
  const total = lines.reduce((sum, line) => sum + Number(line.balance || 0), 0);
  return <section className="table-panel" style={{ marginBottom: 16 }}>
    <div className="section-toolbar"><strong>{title}</strong><strong>{formatTzs(total)}</strong></div>
    {!lines.length ? <div className="muted" style={{ padding: 18 }}>No {title.toLowerCase()} posted for this period.</div> : <div style={{ overflowX: 'auto' }}>
      <table className="data-table"><thead><tr><th>Account</th><th>Code</th><th className="num">Amount (TZS)</th></tr></thead>
        <tbody>{lines.map((line) => <tr key={line.code}><td>{line.name}</td><td>{line.code}</td><td className="num">{formatTzs(line.balance)}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={2}>Total {title.toLowerCase()}</th><th className="num">{formatTzs(total)}</th></tr></tfoot>
      </table>
    </div>}
  </section>;
}

function EquityStatementLines({ lines, retainedEarnings }: { lines: { code: string; name: string; balance: number }[]; retainedEarnings: number }) {
  const total = lines.reduce((sum, line) => sum + Number(line.balance || 0), 0) + Number(retainedEarnings || 0);
  return <section className="table-panel" style={{ marginBottom: 16 }}>
    <div className="section-toolbar"><strong>Equity</strong><strong>{formatTzs(total)}</strong></div>
    <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Account</th><th>Code</th><th className="num">Amount (TZS)</th></tr></thead><tbody>
      {lines.map((line) => <tr key={line.code}><td>{line.name}</td><td>{line.code}</td><td className="num">{formatTzs(line.balance)}</td></tr>)}
      <tr><td>Retained earnings</td><td>—</td><td className="num">{formatTzs(retainedEarnings)}</td></tr>
    </tbody><tfoot><tr><th colSpan={2}>Total equity</th><th className="num">{formatTzs(total)}</th></tr></tfoot></table></div>
  </section>;
}

function CashFlowSection({ title, data }: { title: string; data?: { inflows?: number; outflows?: number; netCashFlow?: number; lines?: { id?: string; entryDate: string; description?: string | null; sourceType: string; inflow: number; outflow: number; net: number }[] } }) {
  const lines = data?.lines ?? [];
  return <section className="table-panel" style={{ marginBottom: 16 }}>
    <div className="section-toolbar"><strong>{title}</strong><strong>{formatTzs(data?.netCashFlow ?? 0)}</strong></div>
    {!lines.length ? <div className="muted" style={{ padding: 18 }}>No {title.toLowerCase()} recorded for this period.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table">
      <thead><tr><th>Date</th><th>Description</th><th>Source</th><th className="num">Cash received</th><th className="num">Cash paid</th><th className="num">Net</th></tr></thead>
      <tbody>{lines.map((line, index) => <tr key={line.id ?? `${line.sourceType}-${line.entryDate}-${index}`}><td>{scalar(line.entryDate)}</td><td>{line.description || '—'}</td><td>{titleCase(line.sourceType.replace(/([A-Z])/g, '-$1'))}</td><td className="num">{formatTzs(line.inflow)}</td><td className="num">{formatTzs(line.outflow)}</td><td className="num">{formatTzs(line.net)}</td></tr>)}</tbody>
      <tfoot><tr><th colSpan={3}>Total</th><th className="num">{formatTzs(data?.inflows ?? 0)}</th><th className="num">{formatTzs(data?.outflows ?? 0)}</th><th className="num">{formatTzs(data?.netCashFlow ?? 0)}</th></tr></tfoot>
    </table></div>}
  </section>;
}

type FarmerLoanLiability = {
  id: string;
  farmer: { firstName: string; lastName: string; controlNumber: string };
  lender: string;
  originalAmount: number;
  repaid: number;
  amountOwed: number;
};

function FarmerLiabilitySection({ title, empty, rows }: { title: string; empty: string; rows: FarmerLoanLiability[] }) {
  return <section className="table-panel" style={{ marginBottom: 16 }}>
    <div className="section-toolbar"><strong>{title}</strong><strong>{formatTzs(rows.reduce((sum, row) => sum + row.amountOwed, 0))}</strong></div>
    {!rows.length ? <div className="muted" style={{ padding: 18 }}>{empty}</div> : <div style={{ overflowX: 'auto' }}><table className="data-table">
      <thead><tr><th>Farmer</th><th>Control number</th><th>Lender</th><th className="num">Original loan</th><th className="num">Repaid</th><th className="num">Outstanding</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}><td>{row.farmer.firstName} {row.farmer.lastName}</td><td>{row.farmer.controlNumber}</td><td>{row.lender}</td><td className="num">{formatTzs(row.originalAmount)}</td><td className="num">{formatTzs(row.repaid)}</td><td className="num">{formatTzs(row.amountOwed)}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}

type ProcurementPayable = {
  id: string;
  farmer: { firstName: string; lastName: string; controlNumber: string };
  trackingCode: string;
  receivedDate: string;
  weightKg: number;
  totalValue: number;
  amountPaid: number;
  amountOwed: number;
};

function FarmerProcurementSection({ rows }: { rows: ProcurementPayable[] }) {
  return <section className="table-panel" style={{ marginBottom: 16 }}>
    <div className="section-toolbar"><strong>Unpaid procurement owed to farmers</strong><strong>{formatTzs(rows.reduce((sum, row) => sum + row.amountOwed, 0))}</strong></div>
    {!rows.length ? <div className="muted" style={{ padding: 18 }}>No unpaid procurement balances.</div> : <div style={{ overflowX: 'auto' }}><table className="data-table">
      <thead><tr><th>Delivery date</th><th>Farmer</th><th>Control number</th><th>Delivery</th><th className="num">Weight (kg)</th><th className="num">Purchase value</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}><td>{scalar(row.receivedDate)}</td><td>{row.farmer.firstName} {row.farmer.lastName}</td><td>{row.farmer.controlNumber}</td><td>{row.trackingCode}</td><td className="num">{Number(row.weightKg).toLocaleString()}</td><td className="num">{formatTzs(row.totalValue)}</td><td className="num">{formatTzs(row.amountPaid)}</td><td className="num">{formatTzs(row.amountOwed)}</td></tr>)}</tbody>
    </table></div>}
  </section>;
}
