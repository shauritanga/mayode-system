'use client';
import { useState } from 'react';
import { motion } from 'motion/react';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import BuyersPage from '../buyers/page';
import BuyerOrdersPage from '../buyer-orders/page';
import OverviewPanel from './OverviewPanel';
import AgreementsPanel from './AgreementsPanel';
import DeliveriesPanel from './DeliveriesPanel';
import FarmerSalesPanel from './FarmerSalesPanel';
import PricesPanel from './PricesPanel';

const TABS = [
  { id: 'overview', label: 'Overview', resource: 'sales' },
  { id: 'buyers', label: 'Buyers', resource: 'buyers' },
  { id: 'orders', label: 'Buyer orders', resource: 'buyer_orders' },
  { id: 'agreements', label: 'Purchase agreements', resource: 'buyer_orders' },
  { id: 'deliveries', label: 'Rice deliveries', resource: 'sales' },
  { id: 'farmer-sales', label: 'Farmer sales', resource: 'sales' },
  { id: 'prices', label: 'Market prices', resource: 'marketplace' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function MarketPage() {
  const user = useAuthStore((s) => s.user);
  const tabs = TABS.filter((t) => hasPermission(user, t.resource, 'VIEW'));
  const [tab, setTab] = useState<TabId>('overview');
  const active = tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? 'buyers');

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">Market and Buyer Management</div>
          <h1 className="page-title">Market &amp; Buyers</h1>
          <p className="page-subtitle">Buyers, orders, purchase agreements, rice deliveries, farmer sales, payments and market prices in one place.</p>
        </div>
      </div>

      <div className="seg-control" style={{ marginBottom: 16, flexWrap: 'wrap' }} role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id} className={`seg-btn ${active === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {active === t.id && <motion.span layoutId="market-pill" className="seg-pill" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
            {t.label}
          </button>
        ))}
      </div>

      {active === 'overview' && <OverviewPanel />}
      {active === 'buyers' && <BuyersPage embedded />}
      {active === 'orders' && <BuyerOrdersPage embedded />}
      {active === 'agreements' && <AgreementsPanel />}
      {active === 'deliveries' && <DeliveriesPanel />}
      {active === 'farmer-sales' && <FarmerSalesPanel />}
      {active === 'prices' && <PricesPanel />}
    </div>
  );
}
