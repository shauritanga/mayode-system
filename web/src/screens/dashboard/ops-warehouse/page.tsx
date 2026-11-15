'use client';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ClipboardList, Factory, LayoutDashboard, Package, RefreshCw, Truck, Warehouse } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { inputStockApi, opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { kg, tzs } from '@/lib/ops';
import { DataTable, ErrorNote, Loading, TablePageSizeContext, Tabs as OpsTabs, useLoad } from '@/components/ops/ui';
import { PageHeader, Tabs } from '../irrigation/ui';
import { WarehouseDetail, WarehouseList } from '@/components/ops/WarehousesPanel';
import { ChartCard } from '@/components/role-dashboards/Charts';
import { WarehouseView } from '../warehouse/page';
import StockCountsPanel from '@/components/ops/StockCountsPanel';
import ReceivingPanel from '@/components/ops/ReceivingPanel';
import StockPanel from '@/components/ops/StockPanel';
import ProcessingPanel from '@/components/ops/ProcessingPanel';
import DispatchPanel from '@/components/ops/DispatchPanel';
import TracePanel from '@/components/ops/TracePanel';
import { AllStockPanel, GiveOutHub, InputBatchesPanel, InputReceivePanel } from '@/components/ops/InputStockPanels';

/* eslint-disable @typescript-eslint/no-explicit-any */
type WarehousePage = 'warehouses' | 'overview' | 'receive' | 'mill' | 'sendout' | 'stock';
type Can = (resource: string, action?: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE') => boolean;

/** The warehouses come first: pick a place, then work in it. The tabs after it do the same jobs across all warehouses. Products are set up in Settings; reports live in Reports. */
const WAREHOUSE_PAGES: { id: WarehousePage; slug: string; label: string; description: string; icon: typeof Warehouse; allowed: (can: Can) => boolean }[] = [
  { id: 'warehouses', slug: 'warehouses', label: 'Warehouses', description: 'Your warehouses. Open one to see what is in it and to add stock.', icon: Warehouse, allowed: (can) => can('warehouses') || can('warehouse_desk') },
  { id: 'receive', slug: 'receive', label: 'Receive', description: 'Record everything that arrives: paddy from a farmer, or inputs, fuel and bags from a supplier. It is added to the warehouse stock when you save.', icon: ArrowDownToLine, allowed: (can) => can('ops_receiving') },
  { id: 'mill', slug: 'mill', label: 'Mill paddy', description: 'Turn paddy into rice, broken rice and by-products. The cost of the paddy moves onto the rice.', icon: Factory, allowed: (can) => can('ops_processing') },
  { id: 'sendout', slug: 'send-out', label: 'Give out / Send out', description: 'Hand stock out: inputs to farmers or field work, and rice to buyers. Stock goes down and the record is kept.', icon: Truck, allowed: (can) => can('ops_dispatch') || can('warehouse_desk') },
  { id: 'stock', slug: 'stock', label: 'Stock', description: 'Everything in the warehouses, rice and inputs together: how much, where, what is running low, and every movement.', icon: Package, allowed: (can) => can('ops_stock') },
  { id: 'overview', slug: 'overview', label: 'Summary', description: 'What is in store across all warehouses, and what needs your attention.', icon: LayoutDashboard, allowed: (can) => can('ops_reports') },
];

/** Addresses of the old eleven pages still work and land on the right new place. */
const OLD_ADDRESSES: Record<string, WarehousePage> = {
  'goods-receiving': 'receive', 'inventory-overview': 'stock', 'stock-movements': 'stock', 'batches-traceability': 'stock', 'stock-counts': 'stock',
  'quality-loss-control': 'mill', 'milling-production-stock': 'mill', 'dispatch-returns': 'sendout',
};

type StockTab = 'all' | 'position' | 'batches' | 'inputbatches' | 'ledger' | 'transfers' | 'counts' | 'trace';
/** Lets a shortcut on the overview open the Stock page on a particular tab. */
const TAB_KEY = 'warehouse-stock-tab';

const LinkBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--green-600, var(--accent))', fontWeight: 600, cursor: 'pointer' }}>{children}</button>
);

const num = (n?: number | null) => Math.round(n || 0).toLocaleString();

