'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { salesApi } from '@/lib/api';
import { MetricTile, toneFromColor } from '@/components/role-dashboards/DashboardPrimitives';

const gateLabels: Record<string, string> = {
  crop_cycle: 'Source crop cycle',
  harvest: 'Harvest task',
  drying: 'Drying task',
  bagging: 'Bagging task',
  warehouse_receipt: 'Warehouse receipt',
  drying_moisture: 'Drying moisture at or below 14%',
};

const formatMissing = (missing: string[] = []) =>
  missing.map((key) => gateLabels[key] || key.replace(/_/g, ' ')).join(', ');

/** Confirmed sales, buyer payments and farmer payouts. `embedded` drops the page heading when shown as a tab of Orders & Sales. */
export function SalesView({ embedded = false }: { embedded?: boolean }) {
  const [sales, setSales] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{ buyer: string; open: boolean } | null>(null);

  const load = () =>
    salesApi
      .list()
      .then((response) => setSales(response.data))
      .catch(() => setError('Unable to load cooperative sales.'));

  useEffect(() => {
    void load();
  }, []);

  const readableError = (exception: any, fallback: string) => {
    const data = exception?.response?.data;
    const body = data?.message && typeof data.message === 'object' ? data.message : data;
    if (body?.code === 'MBALARI_QUALITY_GATE') {
      return `Mbalari quality gate incomplete: ${formatMissing(body.missing || [])}`;
    }
    const message = data?.message;
    if (typeof message === 'string' && message.includes('Mbalari quality gate')) {
      return `${message}. Open the crop cycle calendar and complete warehouse readiness before selling.`;
    }
    if (Array.isArray(message)) return message.join(', ');
    return message || fallback;
  };


  const collect = async (sale: any) => {
    try {
      await salesApi.collect(sale.id);
      setConfirmation({ buyer: sale.buyer.name, open: true });
      void load();
    } catch (exception: any) {
      setError(readableError(exception, 'Unable to initiate buyer collection.'));
    }
  };

  const payoutAction = async (sale: any, action: 'approve' | 'reconcile') => {
    try {
      if (action === 'approve') await salesApi.approvePayouts(sale.id);
      else await salesApi.reconcilePayouts(sale.id);
      setConfirmation({
        buyer:
          action === 'approve'
            ? `Payouts for ${sale.invoiceNumber} are now approved and queued with ClickPesa.`
            : `Payout statuses for ${sale.invoiceNumber} have been reconciled.`,
        open: true,
      });
      void load();
    } catch (exception: any) {
      setError(readableError(exception, 'Unable to process payout action.'));
    }
  };

  const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.totalRevenue || 0), 0);
  const pendingSales = sales.filter((sale) => !sale.paymentReceived).length;

  return (
    <div className="page-shell">
      {!embedded && (
        <div className="page-heading">
          <div>
            <div className="page-kicker">Commercial</div>
            <h1 className="page-title">Sales &amp; Payments</h1>
            <p className="page-subtitle">
              Confirmed sales: collect the buyer’s payment, then approve farmer payouts. Revenue is shared by intake weight.
            </p>
          </div>
          <Link href="/dashboard/traceability" className="btn-secondary" style={{ textDecoration: 'none' }}>
            Traceability
          </Link>
        </div>
      )}
      {error && <div className="alert-box alert-danger">{error}</div>}
      <div className="alert-box">
        Sales are created from <Link href="/dashboard/sale-orders" style={{ fontWeight: 600, textDecoration: 'underline' }}>Sale Orders</Link>: a salesperson reserves the stock,
        and the warehouse keeper confirms it. They appear here once confirmed, ready for payment collection and farmer payouts.
      </div>
      <div className="metric-grid">
        {[
          { label: 'Sales', value: sales.length, color: 'var(--blue-500)' },
          {
            label: 'Total revenue',
            value: `TZS ${Math.round(totalRevenue).toLocaleString()}`,
            color: 'var(--accent)',
          },
          { label: 'Pending payment', value: pendingSales, color: 'var(--gold-400)' },
        ].map((metric) => (
          <MetricTile key={metric.label} label={metric.label} value={metric.value} tone={toneFromColor(metric.color)} />
        ))}
      </div>
      <div className="table-panel">
        <div className="section-toolbar">
          <strong>Sales Register</strong>
          <span className="muted">{sales.length} invoices</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Order</th>
                <th>Buyer</th>
                <th>Lot</th>
                <th>Revenue</th>
                <th>Farmers</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <Link
                      href={`/dashboard/traceability?q=${encodeURIComponent(sale.invoiceNumber)}`}
                      style={{
                        fontFamily: 'monospace',
                        color: 'var(--blue-300)',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      {sale.invoiceNumber}
                    </Link>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {sale.saleOrder?.reference ? (
                      <Link href={`/dashboard/warehouse`} title="Look this reference up at the Warehouse counter" style={{ color: 'inherit', textDecoration: 'none' }}>
                        {sale.saleOrder.reference}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--neutral-500)', fontWeight: 400 }} title="Recorded before sale orders">—</span>
                    )}
                  </td>
                  <td>{sale.buyer.name}</td>
                  <td>
                    <Link
                      href={`/dashboard/traceability?q=${encodeURIComponent(sale.lot.lotNumber)}`}
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      {sale.lot.lotNumber}
                    </Link>
                  </td>
                  <td>TZS {Math.round(sale.totalRevenue).toLocaleString()}</td>
                  <td>{sale._count.apportionments}</td>
                  <td>
                    <span
                      className={`badge ${
                        sale.paymentReceived
                          ? 'badge-green'
                          : sale.buyerOrderReference
                            ? 'badge-blue'
                            : 'badge-gold'
                      }`}
                    >
                      {sale.paymentReceived
                        ? 'Settled'
                        : sale.buyerOrderReference
                          ? 'Collection pending'
                          : 'Awaiting buyer payment'}
                    </span>
                  </td>
                  <td>
                    {!sale.paymentReceived && (
                      <>
                        <button className="btn-secondary" onClick={() => void collect(sale)}>
                          Collect
                        </button>{' '}
                        <button
                          className="btn-secondary"
                          onClick={async () => {
                            await salesApi.settle(sale.id);
                            void load();
                          }}
                        >
                          Manual settle
                        </button>
                      </>
                    )}
                    {sale.paymentReceived && (
                      <>
                        <button
                          className="btn-secondary"
                          onClick={() => void payoutAction(sale, 'approve')}
                        >
                          Approve payouts
                        </button>{' '}
                        <button
                          className="btn-secondary"
                          onClick={() => void payoutAction(sale, 'reconcile')}
                        >
                          Reconcile
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {confirmation?.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,24,39,.45)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 50,
          }}
        >
          <div className="glass-card" style={{ maxWidth: 420, width: '100%', padding: 24 }}>
            <h2 id="collection-title" style={{ marginTop: 0 }}>
              Operation submitted
            </h2>
            <p style={{ color: 'var(--neutral-600)', lineHeight: 1.5 }}>{confirmation.buyer}</p>
            <button
              onClick={() => setConfirmation(null)}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 0,
                borderRadius: 8,
                padding: '10px 16px',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesPage() {
  return <SalesView />;
}
