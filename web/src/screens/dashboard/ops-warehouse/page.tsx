'use client';
import { useState } from 'react';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { kg, tzs } from '@/lib/ops';
import { ErrorNote, Facts, Field, Loading, PageHead, Tabs, Toolbar, DataTable, useLoad } from '@/components/ops/ui';
import ReceivingPanel from '@/components/ops/ReceivingPanel';
import StockPanel from '@/components/ops/StockPanel';
import ProcessingPanel from '@/components/ops/ProcessingPanel';
import DispatchPanel from '@/components/ops/DispatchPanel';
import TracePanel from '@/components/ops/TracePanel';
import ProductsPanel from '@/components/ops/ProductsPanel';
import ReportsRunner from '@/components/ops/ReportsRunner';
import InstallRoles from '@/components/ops/InstallRoles';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = 'overview' | 'receiving' | 'stock' | 'processing' | 'dispatch' | 'trace' | 'products' | 'reports';

export default function OpsWarehousePage() {
  const user = useAuthStore((s) => s.user);
  const can = (r: string, a: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' = 'VIEW') => hasPermission(user, r, a);
  const tabs = ([
    ['overview', 'Overview', can('ops_reports') || can('ops_stock')], ['receiving', 'Receiving', can('ops_receiving')], ['stock', 'Stock', can('ops_stock')], ['processing', 'Processing', can('ops_processing')],
    ['dispatch', 'Dispatch', can('ops_dispatch')], ['trace', 'Traceability', can('ops_stock')], ['products', 'Products', can('ops_catalog')], ['reports', 'Reports', can('ops_reports')],
  ] as [Tab, string, boolean][]).filter((t) => t[2]).map(([id, label]) => ({ id, label }));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'overview');
  return (
    <div>
      <PageHead kicker="Mayode Operations" title="Warehouse & Processing" subtitle="Paddy received, milled and packed, stock by batch, and goods released to customers." />
      {can('roles', 'CREATE') && <InstallRoles />}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}
      {tab === 'receiving' && <ReceivingPanel canCreate={can('ops_receiving', 'CREATE')} canConfirm={can('ops_receiving', 'EDIT')} canCancel={can('ops_receiving', 'DELETE')} />}
      {tab === 'stock' && <StockPanel canAdjust={can('ops_stock', 'EDIT')} canTransfer={can('ops_stock', 'EDIT')} />}
      {tab === 'processing' && <ProcessingPanel canCreate={can('ops_processing', 'CREATE')} canReverse={can('ops_processing', 'DELETE')} />}
      {tab === 'dispatch' && <DispatchPanel canAllocate={can('ops_dispatch', 'CREATE')} canRelease={can('ops_dispatch', 'EDIT')} canCancel={can('ops_dispatch', 'DELETE')} />}
      {tab === 'trace' && <TracePanel />}
      {tab === 'products' && <ProductsPanel canCreate={can('ops_catalog', 'CREATE')} canEdit={can('ops_catalog', 'EDIT')} />}
      {tab === 'reports' && <ReportsRunner groups={['Warehouse', 'Commercial']} />}
      {!tabs.length && <ErrorNote message="Your role does not include the warehouse." />}
    </div>
  );
}

function Overview() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: d, error, loading } = useLoad<any>(() => opsApi.commercialDashboard({ from: from || undefined, to: to || undefined }), [from, to]);
  return (
    <>
      <Toolbar>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !d ? <Loading /> : d && (
        <>
          <Facts min={190} items={[
            ['Paddy received', `${kg(d.paddyReceivedKg)} · ${d.receipts} receipts`], ['Paddy milled', kg(d.riceProcessed.paddyMilledKg)], ['Rice produced', kg(d.riceProcessed.milledRiceKg)],
            ['Average yield', `${d.riceProcessed.averageYieldPct}%`], ['Average loss', `${d.riceProcessed.averageLossPct}%`], ['Runs to check', d.riceProcessed.flagged],
            ['Orders waiting for accounts', d.ordersAwaitingReview], ['Invoices issued', `${d.invoicesIssued.count} · ${tzs(d.invoicesIssued.value)}`], ['Still owed', `${d.invoicesOutstanding.count} · ${tzs(d.invoicesOutstanding.value)}`],
            ['Payments confirmed', `${d.confirmedPayments.count} · ${tzs(d.confirmedPayments.value)}`], ['Paid orders at the warehouse', d.ordersAwaitingFulfilment], ['Goods dispatched', kg(d.goodsDispatchedKg)],
          ]} />
          <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Stock now</h4>
          <Facts min={170} items={[['Paddy', kg(d.stock.paddyKg)], ['Processed rice', kg(d.stock.processedKg)], ['Broken rice', kg(d.stock.brokenKg)], ['By-products', kg(d.stock.byproductKg)], ['Reserved for orders', kg(d.stock.reservedKg)], ['Available to sell', kg(d.stock.availableKg)], ['On the way between warehouses', kg(d.stock.inTransitKg)]]} />
          <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Processed rice by brand</h4>
          <DataTable rows={d.processedByBrand} rowKey={(b: any) => b.brand} empty="No processed rice in stock." columns={[{ header: 'Brand', render: (b: any) => b.brand }, { header: 'On hand', align: 'right', render: (b: any) => kg(b.physicalKg) }, { header: 'Available', align: 'right', render: (b: any) => kg(b.availableKg) }]} />
          {d.stock.lowStock.length > 0 && (<>
            <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Running low</h4>
            <DataTable rows={d.stock.lowStock} rowKey={(b: any) => b.product + b.warehouse} columns={[{ header: 'Product', render: (b: any) => b.product }, { header: 'Warehouse', render: (b: any) => b.warehouse }, { header: 'Available', align: 'right', render: (b: any) => kg(b.availableKg) }, { header: 'Reorder at', align: 'right', render: (b: any) => kg(b.reorderLevelKg) }]} />
          </>)}
        </>
      )}
    </>
  );
}