export default function OpsWarehousePage() {
  const params = useParams<{ slug?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const can: Can = (r, a = 'VIEW') => hasPermission(user, r, a);
  const pages = WAREHOUSE_PAGES.filter((page) => page.allowed(can));
  const requested = params?.slug?.[0];
  const moved = requested ? OLD_ADDRESSES[requested] : undefined;
  // Setting up warehouses and products moved to Settings, and the reports to Reports.
  const elsewhere = requested === 'setup' || requested === 'warehouse-setup' ? '/dashboard/ops-warehouse/warehouses' : requested === 'inventory-reports' ? '/dashboard/reports' : null;
  useEffect(() => { if (elsewhere) router.replace(elsewhere); }, [elsewhere, router]);
  const selected = pages.find((page) => page.slug === requested) ?? (moved ? pages.find((p) => p.id === moved) : undefined) ?? pages[0];
  useEffect(() => {
    if (moved && selected && selected.id === moved) router.replace(`/dashboard/ops-warehouse/${selected.slug}`);
  }, [moved, selected, router]);
  const goto = (id: WarehousePage, tab?: StockTab) => {
    const page = pages.find((item) => item.id === id);
    if (!page) return;
    if (tab) window.sessionStorage.setItem(TAB_KEY, tab);
    router.push(`/dashboard/ops-warehouse/${page.slug}`);
  };
  // The sections are few, so they sit across the top as tabs instead of in a second sidebar next to the main one.
  return (
    <main>
      {!selected ? <ErrorNote message="Your role does not include warehouse access." /> : <>
        <PageHeader title="Warehouse" subtitle={selected.description} />
        {pages.length > 1 && <Tabs tabs={pages.map((page) => ({ id: page.id, label: page.label }))} active={selected.id} onChange={(id) => router.push(`/dashboard/ops-warehouse/${pages.find((p) => p.id === id)!.slug}`)} />}
        <TablePageSizeContext.Provider value={10}><div className={`warehouse-section-content section-${selected.id}`} data-path={pathname}>
          {selected.id === 'warehouses' && (params?.slug?.[1]
            ? <WarehouseDetail id={params.slug[1]} can={can} goto={(page) => goto(page, page === 'stock' ? 'counts' : undefined)} />
            : <WarehouseList can={can} />)}
          {selected.id === 'overview' && <Overview goto={goto} can={can} />}
          {selected.id === 'receive' && <ReceiveHub can={can} />}
          {selected.id === 'mill' && <ProcessingPanel canCreate={can('ops_processing', 'CREATE')} canReverse={can('ops_processing', 'DELETE')} />}
          {selected.id === 'sendout' && <GiveOutHub can={can}>{can('ops_dispatch')
            ? <DispatchPanel canAllocate={can('ops_dispatch', 'CREATE')} canRelease={can('ops_dispatch', 'EDIT')} canCancel={can('ops_dispatch', 'DELETE')} />
            : <WarehouseView embedded />}</GiveOutHub>}
          {selected.id === 'stock' && <StockWorkspace can={can} />}
        </div></TablePageSizeContext.Provider>
      </>}
    </main>
  );
}

/** The first question of receiving: what is arriving? */
function ReceiveHub({ can }: { can: Can }) {
  const [what, setWhat] = useState<'rice' | 'inputs' | null>(null);
  if (what === 'rice') return <><button type="button" className="btn-secondary" onClick={() => setWhat(null)} style={{ marginBottom: 12 }}>← What is arriving?</button><ReceivingPanel canCreate={can('ops_receiving', 'CREATE')} canConfirm={can('ops_receiving', 'EDIT')} canCancel={can('ops_receiving', 'DELETE')} /></>;
  if (what === 'inputs') return <><button type="button" className="btn-secondary" onClick={() => setWhat(null)} style={{ marginBottom: 12 }}>← What is arriving?</button><InputReceivePanel canReceive={can('ops_receiving', 'CREATE')} /></>;
  const tile = (key: 'rice' | 'inputs', title: string, text: string) => (
    <button key={key} type="button" onClick={() => setWhat(key)} style={{ textAlign: 'left', background: 'var(--bg-elevated, rgba(127,127,127,.08))', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 18px', color: 'inherit', cursor: 'pointer' }}>
      <strong style={{ fontSize: 15 }}>{title}</strong><div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{text}</div>
    </button>
  );
  return (
    <>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>What is arriving?</h3>
      <p className="muted" style={{ marginTop: 0 }}>Choose one. Either way it is put into a warehouse and shows up in Stock.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {tile('rice', 'Rice or paddy', 'From a farmer or a farm. Record weight, quality and what you pay.')}
        {tile('inputs', 'Farm inputs, fuel or bags', 'Fertiliser, seed, chemicals, diesel, empty bags: from a supplier or a delivery.')}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>Receiving a purchase order? Open <Link href="/dashboard/purchase-orders">Purchase Orders</Link> and use “Receive goods”, then pick the warehouse.</p>
    </>
  );
}

function StockWorkspace({ can }: { can: Can }) {
  const [tab, setTab] = useState<StockTab>(() => {
    if (typeof window === 'undefined') return 'all';
    const t = window.sessionStorage.getItem(TAB_KEY) as StockTab | null;
    window.sessionStorage.removeItem(TAB_KEY);
    return t ?? 'all';
  });
  return <>
    <OpsTabs tabs={[
      { id: 'all' as StockTab, label: 'Everything' }, { id: 'position' as StockTab, label: 'Rice & paddy' }, { id: 'batches' as StockTab, label: 'Rice batches' }, { id: 'inputbatches' as StockTab, label: 'Input batches & expiry' }, { id: 'ledger' as StockTab, label: 'History' },
      { id: 'transfers' as StockTab, label: 'Transfers' }, { id: 'counts' as StockTab, label: 'Count stock' }, { id: 'trace' as StockTab, label: 'Trace a batch' },
    ]} value={tab} onChange={setTab} />
    {tab === 'all' && <AllStockPanel canRice={can('ops_stock')} canInputs={can('ops_stock')} canAdjust={can('ops_stock', 'EDIT')} />}
    {tab === 'inputbatches' && <InputBatchesPanel onFix={() => setTab('all')} />}
    {(tab === 'position' || tab === 'batches' || tab === 'ledger' || tab === 'transfers') && <StockPanel key={tab} hideTabs initialTab={tab} canAdjust={can('ops_stock', 'EDIT')} canTransfer={can('ops_stock', 'EDIT')} canManageQuality={can('ops_quality', 'EDIT')} />}
    {tab === 'counts' && <StockCountsPanel canStart={can('ops_stock', 'CREATE')} canApprove={can('ops_stock', 'EDIT')} />}
    {tab === 'trace' && <TracePanel />}
  </>;
}

function Overview({ goto, can }: { goto: (t: WarehousePage, tab?: StockTab) => void; can: Can }) {
  const { data: d, error, loading, reload } = useLoad<any>(async () => {
    const soft = <T,>(allowed: boolean, call: () => Promise<{ data: T }>) => (allowed ? call().then((r) => r.data).catch(() => null) : Promise.resolve(null));
    const [position, ledger, valuation, drafts, counts, dashboard, inputs, inputBatches] = await Promise.all([
      soft(can('ops_stock'), () => opsApi.position()),
      soft(can('ops_stock'), () => opsApi.ledger()),
      soft(can('ops_stock'), () => opsApi.valuation()),
      soft(can('ops_receiving'), () => opsApi.receipts({ status: 'DRAFT' })),
      soft(can('ops_stock'), () => opsApi.stockCounts()),
      soft(can('ops_reports'), () => opsApi.commercialDashboard()),
      soft(can('ops_stock'), () => inputStockApi.overview()),
      soft(can('ops_stock'), () => inputStockApi.batches()),
    ]);
    return { data: { position: position ?? [], ledger: ledger ?? [], valuation, drafts: drafts ?? [], counts: counts ?? [], dashboard, inputs: inputs as any, inputBatches: inputBatches as any } };
  });
  const rows: any[] = useMemo(() => d?.position ?? [], [d]);
  const byWarehouse = useMemo(() => {
    const map = new Map<string, { name: string; onHand: number; free: number; value: number; uncosted: boolean }>();
    for (const row of rows) {
      const item = map.get(row.warehouseId) ?? { name: row.warehouse || 'Unassigned', onHand: 0, free: 0, value: 0, uncosted: false };
      item.onHand += Number(row.closingKg) || 0;
      item.free += Number(row.availableKg) || 0;
      item.value += Number(row.stockValue) || 0;
      if ((row.uncostedKg || 0) > 0) item.uncosted = true;
      map.set(row.warehouseId, item);
    }
    return [...map.values()].sort((a, b) => b.onHand - a.onHand);
  }, [rows]);
  if (loading && !d) return <Loading />;
  if (!d) return <ErrorNote message={error} />;

  const totals = (categories: string[]) => rows.filter((r) => categories.includes(r.category)).reduce((t, r) => ({ onHand: t.onHand + (Number(r.closingKg) || 0), reserved: t.reserved + (Number(r.reservedKg) || 0), free: t.free + (Number(r.availableKg) || 0) }), { onHand: 0, reserved: 0, free: 0 });
  const valuation = d.valuation;
  const waitingReceipts = d.drafts.length;
  const waitingCounts = d.counts.filter((c: any) => c.status === 'PENDING_APPROVAL').length;
  const orders = d.dashboard?.ordersAwaitingFulfilment ?? 0;
  const lowStock: any[] = rows.filter((r) => r.lowStock);
  const lowInputs: any[] = [...new Map((d.inputs?.data ?? []).filter((r: any) => r.low && r.isActive).map((r: any) => [r.itemId, r])).values()];
  const batchSummary = d.inputBatches?.summary;

  // Everything that needs a person, each with the button that takes them there.
  const todo: { text: string; action: string; go: () => void; tone?: 'red' }[] = [
    ...(waitingReceipts ? [{ text: `${waitingReceipts} delivery ${waitingReceipts === 1 ? 'is' : 'are'} recorded but not yet added to stock`, action: 'Review', go: () => goto('receive') }] : []),
    ...(orders ? [{ text: `${orders} paid ${orders === 1 ? 'order is' : 'orders are'} waiting to be sent out`, action: 'Send out', go: () => goto('sendout') }] : []),
    ...(waitingCounts ? [{ text: `${waitingCounts} stock ${waitingCounts === 1 ? 'count is' : 'counts are'} waiting for approval`, action: 'Approve', go: () => goto('stock', 'counts') }] : []),
    ...lowStock.slice(0, 3).map((r) => ({ text: `${r.product} at ${r.warehouse} is running low: ${kg(r.availableKg)} free`, action: 'See stock', go: () => goto('stock'), tone: 'red' as const })),
    ...lowInputs.slice(0, 3).map((r: any) => ({ text: `${r.name} is running low: ${Math.round(r.itemTotal * 1000) / 1000} ${r.unit} left. Time to order more`, action: 'See stock', go: () => goto('stock'), tone: 'red' as const })),
    ...(batchSummary?.expired ? [{ text: `${batchSummary.expired} input ${batchSummary.expired === 1 ? 'batch has' : 'batches have'} expired and still ${batchSummary.expired === 1 ? 'has' : 'have'} stock`, action: 'See batches', go: () => goto('stock', 'inputbatches'), tone: 'red' as const }] : []),
    ...(batchSummary?.expiring ? [{ text: `${batchSummary.expiring} input ${batchSummary.expiring === 1 ? 'batch expires' : 'batches expire'} within 30 days`, action: 'See batches', go: () => goto('stock', 'inputbatches') }] : []),
    ...(valuation && valuation.uncostedKg > 0 ? [{ text: `${kg(valuation.uncostedKg)} of our stock has no cost yet, so it is missing from the accounts`, action: 'Set cost', go: () => goto('stock', 'batches') }] : []),
    ...(valuation && !valuation.matches ? [{ text: 'The stock value and the accounts do not agree. The accountant section at the bottom shows where.', action: 'Open', go: () => { (document.querySelector('.wo-more') as HTMLDetailsElement | null)?.setAttribute('open', ''); document.querySelector('.wo-more')?.scrollIntoView({ behavior: 'smooth' }); }, tone: 'red' as const }] : []),
  ];

  const date = (value: string) => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—';
  const movementLabel = (type: string, qty: number) => ({ RECEIPT: 'Received', TRANSFER_IN: 'Transfer in', TRANSFER_OUT: 'Transfer out', PROCESS_IN: 'Made by milling', PROCESS_OUT: 'Used in milling', DISPATCH: 'Sent out', ADJUSTMENT: qty < 0 ? 'Corrected down' : 'Corrected up', WRITE_OFF: 'Written off' }[type] ?? type);

  // What the person can do, in the words they would use. Each is one click.
  const quick = [
    { icon: ArrowDownToLine, title: 'Receive stock', hint: 'Something arrived: rice, inputs, fuel or bags', go: () => goto('receive'), allowed: can('ops_receiving', 'CREATE') },
    { icon: Truck, title: 'Give out or send out', hint: 'Hand stock to a farmer, a job or a buyer', go: () => goto('sendout'), allowed: can('ops_dispatch') || can('warehouse_desk') },
    { icon: Factory, title: 'Mill paddy', hint: 'Turn paddy into rice', go: () => goto('mill'), allowed: can('ops_processing', 'CREATE') },
    { icon: ClipboardList, title: 'Count stock', hint: 'Check the shelves against the record', go: () => goto('stock', 'counts'), allowed: can('ops_stock', 'CREATE') },
  ].filter((q) => q.allowed);

  // What is in store, one card per kind, each saying in plain words what the kind is.
  const inputRows: any[] = (d.inputs?.data ?? []).filter((r: any) => r.isActive);
  const inputKind = (cls: string) => {
    const items = [...new Map(inputRows.filter((r) => r.stockClass === cls).map((r) => [r.itemId, r])).values()];
    return { count: items.filter((r) => r.itemTotal > 0).length, low: items.filter((r) => r.low).length, any: items.length > 0 };
  };
  const rice = totals(['PROCESSED', 'BROKEN']); const paddy = totals(['PADDY']); const byp = totals(['BYPRODUCT']);
  const soldLine = (t: { free: number; reserved: number }) => `${kg(t.free)} can be sold now${t.reserved ? ` · ${kg(t.reserved)} promised to orders` : ''}`;
  const stockCards: { key: string; title: string; what: string; value: string; line: string; low?: number }[] = [
    { key: 'rice', title: 'Rice', what: 'Milled rice, ready to sell', value: kg(rice.onHand), line: soldLine(rice) },
    { key: 'paddy', title: 'Paddy', what: 'Rice still in the husk, not yet milled', value: kg(paddy.onHand), line: soldLine(paddy) },
    { key: 'byp', title: 'By-products', what: 'Bran and husks left after milling', value: kg(byp.onHand), line: 'Kept for sale or use' },
    ...(can('ops_stock') ? ([['INPUT', 'Farm inputs', 'Fertiliser, seed and chemicals'], ['FUEL', 'Fuel', 'Diesel and petrol'], ['PACKAGING', 'Bags', 'Empty bags for packing rice']] as const)
      .map(([cls, title, what]) => ({ cls, title, what, k: inputKind(cls) })).filter((x) => x.k.any)
      .map((x) => ({ key: x.cls, title: x.title, what: x.what, value: `${x.k.count} ${x.k.count === 1 ? 'item' : 'items'}`, line: x.k.low ? `${x.k.low} running low` : 'Stock is fine', low: x.k.low })) : []),
  ];

  return <section className="warehouse-overview wo" aria-label="Warehouse overview">
    <ErrorNote message={error} />

    {quick.length > 0 && <section className="wo-block" aria-label="What would you like to do?">
      <div className="wo-title-row"><h3 className="wo-title">What would you like to do?</h3><button type="button" className="btn-secondary" onClick={() => void reload()}><RefreshCw size={14} /> Refresh</button></div>
      <div className="wo-actions">{quick.map(({ icon: Icon, title, hint, go }) => <button key={title} type="button" className="wo-action" onClick={go}><span className="wo-action-icon"><Icon size={22} /></span><span className="wo-action-text"><strong>{title}</strong><small>{hint}</small></span></button>)}</div>
    </section>}

    <section className="wo-block" aria-label="Needs your attention">
      <h3 className="wo-title">Needs your attention</h3>
      {todo.length === 0
        ? <div className="wo-clear"><CheckCircle2 size={18} /> All clear. Nothing is waiting for you.</div>
        : <ul className="wo-todo">{todo.map((t) => <li key={t.text}>
            <span><AlertTriangle size={16} color={t.tone === 'red' ? 'var(--red-500)' : 'var(--gold-500, #f2a62c)'} />{t.text}</span>
            <button type="button" className="btn-secondary" onClick={t.go}>{t.action}</button></li>)}</ul>}
    </section>

    <section className="wo-block" aria-label="What is in store">
      <h3 className="wo-title">What is in store</h3>
      <div className="wo-stock">{stockCards.map((c) => (
        <button key={c.key} type="button" className="wo-stock-card" onClick={() => goto('stock')} title="See this in Stock">
          <span className="wo-stock-name">{c.title}</span>
          <span className="wo-stock-value">{c.value}</span>
          <span className="wo-stock-what">{c.what}</span>
          <span className={`wo-stock-line${c.low ? ' is-low' : ''}`}>{c.line}</span>
        </button>))}
      </div>
    </section>

    {byWarehouse.length > 0 && <section className="wo-block" aria-label="By warehouse">
      <div className="wo-title-row"><h3 className="wo-title">By warehouse</h3><LinkBtn onClick={() => goto('stock')}>See all stock →</LinkBtn></div>
      <DataTable rows={byWarehouse} rowKey={(row) => row.name} empty="Nothing in stock yet. Use Receive stock to get started."
        columns={[{ header: 'Warehouse', render: (row) => <strong>{row.name}</strong> }, { header: 'Rice and paddy in store', align: 'right', render: (row) => kg(row.onHand) }, { header: 'Can be sold now', align: 'right', render: (row) => kg(row.free) }]} />
    </section>}

    {can('ops_stock') && <section className="wo-block" aria-label="Latest movements">
      <div className="wo-title-row"><h3 className="wo-title">What happened last</h3><LinkBtn onClick={() => goto('stock', 'ledger')}>See everything →</LinkBtn></div>
      <DataTable rows={(d.ledger as any[]).slice(0, 6)} rowKey={(entry: any) => entry.id} empty="Nothing has moved yet."
        columns={[{ header: 'When', render: (entry: any) => date(entry.createdAt) }, { header: 'What', render: (entry: any) => movementLabel(entry.type, entry.quantityKg) }, { header: 'Product', render: (entry: any) => entry.batch?.product?.name || '—' },
          { header: 'Quantity', align: 'right', render: (entry: any) => <span style={{ color: entry.quantityKg < 0 ? 'var(--red-500)' : undefined }}>{entry.quantityKg > 0 ? '+' : ''}{num(entry.quantityKg)} kg</span> }]} />
    </section>}

    {valuation && <details className="wo-block wo-more">
      <summary>For the accountant: value of stock and whether the books agree{!valuation.matches && <span className="badge badge-red" style={{ marginLeft: 8 }}>Difference to look into</span>}</summary>
      <p className="wo-acc-line"><strong>Value of stock: {tzs(valuation.totalStockValue)}</strong>{valuation.uncostedKg > 0 ? ` · ${kg(valuation.uncostedKg)} has no cost yet` : ' · at what it cost us'}</p>
      <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 10px', fontWeight: 600, color: valuation.matches ? 'var(--green-600, #16a36a)' : 'var(--red-500)' }}>
        {valuation.matches ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{valuation.matches ? 'Yes. The warehouse and the accounts agree.' : 'No. There is a difference to look into.'}</p>
      <DataTable rows={valuation.rows} rowKey={(r: any) => r.code} columns={[
        { header: 'Stock', render: (r: any) => r.name }, { header: 'Warehouse says', align: 'right', render: (r: any) => tzs(r.stockValue) }, { header: 'Accounts say', align: 'right', render: (r: any) => tzs(r.booksValue) },
        { header: 'Difference', align: 'right', render: (r: any) => <span style={{ color: Math.abs(r.difference) > 1 ? 'var(--red-500)' : undefined }}>{tzs(r.difference)}</span> }]} />
      {valuation.rows.some((r: any) => r.notYetReceived > 0) && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Paddy bought at the collection centre but not yet received into a warehouse is already counted in the accounts: {tzs(valuation.rows.reduce((t: number, r: any) => t + r.notYetReceived, 0))}.</p>}
    </details>}
  </section>;
}
