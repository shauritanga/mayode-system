'use client';
import { useParams, usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChartNoAxesCombined, ClipboardCheck, Factory, LayoutDashboard, Package, PackageCheck, ReceiptText, Truck, Warehouse, Wheat, ArrowDownToLine, ArrowLeftRight, ClipboardList, SlidersHorizontal, RefreshCw, AlertTriangle, Boxes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { kg } from '@/lib/ops';
import { DataTable, ErrorNote, Loading, TablePageSizeContext, Tabs, useLoad } from '@/components/ops/ui';
import { ChartCard, DonutBreakdown, GroupedBarChart } from '@/components/role-dashboards/Charts';
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
type WarehousePage = 'overview' | 'setup' | 'receiving' | 'inventory' | 'movements' | 'batches' | 'counts' | 'quality' | 'milling' | 'dispatch' | 'reports';

const WAREHOUSE_PAGES: { id: WarehousePage; slug: string; label: string; description: string; icon: typeof Warehouse; allowed: (can: (resource: string, action?: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE') => boolean) => boolean }[] = [
  { id: 'overview', slug: 'overview', label: 'Warehouse Overview', description: 'Live stock position, milling output and items that need attention.', icon: LayoutDashboard, allowed: (can) => can('ops_reports') },
  { id: 'setup', slug: 'warehouse-setup', label: 'Warehouse Setup', description: 'Manage warehouse locations, capacity and assigned keepers.', icon: Warehouse, allowed: (can) => can('warehouses') || can('warehouse_desk') || can('ops_catalog') },
  { id: 'receiving', slug: 'goods-receiving', label: 'Goods Receiving', description: 'Record, inspect and confirm incoming paddy and harvest.', icon: ReceiptText, allowed: (can) => can('ops_receiving') },
  { id: 'inventory', slug: 'inventory-overview', label: 'Inventory Overview', description: 'Review stock on hand, reservations and available quantities.', icon: Package, allowed: (can) => can('ops_stock') },
  { id: 'movements', slug: 'stock-movements', label: 'Stock Movements', description: 'Review receipts, milling, transfers, dispatches and adjustments.', icon: Truck, allowed: (can) => can('ops_stock') },
  { id: 'batches', slug: 'batches-traceability', label: 'Batches & Traceability', description: 'Follow each batch from receipt through processing and dispatch.', icon: PackageCheck, allowed: (can) => can('ops_stock') },
  { id: 'counts', slug: 'stock-counts', label: 'Stock Counts', description: 'Compare physical stock with recorded batch quantities and record corrections.', icon: ClipboardCheck, allowed: (can) => can('ops_stock', 'EDIT') },
  { id: 'quality', slug: 'quality-loss-control', label: 'Quality & Loss Control', description: 'Review receipt inspections, milling yield and unexplained losses.', icon: Wheat, allowed: (can) => can('ops_receiving') || can('ops_processing') },
  { id: 'milling', slug: 'milling-production-stock', label: 'Milling & Production Stock', description: 'Record paddy input, rice and by-product output, yield and loss.', icon: Factory, allowed: (can) => can('ops_processing') },
  { id: 'dispatch', slug: 'dispatch-returns', label: 'Dispatch & Returns', description: 'Allocate, dispatch and review customer orders and warehouse transfers.', icon: Truck, allowed: (can) => can('ops_dispatch') || can('warehouse_desk') },
  { id: 'reports', slug: 'inventory-reports', label: 'Inventory Reports', description: 'Run warehouse, stock, processing and dispatch reports.', icon: ChartNoAxesCombined, allowed: (can) => can('ops_reports') },
];

const LinkBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--green-600, var(--accent))', fontWeight: 600, cursor: 'pointer' }}>{children}</button>
);

const num = (n?: number | null) => (n || 0).toLocaleString();

export default function OpsWarehousePage() {
  const params = useParams<{ slug?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const can = (r: string, a: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' = 'VIEW') => hasPermission(user, r, a);
  const pages = WAREHOUSE_PAGES.filter((page) => page.allowed(can));
  const selected = pages.find((page) => page.slug === params?.slug?.[0]) ?? pages[0];
  const goto = (id: WarehousePage) => {
    const page = pages.find((item) => item.id === id);
    if (page) router.push(`/dashboard/ops-warehouse/${page.slug}`);
  };
  return (
    <main>
      {selected?.id !== 'overview' && <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 4, height: 26, borderRadius: 9, background: 'var(--gold-400)' }} /><h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, margin: 0 }}>Warehouse &amp; Inventory</h1></div>
        <p className="muted" style={{ margin: '6px 0 0 14px' }}>Track stock from receipt through milling, storage and dispatch.</p>
      </div>}
      {!selected ? <ErrorNote message="Your role does not include warehouse access." /> : <div className="warehouse-layout">
        <aside className="warehouse-subsidebar" aria-label="Warehouse and Inventory sections">
          <div className="warehouse-subsidebar-heading">Warehouse &amp; Inventory</div>
          <nav aria-label="Warehouse sections">{pages.map((page) => {
            const Icon = page.icon;
            const href = `/dashboard/ops-warehouse/${page.slug}`;
            const active = pathname === href || (pathname === '/dashboard/ops-warehouse' && pages[0]?.id === page.id);
            return <Link key={page.id} href={href} aria-current={active ? 'page' : undefined} className={`warehouse-nav-link ${active ? 'is-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{page.label}</span></Link>;
          })}</nav>
        </aside>
        <section className="warehouse-workspace">
          {selected.id !== 'overview' && <header className="warehouse-section-heading"><span className="warehouse-section-icon"><selected.icon size={21} /></span><div><span className="warehouse-section-kicker">Warehouse &amp; Inventory</span><h2>{selected.label}</h2><p>{selected.description}</p></div></header>}
          <TablePageSizeContext.Provider value={10}><div className={`warehouse-section-content section-${selected.id}`}>
          {selected.id === 'overview' && <Overview goto={goto} />}
          {selected.id === 'setup' && <>
            {(can('warehouses') || can('warehouse_desk')) && <WarehouseView embedded />}
            {can('ops_catalog') && <Subsection title="Product catalogue" description="Manage paddy, milled rice, broken rice and by-product items used by warehouse workflows."><ProductsPanel canCreate={can('ops_catalog', 'CREATE')} canEdit={can('ops_catalog', 'EDIT')} /></Subsection>}
          </>}
          {selected.id === 'receiving' && <ReceivingPanel canCreate={can('ops_receiving', 'CREATE')} canConfirm={can('ops_receiving', 'EDIT')} canCancel={can('ops_receiving', 'DELETE')} />}
          {selected.id === 'inventory' && <StockPanel canAdjust={can('ops_stock', 'EDIT')} canTransfer={can('ops_stock', 'EDIT')} canManageQuality={can('ops_quality', 'EDIT')} initialTab="position" />}
          {selected.id === 'movements' && <StockPanel canAdjust={can('ops_stock', 'EDIT')} canTransfer={can('ops_stock', 'EDIT')} initialTab="ledger" />}
          {selected.id === 'batches' && <BatchesWorkspace canAdjust={can('ops_stock', 'EDIT')} canTransfer={can('ops_stock', 'EDIT')} />}
          {selected.id === 'counts' && <StockCountsPanel canStart={can('ops_stock', 'CREATE')} canApprove={can('ops_stock', 'EDIT')} />}
          {selected.id === 'quality' && <QualityWorkspace canReviewReceipts={can('ops_receiving')} canReviewMilling={can('ops_processing')} canReverse={can('ops_processing', 'DELETE')} canConfirm={can('ops_receiving', 'EDIT')} />}
          {selected.id === 'milling' && <ProcessingPanel canCreate={can('ops_processing', 'CREATE')} canReverse={can('ops_processing', 'DELETE')} />}
          {selected.id === 'dispatch' && <>
            {can('ops_dispatch') ? <Subsection title="Dispatch queue and release notes" description="Allocate available batches, prepare loads and record goods released to customers."><DispatchPanel canAllocate={can('ops_dispatch', 'CREATE')} canRelease={can('ops_dispatch', 'EDIT')} canCancel={can('ops_dispatch', 'DELETE')} /></Subsection> : <WarehouseView embedded />}
            {can('ops_stock') && <Subsection title="Warehouse transfers" description="Track stock sent between locations and confirm quantities received at destination."><StockPanel canAdjust={false} canTransfer={can('ops_stock', 'EDIT')} initialTab="transfers" /></Subsection>}
          </>}
          {selected.id === 'reports' && <ReportsRunner groups={['Warehouse']} />}
          </div></TablePageSizeContext.Provider>
        </section>
      </div>}
    </main>
  );
}

function Subsection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="warehouse-subsection"><header><div><h3>{title}</h3><p>{description}</p></div></header>{children}</section>;
}

function BatchesWorkspace({ canAdjust, canTransfer }: { canAdjust: boolean; canTransfer: boolean }) {
  const [view, setView] = useState<'batches' | 'trace'>('batches');
  const { data: batches, error, loading, reload } = useLoad<any[]>(() => opsApi.batches({ inStock: 'true' }));
  const physical = (batches ?? []).reduce((sum, batch) => sum + (Number(batch.physicalKg) || 0), 0);
  const available = (batches ?? []).reduce((sum, batch) => sum + (Number(batch.availableKg) || 0), 0);
  const reserved = (batches ?? []).reduce((sum, batch) => sum + (Number(batch.reservedKg) || 0), 0);
  return <div className="warehouse-batch-workspace">
    <ErrorNote message={error} />
    <div className="warehouse-batch-summary">
      <WarehouseMetric icon={PackageCheck} label="Active batches" value={loading && !batches ? '…' : num(batches?.length ?? 0)} hint="Batches with stock on hand" tone="blue" />
      <WarehouseMetric icon={Boxes} label="Physical stock" value={kg(physical)} hint="Recorded across visible batches" tone="green" />
      <WarehouseMetric icon={Package} label="Available stock" value={kg(available)} hint={`${kg(reserved)} reserved for orders`} tone="purple" />
    </div>
    <Tabs tabs={[{ id: 'batches', label: 'Batch register' }, { id: 'trace', label: 'Traceability search' }]} value={view} onChange={setView} />
    {view === 'batches' ? <Subsection title="Batch register" description="Review source, quality and current stock for each batch. Select a row to inspect it or use the row actions to adjust or transfer stock."><StockPanel canAdjust={canAdjust} canTransfer={canTransfer} initialTab="batches" hideTabs onChanged={() => void reload()} /></Subsection> : <Subsection title="Trace a batch" description="Search by batch, receipt, processing run, dispatch, release note or order to follow its source and destination."><TracePanel /></Subsection>}
  </div>;
}

function QualityWorkspace({ canReviewReceipts, canReviewMilling, canReverse, canConfirm }: { canReviewReceipts: boolean; canReviewMilling: boolean; canReverse: boolean; canConfirm: boolean }) {
  const initialTab = canReviewReceipts ? 'receipts' : 'milling';
  const [view, setView] = useState<'receipts' | 'milling'>(initialTab);
  const { data, error, loading } = useLoad<any>(async () => {
    const [receipts, milling] = await Promise.all([
      canReviewReceipts ? opsApi.receipts({ status: 'CONFIRMED' }) : Promise.resolve({ data: [] }),
      canReviewMilling ? opsApi.yieldReport() : Promise.resolve({ data: null }),
    ]);
    return { data: { receipts: receipts.data ?? [], milling: milling.data } };
  }, [canReviewReceipts, canReviewMilling]);
  const receipts = data?.receipts ?? [];
  const inspected = receipts.filter((r: any) => ['PASSED', 'PARTIAL', 'FAILED'].includes(r.inspection));
  const acceptedKg = receipts.reduce((sum: number, r: any) => sum + Math.max(0, (Number(r.grossKg) || 0) - (Number(r.rejectedKg) || 0)), 0);
  const rejectedKg = receipts.reduce((sum: number, r: any) => sum + (Number(r.rejectedKg) || 0), 0);
  const flagged = data?.milling?.flagged ?? 0;
  return <div className="warehouse-quality-workspace">
    <ErrorNote message={error} />
    <div className="warehouse-quality-intro"><div><h3>Quality performance</h3><p>Confirmed deliveries and completed milling runs, based on recorded inspection and weight data.</p></div><span>{loading ? 'Updating…' : 'Current records'}</span></div>
    <div className="warehouse-metric-grid">
      <WarehouseMetric icon={ClipboardCheck} label="Deliveries inspected" value={canReviewReceipts ? num(inspected.length) : '—'} hint={canReviewReceipts ? `${num(receipts.length)} confirmed deliveries` : 'Not available for your role'} tone="blue" />
      <WarehouseMetric icon={Wheat} label="Paddy accepted" value={canReviewReceipts ? kg(acceptedKg) : '—'} hint="Net of recorded rejections" tone="green" />
      <WarehouseMetric icon={AlertTriangle} label="Paddy rejected" value={canReviewReceipts ? kg(rejectedKg) : '—'} hint="Recorded at receiving inspection" tone={rejectedKg > 0 ? 'red' : 'purple'} />
      <WarehouseMetric icon={Factory} label="Milling runs flagged" value={canReviewMilling ? num(flagged) : '—'} hint={canReviewMilling ? `${num(data?.milling?.runs ?? 0)} runs reviewed` : 'Not available for your role'} tone={flagged > 0 ? 'red' : 'green'} />
    </div>
    <Tabs tabs={[
      ...(canReviewReceipts ? [{ id: 'receipts' as const, label: `Delivery inspections · ${num(receipts.length)}` }] : []),
      ...(canReviewMilling ? [{ id: 'milling' as const, label: `Milling yield & loss · ${num(data?.milling?.runs ?? 0)}` }] : []),
    ]} value={view} onChange={setView} />
    {view === 'receipts' && canReviewReceipts && <Subsection title="Confirmed delivery inspections" description="Review paddy quality, moisture, accepted quantities and rejected amounts. Select a receipt for its inspection details."><ReceivingPanel canCreate={false} canConfirm={canConfirm} canCancel={false} initialStatus="CONFIRMED" /></Subsection>}
    {view === 'milling' && canReviewMilling && <Subsection title="Milling yield and loss" description="Compare paddy input with rice output and inspect runs whose yield or loss needs review."><ProcessingPanel canCreate={false} canReverse={canReverse} /></Subsection>}
  </div>;
}

function Overview({ goto }: { goto: (t: WarehousePage) => void }) {
  const { data: d, error, loading, reload } = useLoad<any>(async () => {
    const [dashboard, position, ledger] = await Promise.all([opsApi.commercialDashboard(), opsApi.position(), opsApi.ledger()]);
    return { data: { dashboard: dashboard.data, position: position.data ?? [], ledger: ledger.data ?? [] } };
  });
  const rows = d?.position ?? [];
  const warehouseRows = useMemo(() => {
    const byWarehouse = new Map<string, any>();
    for (const row of rows) {
      const key = row.warehouseId || row.warehouse || 'Unassigned';
      const item = byWarehouse.get(key) ?? { name: row.warehouse || 'Unassigned', quantity: 0, value: 0, valued: true };
      item.quantity += Number(row.closingKg) || 0;
      if (row.indicativeValue == null) item.valued = false;
      else item.value += Number(row.indicativeValue) || 0;
      byWarehouse.set(key, item);
    }
    return [...byWarehouse.values()].sort((a, b) => b.quantity - a.quantity);
  }, [rows]);
  if (loading && !d) return <Loading />;
  if (!d) return <ErrorNote message={error} />;

  const dashboard = d.dashboard;
  const stock = dashboard.stock;
  const total = rows.reduce((sum: number, row: any) => sum + (Number(row.closingKg) || 0), 0);
  const totalValue = rows.reduce((sum: number, row: any) => sum + (Number(row.indicativeValue) || 0), 0);
  const valueComplete = rows.length > 0 && rows.every((row: any) => row.indicativeValue != null);
  const products: string[] = [...new Set<string>(rows.map((row: any) => String(row.product)))].slice(0, 6);
  const warehouses = warehouseRows.slice(0, 4);
  const palette = ['#2784e8', '#16a36a', '#f2a62c', '#8054d8'];
  const chartRows = products.map((product) => {
    const result: Record<string, any> = { product: product.length > 15 ? `${product.slice(0, 14)}…` : product };
    for (const warehouse of warehouses) {
      result[warehouse.name] = Number((rows.filter((r: any) => r.product === product && r.warehouse === warehouse.name).reduce((s: number, r: any) => s + (Number(r.closingKg) || 0), 0) / 1000).toFixed(2));
    }
    return result;
  });
  const series = warehouses.map((warehouse, i) => ({ key: warehouse.name, name: warehouse.name, color: palette[i % palette.length] }));
  const categoryTotals = [
    { name: 'Paddy', value: Number(((stock.paddyKg || 0) / 1000).toFixed(2)) },
    { name: 'Rice', value: Number(((stock.processedKg || 0) / 1000).toFixed(2)) },
    { name: 'Broken rice', value: Number(((stock.brokenKg || 0) / 1000).toFixed(2)) },
    { name: 'By-products', value: Number(((stock.byproductKg || 0) / 1000).toFixed(2)) },
  ];
  const recent = d.ledger as any[];
  const attention = [
    ...(stock.lowStock ?? []).map((item: any) => ({ label: `${item.product} at ${item.warehouse} is below its reorder level`, detail: `${kg(item.availableKg)} available · reorder at ${kg(item.reorderLevelKg)}`, page: 'inventory' as WarehousePage })),
    ...(dashboard.riceProcessed.flagged ? [{ label: `${num(dashboard.riceProcessed.flagged)} milling run(s) need a yield or loss review`, detail: 'Check the recorded input and output weights.', page: 'quality' as WarehousePage }] : []),
    ...(dashboard.ordersAwaitingFulfilment ? [{ label: `${num(dashboard.ordersAwaitingFulfilment)} paid order(s) are waiting for fulfilment`, detail: 'Review allocations and dispatch readiness.', page: 'dispatch' as WarehousePage }] : []),
  ];
  const date = (value: string) => value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—';
  const movementLabel = (type: string) => ({ RECEIPT: 'Receiving', TRANSFER_IN: 'Transfer in', TRANSFER_OUT: 'Transfer out', PROCESS_IN: 'Production', PROCESS_OUT: 'Milling input', DISPATCH: 'Dispatch', ADJUSTMENT: 'Adjustment', WRITE_OFF: 'Write-off' }[type] ?? type);
  const kgVal = (value: number) => `${num(Math.round(value))} kg`;
  const mtVal = (value: number) => `${(value / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MT`;
  const quickActions = [
    { icon: ArrowDownToLine, title: 'Receive goods', subtitle: 'Record incoming stock', page: 'receiving' as WarehousePage, color: 'green' },
    { icon: ArrowLeftRight, title: 'Transfer stock', subtitle: 'Move stock between warehouses', page: 'movements' as WarehousePage, color: 'blue' },
    { icon: ClipboardList, title: 'Stock count', subtitle: 'Review batches and count differences', page: 'counts' as WarehousePage, color: 'purple' },
    { icon: SlidersHorizontal, title: 'Adjust stock', subtitle: 'Correct a verified quantity', page: 'inventory' as WarehousePage, color: 'gold' },
  ];

  return <section className="warehouse-overview" aria-label="Warehouse overview">
    <div className="warehouse-overview-head">
      <div className="warehouse-overview-title"><span className="warehouse-overview-icon"><Boxes size={26} /></span><div><h2>Warehouse &amp; Inventory</h2><p>Track stock levels, manage warehouse operations and maintain traceability from receipt to dispatch.</p></div></div>
      <div className="warehouse-overview-actions"><button type="button" className="btn-secondary" onClick={() => void reload()}><RefreshCw size={15} /> Refresh</button><button type="button" className="btn-primary" onClick={() => goto('receiving')}><ArrowDownToLine size={16} /> New Receive</button></div>
    </div>
    <ErrorNote message={error} />
    <div className="warehouse-metric-grid">
      <WarehouseMetric icon={Package} label="Total stock quantity" value={mtVal(total)} hint={`${mtVal(stock.availableKg || 0)} available to use`} tone="blue" />
      <WarehouseMetric icon={Boxes} label="Indicative stock value" value={valueComplete ? `TZS ${num(totalValue)}` : '—'} hint={valueComplete ? 'Based on configured product prices' : 'Set product prices to value all stock'} tone="green" />
      <WarehouseMetric icon={ClipboardCheck} label="Reserved for orders" value={kgVal(stock.reservedKg || 0)} hint="Allocated and not yet dispatched" tone="red" />
      <WarehouseMetric icon={Truck} label="Items in transit" value={mtVal(stock.inTransitKg || 0)} hint="Transfers awaiting receipt" tone="green" />
    </div>
    <div className="warehouse-overview-grid warehouse-overview-grid-top">
      <ChartCard title="Stock by product" subtitle="Physical quantity in metric tonnes, by warehouse" action={<LinkBtn onClick={() => goto('reports')}>View inventory report →</LinkBtn>}>
        <GroupedBarChart data={chartRows} xKey="product" series={series} height={280} />
      </ChartCard>
      <ChartCard title="Stock by warehouse" subtitle="Current physical balance and indicative value" action={<LinkBtn onClick={() => goto('setup')}>View warehouses →</LinkBtn>}>
        <DataTable rows={warehouseRows} rowKey={(row: any) => row.name} empty="No warehouse stock recorded yet."
          columns={[{ header: 'Warehouse / location', render: (row: any) => <strong>{row.name}</strong> }, { header: 'Quantity', align: 'right', render: (row: any) => mtVal(row.quantity) }, { header: 'Indicative value', align: 'right', render: (row: any) => row.valued ? `TZS ${num(Math.round(row.value))}` : '—' }, { header: 'Status', render: (row: any) => <span className={`warehouse-status ${row.quantity > 0 ? 'is-normal' : 'is-empty'}`}>{row.quantity > 0 ? 'In stock' : 'Empty'}</span> }]} />
      </ChartCard>
    </div>
    <div className="warehouse-overview-grid warehouse-overview-grid-bottom">
      <ChartCard title="Recent stock movements" subtitle="Latest receipts, production, transfers, dispatches and adjustments" action={<LinkBtn onClick={() => goto('movements')}>View all movements →</LinkBtn>}>
        <DataTable rows={recent} rowKey={(entry: any) => entry.id} empty="No stock movements recorded yet."
          columns={[{ header: 'Date & time (EAT)', render: (entry: any) => date(entry.createdAt) }, { header: 'Batch', render: (entry: any) => <strong>{entry.batch?.reference || '—'}</strong> }, { header: 'Product', render: (entry: any) => entry.batch?.product?.name || '—' }, { header: 'Type', render: (entry: any) => movementLabel(entry.type) }, { header: 'Quantity', align: 'right', render: (entry: any) => <span className={entry.quantityKg < 0 ? 'warehouse-negative' : ''}>{kgVal(entry.quantityKg)}</span> }, { header: 'Warehouse', render: (entry: any) => rows.find((r: any) => r.warehouseId === entry.warehouseId)?.warehouse || '—' }]} />
      </ChartCard>
      <ChartCard title="Stock by category" subtitle="Current physical stock composition (MT)">
        <DonutBreakdown data={categoryTotals} height={230} />
      </ChartCard>
    </div>
    <div className="warehouse-action-grid">{quickActions.map(({ icon: Icon, title, subtitle, page, color }) => <button key={title} type="button" className={`warehouse-action-card tone-${color}`} onClick={() => goto(page)}><span className="warehouse-action-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><span className="warehouse-action-arrow">›</span></button>)}
      <div className={`warehouse-balance-card ${attention.length ? 'has-attention' : ''}`}><span className="warehouse-action-icon">{attention.length ? <AlertTriangle size={20} /> : <ClipboardCheck size={20} />}</span><span><strong>{attention.length ? `${attention.length} item(s) need attention` : 'Stock position is clear'}</strong><small>{attention.length ? attention[0].label : 'No low stock or workflow exceptions found.'}</small></span>{attention.length > 0 && <button type="button" onClick={() => goto(attention[0].page)}>Review →</button>}</div>
    </div>
  </section>;
}

function WarehouseMetric({ icon: Icon, label, value, hint, tone }: { icon: typeof Package; label: string; value: string; hint: string; tone: string }) {
  return <article className="warehouse-metric-card"><span className={`warehouse-metric-icon tone-${tone}`}><Icon size={21} /></span><div className="warehouse-metric-copy"><div className="warehouse-metric-label">{label}</div><strong>{value}</strong><small>{hint}</small></div></article>;
}
