'use client';
import { useState } from 'react';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { day, tzs } from '@/lib/ops';
import { DataTable, ErrorNote, Field, Loading, PageHead, Status, Tabs, Toolbar, useLoad } from '@/components/ops/ui';
import CustomerModal, { type Customer } from '@/components/ops/CustomerModal';
import NewDocModal from '@/components/ops/NewDocModal';
import OrderModal from '@/components/ops/OrderModal';
import ReportsRunner from '@/components/ops/ReportsRunner';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = 'orders' | 'quotations' | 'customers' | 'invoices' | 'payments' | 'reports';

const STAGES = [
  ['', 'All stages'], ['PENDING_ACCOUNTS_REVIEW', 'Waiting for accounts'], ['RETURNED_TO_SALES', 'Returned to sales'], ['APPROVED_FOR_INVOICING', 'Ready to invoice'],
  ['INVOICED', 'Invoiced'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'],
];

export default function OpsOrdersPage() {
  const user = useAuthStore((s) => s.user);
  const can = (r: string, a: 'VIEW' | 'CREATE' | 'EDIT' = 'VIEW') => hasPermission(user, r, a);
  const tabs = ([
    ['orders', 'Orders', can('ops_orders') || can('ops_review')], ['quotations', 'Quotations', can('ops_orders')], ['customers', 'Customers', can('ops_customers') || can('ops_orders')],
    ['invoices', 'Invoices', can('ops_review') || can('ops_payments')], ['payments', 'Payments', can('ops_payments')], ['reports', 'Reports', can('ops_reports')],
  ] as [Tab, string, boolean][]).filter((t) => t[2]).map(([id, label]) => ({ id, label }));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'orders');

  return (
    <div>
      <PageHead kicker="Mayode Operations" title="Orders & Billing" subtitle="Quotations, orders, accounts review, invoices and verified payments, up to release for dispatch." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'orders' && <Orders canCreate={can('ops_orders', 'CREATE')} />}
      {tab === 'quotations' && <Quotations canCreate={can('ops_orders', 'CREATE')} />}
      {tab === 'customers' && <Customers canCreate={can('ops_customers', 'CREATE') || can('ops_orders', 'CREATE')} />}
      {tab === 'invoices' && <Invoices />}
      {tab === 'payments' && <Payments />}
      {tab === 'reports' && <ReportsRunner groups={['Commercial']} />}
      {!tabs.length && <ErrorNote message="Your role does not include orders or billing." />}
    </div>
  );
}

function Orders({ canCreate }: { canCreate: boolean }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.orders({ status: status || undefined, q: q || undefined }), [status, q]);
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>New order</button>}>
        <Field label="Stage"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Search"><input className="input-field" placeholder="Order, invoice or customer" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(o) => o.id} onRow={(o) => setOpen(o.id)} empty="No orders yet."
          columns={[
            { header: 'Order', render: (o) => <strong>{o.reference}</strong> }, { header: 'Customer', render: (o) => o.customer.name }, { header: 'Date', render: (o) => day(o.createdAt) },
            { header: 'Total', align: 'right', render: (o) => tzs(o.total) }, { header: 'Paid', align: 'right', render: (o) => tzs(o.amountPaid) },
            { header: 'Stage', render: (o) => <Status value={o.status} /> }, { header: 'Payment', render: (o) => <Status value={o.paymentStatus} /> }, { header: 'Warehouse', render: (o) => <Status value={o.fulfilState} /> },
          ]} />
      )}
      {open && <OrderModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <NewDocModal kind="order" onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); reload(); setOpen(id); }} />}
    </>
  );
}

