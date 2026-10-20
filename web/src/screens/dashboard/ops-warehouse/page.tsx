'use client';
import { useState } from 'react';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { kg } from '@/lib/ops';
import { ErrorNote, Field, Loading, PageHead, Tabs, Toolbar, useLoad } from '@/components/ops/ui';
import { ChartCard, DonutBreakdown, HorizontalBarChart } from '@/components/role-dashboards/Charts';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import { WarehouseView } from '../warehouse/page';
import ReceivingPanel from '@/components/ops/ReceivingPanel';
import StockPanel from '@/components/ops/StockPanel';
import ProcessingPanel from '@/components/ops/ProcessingPanel';
import DispatchPanel from '@/components/ops/DispatchPanel';
import TracePanel from '@/components/ops/TracePanel';
import ProductsPanel from '@/components/ops/ProductsPanel';
import ReportsRunner from '@/components/ops/ReportsRunner';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = 'overview' | 'receiving' | 'processing' | 'stock' | 'dispatch' | 'trace' | 'products' | 'counter' | 'reports';

const LinkBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--green-600, var(--accent))', fontWeight: 600, cursor: 'pointer' }}>{children}</button>
);

const START_KEY = 'mayode.warehouse.startHereDismissed';
const readDismissed = () => { try { return localStorage.getItem(START_KEY) === '1'; } catch { return false; } };

const num = (n?: number | null) => (n || 0).toLocaleString();

export default function OpsWarehousePage() {
  const user = useAuthStore((s) => s.user);
  const can = (r: string, a: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' = 'VIEW') => hasPermission(user, r, a);
  // The order follows the rice: in, milled, kept, out. The counter and Products are set-up and everyday extras.
  const tabs = ([
    ['overview', 'Overview', can('ops_reports') || can('ops_stock')], ['receiving', 'Receiving', can('ops_receiving')], ['processing', 'Milling', can('ops_processing')], ['stock', 'Stock', can('ops_stock')],
    ['dispatch', 'Dispatch', can('ops_dispatch')], ['trace', 'Traceability', can('ops_stock')], ['counter', 'Counter & warehouses', can('warehouse_desk')], ['products', 'Products', can('ops_catalog')], ['reports', 'Reports', can('ops_reports')],
  ] as [Tab, string, boolean][]).filter((t) => t[2]).map(([id, label]) => ({ id, label }));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'overview');
  const goto = (t: Tab) => { if (tabs.some((x) => x.id === t)) setTab(t); };
  return (
    <div>
      <PageHead kicker="Mayode Operations" title="Warehouse" subtitle="Receive paddy, mill it, keep stock, and release goods to customers." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview goto={goto} />}
      {tab === 'receiving' && <ReceivingPanel canCreate={can('ops_receiving', 'CREATE')} canConfirm={can('ops_receiving', 'EDIT')} canCancel={can('ops_receiving', 'DELETE')} />}
      {tab === 'processing' && <ProcessingPanel canCreate={can('ops_processing', 'CREATE')} canReverse={can('ops_processing', 'DELETE')} />}
      {tab === 'stock' && <StockPanel canAdjust={can('ops_stock', 'EDIT')} canTransfer={can('ops_stock', 'EDIT')} />}
      {tab === 'dispatch' && <DispatchPanel canAllocate={can('ops_dispatch', 'CREATE')} canRelease={can('ops_dispatch', 'EDIT')} canCancel={can('ops_dispatch', 'DELETE')} />}
      {tab === 'trace' && <TracePanel />}
      {tab === 'counter' && <WarehouseView embedded />}
      {tab === 'products' && <ProductsPanel canCreate={can('ops_catalog', 'CREATE')} canEdit={can('ops_catalog', 'EDIT')} />}
      {tab === 'reports' && <ReportsRunner groups={['Warehouse']} />}
      {!tabs.length && <ErrorNote message="Your role does not include the warehouse." />}
    </div>
  );
}

