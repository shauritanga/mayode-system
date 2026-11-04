'use client';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowDownToLine, Boxes, CheckCircle2, ClipboardList, Factory, LayoutDashboard, Package, RefreshCw, Settings2, Truck, Warehouse } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { kg, tzs } from '@/lib/ops';
import { DataTable, ErrorNote, Loading, TablePageSizeContext, Tabs, useLoad } from '@/components/ops/ui';
import { ChartCard } from '@/components/role-dashboards/Charts';
import { WarehouseView } from '../warehouse/page';
import StockCountsPanel from '@/components/ops/StockCountsPanel';
import ReceivingPanel from '@/components/ops/ReceivingPanel';
import StockPanel from '@/components/ops/StockPanel';
import ProcessingPanel from '@/components/ops/ProcessingPanel';
import DispatchPanel from '@/components/ops/DispatchPanel';
import TracePanel from '@/components/ops/TracePanel';
import ProductsPanel from '@/components/ops/ProductsPanel';
import ReportsRunner from '@/components/ops/ReportsRunner';

/* eslint-disable @typescript-eslint/no-explicit-any */
type WarehousePage = 'overview' | 'receive' | 'mill' | 'sendout' | 'stock' | 'setup';
type Can = (resource: string, action?: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE') => boolean;

/** Six places, named for what the person is doing, in the order the work happens. */
const WAREHOUSE_PAGES: { id: WarehousePage; slug: string; label: string; description: string; icon: typeof Warehouse; allowed: (can: Can) => boolean }[] = [
  { id: 'overview', slug: 'overview', label: 'Overview', description: 'What we have, what needs doing, and whether the books agree.', icon: LayoutDashboard, allowed: (can) => can('ops_reports') },
  { id: 'receive', slug: 'receive', label: 'Receive paddy', description: 'Record paddy as it arrives. Stock, and what we owe the farmer, are added when you confirm.', icon: ArrowDownToLine, allowed: (can) => can('ops_receiving') },
  { id: 'mill', slug: 'mill', label: 'Mill paddy', description: 'Turn paddy into rice, broken rice and by-products. The cost of the paddy moves onto the rice.', icon: Factory, allowed: (can) => can('ops_processing') },
  { id: 'sendout', slug: 'send-out', label: 'Send out rice', description: 'Pick stock for paid orders, load the truck and hand over the goods.', icon: Truck, allowed: (can) => can('ops_dispatch') || can('warehouse_desk') },
  { id: 'stock', slug: 'stock', label: 'Stock', description: 'Everything in the warehouses: how much, where it came from, and what it is worth.', icon: Package, allowed: (can) => can('ops_stock') },
  { id: 'setup', slug: 'setup', label: 'Setup & reports', description: 'Warehouses, the products we handle, and printable reports.', icon: Settings2, allowed: (can) => can('warehouses') || can('warehouse_desk') || can('ops_catalog') || can('ops_reports') },
];

/** Addresses of the old eleven pages still work and land on the right new place. */
const OLD_ADDRESSES: Record<string, WarehousePage> = {
  'warehouse-setup': 'setup', 'goods-receiving': 'receive', 'inventory-overview': 'stock', 'stock-movements': 'stock', 'batches-traceability': 'stock', 'stock-counts': 'stock',
  'quality-loss-control': 'mill', 'milling-production-stock': 'mill', 'dispatch-returns': 'sendout', 'inventory-reports': 'setup',
};

type StockTab = 'position' | 'batches' | 'ledger' | 'transfers' | 'counts' | 'trace';
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
  return (
    <main>
      {!selected ? <ErrorNote message="Your role does not include warehouse access." /> : <div className="warehouse-layout">
        <aside className="warehouse-subsidebar" aria-label="Warehouse and Inventory sections">
          <div className="warehouse-subsidebar-heading">Warehouse &amp; Inventory</div>
          <nav aria-label="Warehouse sections">{pages.map((page) => {
            const Icon = page.icon;
            const href = `/dashboard/ops-warehouse/${page.slug}`;
            const active = selected.id === page.id;
            return <Link key={page.id} href={href} aria-current={active ? 'page' : undefined} className={`warehouse-nav-link ${active ? 'is-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{page.label}</span></Link>;
          })}</nav>
        </aside>
        <section className="warehouse-workspace">
          {selected.id !== 'overview' && <header className="warehouse-section-heading"><span className="warehouse-section-icon"><selected.icon size={21} /></span><div><span className="warehouse-section-kicker">Warehouse &amp; Inventory</span><h2>{selected.label}</h2><p>{selected.description}</p></div></header>}
          <TablePageSizeContext.Provider value={10}><div className={`warehouse-section-content section-${selected.id}`} data-path={pathname}>
            {selected.id === 'overview' && <Overview goto={goto} can={can} />}
            {selected.id === 'receive' && <ReceivingPanel canCreate={can('ops_receiving', 'CREATE')} canConfirm={can('ops_receiving', 'EDIT')} canCancel={can('ops_receiving', 'DELETE')} />}
            {selected.id === 'mill' && <ProcessingPanel canCreate={can('ops_processing', 'CREATE')} canReverse={can('ops_processing', 'DELETE')} />}
            {selected.id === 'sendout' && (can('ops_dispatch')
              ? <DispatchPanel canAllocate={can('ops_dispatch', 'CREATE')} canRelease={can('ops_dispatch', 'EDIT')} canCancel={can('ops_dispatch', 'DELETE')} />
              : <WarehouseView embedded />)}
            {selected.id === 'stock' && <StockWorkspace can={can} />}
            {selected.id === 'setup' && <SetupWorkspace can={can} />}
          </div></TablePageSizeContext.Provider>
        </section>
      </div>}
    </main>
  );
}

function StockWorkspace({ can }: { can: Can }) {
  const [tab, setTab] = useState<StockTab>(() => {
    if (typeof window === 'undefined') return 'position';
    const t = window.sessionStorage.getItem(TAB_KEY) as StockTab | null;
    window.sessionStorage.removeItem(TAB_KEY);
    return t ?? 'position';
  });
  return <>
    <Tabs tabs={[
      { id: 'position' as StockTab, label: 'What we have' }, { id: 'batches' as StockTab, label: 'Batches' }, { id: 'ledger' as StockTab, label: 'History' },
      { id: 'transfers' as StockTab, label: 'Transfers' }, { id: 'counts' as StockTab, label: 'Count stock' }, { id: 'trace' as StockTab, label: 'Trace a batch' },
    ]} value={tab} onChange={setTab} />
    {(tab === 'position' || tab === 'batches' || tab === 'ledger' || tab === 'transfers') && <StockPanel key={tab} hideTabs initialTab={tab} canAdjust={can('ops_stock', 'EDIT')} canTransfer={can('ops_stock', 'EDIT')} canManageQuality={can('ops_quality', 'EDIT')} />}
    {tab === 'counts' && <StockCountsPanel canStart={can('ops_stock', 'CREATE')} canApprove={can('ops_stock', 'EDIT')} />}
    {tab === 'trace' && <TracePanel />}
  </>;
}

function SetupWorkspace({ can }: { can: Can }) {
  const available = [
    ...(can('warehouses') || can('warehouse_desk') ? [{ id: 'warehouses' as const, label: 'Warehouses' }] : []),
    ...(can('ops_catalog') ? [{ id: 'products' as const, label: 'Products' }] : []),
    ...(can('ops_reports') ? [{ id: 'reports' as const, label: 'Reports' }] : []),
  ];
  const [tab, setTab] = useState<'warehouses' | 'products' | 'reports'>(available[0]?.id ?? 'reports');
  return <>
    <Tabs tabs={available} value={tab} onChange={setTab} />
    {tab === 'warehouses' && <WarehouseView embedded setupOnly />}
    {tab === 'products' && <ProductsPanel canCreate={can('ops_catalog', 'CREATE')} canEdit={can('ops_catalog', 'EDIT')} />}
    {tab === 'reports' && <ReportsRunner groups={['Warehouse']} />}
  </>;
}

const CATEGORY_CARDS: { key: string; title: string; categories: string[]; tone: string }[] = [
  { key: 'paddy', title: 'Paddy', categories: ['PADDY'], tone: 'gold' },
  { key: 'rice', title: 'Rice', categories: ['PROCESSED', 'BROKEN'], tone: 'green' },
  { key: 'byproducts', title: 'By-products', categories: ['BYPRODUCT'], tone: 'purple' },
];

function Overview({ goto, can }: { goto: (t: WarehousePage, tab?: StockTab) => void; can: Can }) {
  const { data: d, error, loading, reload } = useLoad<any>(async () => {
    const soft = <T,>(allowed: boolean, call: () => Promise<{ data: T }>) => (allowed ? call().then((r) => r.data).catch(() => null) : Promise.resolve(null));
    const [position, ledger, valuation, drafts, counts, dashboard] = await Promise.all([
      soft(can('ops_stock'), () => opsApi.position()),
      soft(can('ops_stock'), () => opsApi.ledger()),
      soft(can('ops_stock'), () => opsApi.valuation()),
      soft(can('ops_receiving'), () => opsApi.receipts({ status: 'DRAFT' })),
      soft(can('ops_stock'), () => opsApi.stockCounts()),
      soft(can('ops_reports'), () => opsApi.commercialDashboard()),
    ]);
    return { data: { position: position ?? [], ledger: ledger ?? [], valuation, drafts: drafts ?? [], counts: counts ?? [], dashboard } };
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

  // Everything that needs a person, each with the button that takes them there.
  const todo: { text: string; action: string; go: () => void; tone?: 'red' }[] = [
    ...(waitingReceipts ? [{ text: `${waitingReceipts} delivery ${waitingReceipts === 1 ? 'is' : 'are'} recorded but not yet added to stock`, action: 'Review', go: () => goto('receive') }] : []),
    ...(orders ? [{ text: `${orders} paid ${orders === 1 ? 'order is' : 'orders are'} waiting to be sent out`, action: 'Send out', go: () => goto('sendout') }] : []),
    ...(waitingCounts ? [{ text: `${waitingCounts} stock ${waitingCounts === 1 ? 'count is' : 'counts are'} waiting for approval`, action: 'Approve', go: () => goto('stock', 'counts') }] : []),
    ...lowStock.slice(0, 3).map((r) => ({ text: `${r.product} at ${r.warehouse} is running low: ${kg(r.availableKg)} free`, action: 'See stock', go: () => goto('stock'), tone: 'red' as const })),
    ...(valuation && valuation.uncostedKg > 0 ? [{ text: `${kg(valuation.uncostedKg)} of our stock has no cost yet, so it is missing from the accounts`, action: 'Set cost', go: () => goto('stock', 'batches') }] : []),
    ...(valuation && !valuation.matches ? [{ text: 'The stock value and the accounts do not agree. See the check below.', action: 'Look', go: () => undefined, tone: 'red' as const }] : []),
  ];

  const date = (value: string) => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—';
  const movementLabel = (type: string, qty: number) => ({ RECEIPT: 'Received', TRANSFER_IN: 'Transfer in', TRANSFER_OUT: 'Transfer out', PROCESS_IN: 'Made by milling', PROCESS_OUT: 'Used in milling', DISPATCH: 'Sent out', ADJUSTMENT: qty < 0 ? 'Corrected down' : 'Corrected up', WRITE_OFF: 'Written off' }[type] ?? type);

  const quick = [
    { icon: ArrowDownToLine, title: 'Receive paddy', hint: 'A delivery has arrived', go: () => goto('receive'), allowed: can('ops_receiving', 'CREATE') },
    { icon: Factory, title: 'Mill paddy', hint: 'Turn paddy into rice', go: () => goto('mill'), allowed: can('ops_processing', 'CREATE') },
    { icon: Truck, title: 'Send out rice', hint: 'Load a customer’s order', go: () => goto('sendout'), allowed: can('ops_dispatch') || can('warehouse_desk') },
    { icon: ClipboardList, title: 'Count stock', hint: 'Check shelves against the record', go: () => goto('stock', 'counts'), allowed: can('ops_stock', 'CREATE') },
  ].filter((q) => q.allowed);

  return <section className="warehouse-overview" aria-label="Warehouse overview">
    <div className="warehouse-overview-head">
      <div className="warehouse-overview-title"><span className="warehouse-overview-icon"><Boxes size={26} /></span><div><h2>Warehouse &amp; Inventory</h2><p>What we have, what needs doing, and whether the books agree.</p></div></div>
      <div className="warehouse-overview-actions"><button type="button" className="btn-secondary" onClick={() => void reload()}><RefreshCw size={15} /> Refresh</button></div>
    </div>
    <ErrorNote message={error} />

    <div className="warehouse-metric-grid">
      {CATEGORY_CARDS.map((card) => {
        const t = totals(card.categories);
        return <WarehouseMetric key={card.key} icon={card.key === 'paddy' ? Package : card.key === 'rice' ? Boxes : Factory} label={card.title} value={kg(t.onHand)} hint={`${kg(t.free)} free to sell${t.reserved ? ` · ${kg(t.reserved)} promised to orders` : ''}`} tone={card.tone} />;
      })}
      <WarehouseMetric icon={Warehouse} label="Value of our stock" value={valuation ? tzs(valuation.totalStockValue) : '—'} hint={valuation ? (valuation.uncostedKg > 0 ? `${kg(valuation.uncostedKg)} has no cost yet` : 'At what it cost us') : 'Not available for your role'} tone="blue" />
    </div>

    <ChartCard title="Needs your attention" subtitle={todo.length ? 'Start at the top' : 'Nothing is waiting'}>
      {todo.length === 0
        ? <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}><CheckCircle2 size={18} color="var(--green-600, #16a36a)" /> All clear. Deliveries are in stock, orders are sent out and the books agree.</p>
        : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>{todo.map((t) => <li key={t.text} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--neutral-100)' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={16} color={t.tone === 'red' ? 'var(--red-500)' : 'var(--gold-500, #f2a62c)'} />{t.text}</span>
          <button type="button" className="btn-secondary" onClick={t.go}>{t.action}</button></li>)}</ul>}
    </ChartCard>

    {quick.length > 0 && <div className="warehouse-action-grid">{quick.map(({ icon: Icon, title, hint, go }) => <button key={title} type="button" className="warehouse-action-card tone-green" onClick={go}><span className="warehouse-action-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{hint}</small></span><span className="warehouse-action-arrow">›</span></button>)}</div>}

    <div className="warehouse-overview-grid warehouse-overview-grid-top">
      <ChartCard title="By warehouse" subtitle="What each warehouse holds" action={<LinkBtn onClick={() => goto('stock')}>All stock →</LinkBtn>}>
        <DataTable rows={byWarehouse} rowKey={(row) => row.name} empty="Nothing in stock yet. Receive paddy to get started."
          columns={[{ header: 'Warehouse', render: (row) => <strong>{row.name}</strong> }, { header: 'In stock', align: 'right', render: (row) => kg(row.onHand) }, { header: 'Free to sell', align: 'right', render: (row) => kg(row.free) }, { header: 'Value', align: 'right', render: (row) => (row.value > 0 ? tzs(row.value) : row.uncosted ? <span className="badge badge-gold">Cost not set</span> : '—') }]} />
      </ChartCard>
      <ChartCard title="Do the books agree?" subtitle="Stock value in the warehouse against the accounts">
        {!valuation ? <p className="muted" style={{ margin: 0 }}>Not available for your role.</p> : <>
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 10px', fontWeight: 600, color: valuation.matches ? 'var(--green-600, #16a36a)' : 'var(--red-500)' }}>
            {valuation.matches ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{valuation.matches ? 'Yes. The warehouse and the accounts agree.' : 'No. There is a difference to look into.'}</p>
          <DataTable rows={valuation.rows} rowKey={(r: any) => r.code} columns={[
            { header: 'Stock', render: (r: any) => r.name }, { header: 'Warehouse says', align: 'right', render: (r: any) => tzs(r.stockValue) }, { header: 'Accounts say', align: 'right', render: (r: any) => tzs(r.booksValue) },
            { header: 'Difference', align: 'right', render: (r: any) => <span style={{ color: Math.abs(r.difference) > 1 ? 'var(--red-500)' : undefined }}>{tzs(r.difference)}</span> }]} />
          {valuation.rows.some((r: any) => r.notYetReceived > 0) && <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Paddy bought at the collection centre but not yet received into a warehouse is already counted in the accounts: {tzs(valuation.rows.reduce((t: number, r: any) => t + r.notYetReceived, 0))}.</p>}
        </>}
      </ChartCard>
    </div>

    {can('ops_stock') && <ChartCard title="Latest movements" subtitle="The last things that went in or out" action={<LinkBtn onClick={() => goto('stock', 'ledger')}>See all →</LinkBtn>}>
      <DataTable rows={(d.ledger as any[]).slice(0, 8)} rowKey={(entry: any) => entry.id} empty="Nothing has moved yet."
        columns={[{ header: 'When', render: (entry: any) => date(entry.createdAt) }, { header: 'What', render: (entry: any) => movementLabel(entry.type, entry.quantityKg) }, { header: 'Product', render: (entry: any) => entry.batch?.product?.name || '—' }, { header: 'Batch', render: (entry: any) => entry.batch?.reference || '—' },
          { header: 'Quantity', align: 'right', render: (entry: any) => <span style={{ color: entry.quantityKg < 0 ? 'var(--red-500)' : undefined }}>{entry.quantityKg > 0 ? '+' : ''}{num(entry.quantityKg)} kg</span> }]} />
    </ChartCard>}
  </section>;
}

function WarehouseMetric({ icon: Icon, label, value, hint, tone }: { icon: typeof Package; label: string; value: string; hint: string; tone: string }) {
  return <article className="warehouse-metric-card"><span className={`warehouse-metric-icon tone-${tone}`}><Icon size={21} /></span><div className="warehouse-metric-copy"><div className="warehouse-metric-label">{label}</div><strong>{value}</strong><small>{hint}</small></div></article>;
}