function Quotations({ canCreate }: { canCreate: boolean }) {
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [error, setError] = useState('');
  const [converting, setConverting] = useState<any>(null);
  const { data, loading, reload } = useLoad<any[]>(() => opsApi.quotations({ status: status || undefined }), [status]);
  const setStatusOf = async (status: string) => {
    try { await opsApi.quotationStatus(edit.id, status); setEdit(null); reload(); } catch { setError('That change is not possible now.'); }
  };
  const view = async (id: string) => { try { setEdit((await opsApi.quotation(id)).data); } catch { setError('Could not open that quotation.'); } };
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>New quotation</button>}>
        <Field label="Status"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</select></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(x) => x.id} onRow={(x) => view(x.id)} empty="No quotations yet."
          columns={[{ header: 'Quotation', render: (x) => <strong>{x.reference}</strong> }, { header: 'Customer', render: (x) => x.customer.name }, { header: 'Date', render: (x) => day(x.createdAt) },
            { header: 'Valid until', render: (x) => day(x.validUntil) }, { header: 'Total', align: 'right', render: (x) => tzs(x.total) }, { header: 'Status', render: (x) => <Status value={x.status} /> }]} />
      )}
      {creating && <NewDocModal kind="quotation" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {edit && !converting && (
        <NewDocModal kind="quotation" existing={edit.status === 'DRAFT' || edit.status === 'SENT' ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      )}
      {edit && canCreate && !converting && ['DRAFT', 'SENT', 'ACCEPTED'].includes(edit.status) && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1100, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '90vw' }}>
          {edit.status === 'DRAFT' && <button className="btn-secondary" onClick={() => setStatusOf('SENT')}>Mark as sent</button>}
          {['DRAFT', 'SENT'].includes(edit.status) && <button className="btn-secondary" onClick={() => setStatusOf('ACCEPTED')}>Customer accepted</button>}
          {['DRAFT', 'SENT'].includes(edit.status) && <button className="btn-secondary" onClick={() => setStatusOf('REJECTED')}>Customer declined</button>}
          {['SENT', 'ACCEPTED'].includes(edit.status) && <button className="btn-primary" onClick={() => setConverting(edit)}>Turn into an order</button>}
        </div>
      )}
      {converting && <NewDocModal kind="order" fromQuotation={converting} onClose={() => { setConverting(null); setEdit(null); }} onSaved={() => { setConverting(null); setEdit(null); reload(); }} />}
    </>
  );
}

function Customers({ canCreate }: { canCreate: boolean }) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Customer | 'new' | null>(null);
  const { data, error, loading, reload } = useLoad<Customer[]>(() => opsApi.customers({ q: q || undefined }), [q]);
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setEdit('new')}>New customer</button>}>
        <Field label="Search"><input className="input-field" placeholder="Name, phone, TIN" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(c) => c.id} onRow={canCreate ? (c) => setEdit(c) : undefined} empty="No customers yet."
          columns={[{ header: 'Customer', render: (c) => <strong>{c.name}</strong> }, { header: 'Reference', render: (c) => c.reference }, { header: 'Type', render: (c) => (c.type === 'BUSINESS' ? 'Business' : 'Individual') },
            { header: 'Phone', render: (c) => c.phone }, { header: 'Contact person', render: (c) => c.contactPerson ?? '—' }, { header: 'TIN', render: (c) => c.tin ?? '—' }, { header: 'Active', render: (c) => (c.isActive ? 'Yes' : 'No') }]} />
      )}
      {edit && <CustomerModal customer={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function Invoices() {
  const [status, setStatus] = useState('');
  const [outstanding, setOutstanding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.invoices({ status: status || undefined, outstanding: outstanding ? 'true' : undefined }), [status, outstanding]);
  return (
    <>
      <Toolbar>
        <Field label="Status"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}</select></Field>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" checked={outstanding} onChange={(e) => setOutstanding(e.target.checked)} />Outstanding only</label>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(i) => i.id} onRow={(i) => setOpen(i.orderId)} empty="No invoices yet."
          columns={[{ header: 'Invoice', render: (i) => <strong>{i.invoiceNumber}</strong> }, { header: 'Customer', render: (i) => i.customerName }, { header: 'Date', render: (i) => day(i.invoiceDate) }, { header: 'Due', render: (i) => <span style={i.overdue ? { color: 'var(--red-500)' } : undefined}>{day(i.dueDate)}</span> },
            { header: 'Total', align: 'right', render: (i) => tzs(i.total) }, { header: 'Balance', align: 'right', render: (i) => tzs(i.balance) }, { header: 'Control no.', render: (i) => i.controlNumber ?? '—' }, { header: 'Status', render: (i) => <Status value={i.status} /> }]} />
      )}
      {open && <OrderModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function Payments() {
  const [status, setStatus] = useState('PENDING');
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.payments({ status: status || undefined }), [status]);
  return (
    <>
      <Toolbar>
        <Field label="Status"><select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="PENDING">Waiting for confirmation</option><option value="CONFIRMED">Confirmed</option><option value="REJECTED">Rejected</option></select></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(p) => p.id} onRow={(p) => setOpen(p.orderId)} empty="No payments in this list."
          columns={[{ header: 'Date', render: (p) => day(p.paidAt ?? p.createdAt) }, { header: 'Order', render: (p) => p.order?.reference ?? '—' }, { header: 'Invoice', render: (p) => p.invoice?.invoiceNumber ?? '—' }, { header: 'Customer', render: (p) => p.invoice?.customerName ?? '—' },
            { header: 'Amount', align: 'right', render: (p) => tzs(p.amount) }, { header: 'Method', render: (p) => `${p.method.replace('_', ' ').toLowerCase()} · ${p.provider}` }, { header: 'Reference', render: (p) => p.providerReference }, { header: 'Status', render: (p) => <Status value={p.status} /> }]} />
      )}
      {open && <OrderModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}