function Overview({ goto }: { goto: (t: Tab) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(START_KEY, '1'); } catch { /* the guide just comes back next visit */ } };
  const { data: d, error, loading } = useLoad<any>(() => opsApi.commercialDashboard({ from: from || undefined, to: to || undefined }), [from, to]);
  if (loading && !d) return <Loading />;
  if (!d) return <ErrorNote message={error} />;

  const st = d.stock;
  const onHand = st.paddyKg + st.processedKg + st.brokenKg + st.byproductKg;
  const brandBars = (d.processedByBrand as any[]).map((b) => ({ name: b.brand, value: Math.round(b.availableKg) }));
  const attention = [
    d.riceProcessed.flagged > 0 && { text: `${num(d.riceProcessed.flagged)} milling run(s) with an unusual yield or loss — check the weights`, to: 'processing' as Tab },
    d.ordersAwaitingFulfilment > 0 && { text: `${num(d.ordersAwaitingFulfilment)} paid order(s) are waiting at the warehouse to be loaded`, to: 'dispatch' as Tab },
    st.inTransitKg > 0 && { text: `${kg(st.inTransitKg)} is on the way between warehouses and has not been received`, to: 'stock' as Tab },
    ...(st.lowStock as any[]).map((b) => ({ text: `${b.product} at ${b.warehouse} is running low: ${kg(b.availableKg)} left, reorder at ${kg(b.reorderLevelKg)}`, to: 'stock' as Tab })),
  ].filter(Boolean) as { text: string; to: Tab }[];
  const empty = onHand === 0 && d.receipts === 0 && !dismissed;

  return (
    <section className="role-dashboard" style={{ margin: 0 }} aria-label="Warehouse overview">
      <Toolbar>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />

      {empty && (
        <ChartCard title="Start here" subtitle="Nothing has been received yet. Work through these in order." action={<button type="button" className="btn-secondary" onClick={dismiss} aria-label="Dismiss the start-here guide">Dismiss</button>}>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14 }}>
            <li><LinkBtn onClick={() => goto('products')}>Products</LinkBtn> — add paddy, the rice you sell and the by-products (set this up once).</li>
            <li><LinkBtn onClick={() => goto('receiving')}>Receiving</LinkBtn> — weigh paddy in from a farmer or a Mayode farm and confirm it.</li>
            <li><LinkBtn onClick={() => goto('processing')}>Milling</LinkBtn> — record what the mill produced from the paddy.</li>
            <li><LinkBtn onClick={() => goto('dispatch')}>Dispatch</LinkBtn> — once an order is paid, set stock aside, load it and release it.</li>
          </ol>
        </ChartCard>
      )}

      <div className="role-grid">
        <MetricTile label="Paddy in stock" value={kg(st.paddyKg)} hint="Not yet milled" tone="gold" />
        <MetricTile label="Rice in stock" value={kg(st.processedKg)} hint="Milled and packed" />
        <MetricTile label="Available to sell" value={kg(st.availableKg)} hint={`${kg(st.reservedKg)} reserved for orders`} tone="blue" />
        <MetricTile label="Paddy received" value={kg(d.paddyReceivedKg)} hint={`${num(d.receipts)} receipts in this period`} tone="purple" />
        <MetricTile label="Rice produced" value={kg(d.riceProcessed.milledRiceKg)} hint={`from ${kg(d.riceProcessed.paddyMilledKg)} of paddy`} />
        <MetricTile label="Average yield" value={`${d.riceProcessed.averageYieldPct}%`} hint={`${d.riceProcessed.averageLossPct}% average loss`} tone="gold" />
        <MetricTile label="Goods dispatched" value={kg(d.goodsDispatchedKg)} hint="Released to customers" tone="blue" />
        <MetricTile label="Waiting to be loaded" value={num(d.ordersAwaitingFulfilment)} hint="Paid orders at the warehouse" tone={d.ordersAwaitingFulfilment ? 'red' : 'green'} />
      </div>

      <div className="role-two-col-even">
        <ChartCard title="What is in the warehouse" subtitle="Kilograms on hand, by kind">
          <DonutBreakdown data={[
            { name: 'Paddy', value: Math.round(st.paddyKg) },
            { name: 'Processed rice', value: Math.round(st.processedKg) },
            { name: 'Broken rice', value: Math.round(st.brokenKg) },
            { name: 'By-products', value: Math.round(st.byproductKg) },
          ]} />
        </ChartCard>
        <ChartCard title="Rice you can sell, by brand" subtitle="Kilograms available now">
          <HorizontalBarChart data={brandBars} height={Math.max(220, brandBars.length * 38)} />
        </ChartCard>
      </div>

      <ChartCard title="Needs attention" subtitle="Worked out from live records">
        {attention.length === 0 ? (
          <div className="role-empty-state">Nothing needs attention right now.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {attention.map((a) => (
              <li key={a.text} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                <span>{a.text}</span>
                <LinkBtn onClick={() => goto(a.to)}>Open →</LinkBtn>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </section>
  );
}
