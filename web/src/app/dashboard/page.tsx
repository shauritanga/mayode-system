'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  UserGroupIcon,
  Plant01Icon,
  CheckmarkBadge02Icon,
  Store01Icon,
  MapsIcon,
  WheatIcon,
  MoneyBag01Icon,
  ArrowRight01Icon,
  UserAdd01Icon,
  Package01Icon,
  HandshakeIcon,
  ChartBarLineIcon,
} from '@hugeicons/core-free-icons';
import { mamcosApi, marketplaceApi, reportsApi, workspaceApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import AdminOverviewDashboard from '@/components/role-dashboards/AdminOverviewDashboard';
import { CountUpValue } from '@/components/CountUpValue';

// Secretary day-to-day ops: members, farms, seasons, memberships, queues.
const SECRETARY_ACTIONS: { label: string; href: string; icon: IconSvgElement; color: string }[] = [
  { label: 'Farmers', href: '/dashboard/farmers', icon: UserGroupIcon, color: 'var(--green-400)' },
  { label: 'Farms & boundaries', href: '/dashboard/farms?filter=pending-boundary', icon: Plant01Icon, color: 'var(--gold-400)' },
  { label: 'Renter assignments', href: '/dashboard/leases', icon: HandshakeIcon, color: 'var(--blue-400)' },
  { label: 'Memberships', href: '/dashboard/memberships', icon: CheckmarkBadge02Icon, color: 'var(--purple-400)' },
  { label: 'Farm registry', href: '/dashboard/farm-registry', icon: Plant01Icon, color: 'var(--green-400)' },
  { label: 'Manage staff', href: '/dashboard/staff', icon: UserAdd01Icon, color: 'var(--gold-400)' },
  { label: 'Receive inventory', href: '/dashboard/inventory', icon: Package01Icon, color: 'var(--blue-400)' },
  { label: 'Traceability', href: '/dashboard/traceability', icon: MapsIcon, color: 'var(--blue-400)' },
  { label: 'AI Insights', href: '/dashboard/ai', icon: WheatIcon, color: 'var(--green-400)' },
  { label: 'Reports', href: '/dashboard/reports', icon: ChartBarLineIcon, color: 'var(--accent)' },
];

interface StatDef {
  label: string;
  value: string | number;
  sub?: string;
  icon: IconSvgElement;
  color: string;
}

function StatCard({ stat, index }: { stat: StatDef; index: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="stat-card"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={reduce ? undefined : { y: -3 }}
      style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
    >
      <div style={{
        width: '46px', height: '46px', borderRadius: '12px',
        background: `color-mix(in srgb, ${stat.color} 12%, transparent)`,
        color: stat.color,
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
      }}>
        <HugeiconsIcon icon={stat.icon} size={22} strokeWidth={1.8} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-1)', fontFamily: 'var(--font-outfit), sans-serif', lineHeight: 1.2, letterSpacing: '-0.02em', fontFeatureSettings: "'tnum'" }}>
          <CountUpValue value={stat.value} />
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-2)', fontWeight: 500 }}>{stat.label}</div>
        {stat.sub && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px', fontWeight: 500 }}>{stat.sub}</div>}
      </div>
    </motion.div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }} aria-hidden="true">
      <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton skeleton-title" style={{ width: '45%' }} />
        <div className="skeleton skeleton-text" style={{ width: '70%', marginTop: 8 }} />
      </div>
    </div>
  );
}

// AMCOS Secretary landing: a lighter, cooperative-scoped view (own farmers/farms/listings) —
// deliberately distinct from the platform-wide admin dashboard below, since a secretary manages
// one cooperative, not the whole system.
function SecretaryDashboard() {
  const [stats, setStats] = useState({ farmers: 0, farms: 0, mamcos: 0, listings: 0 });
  const [mamcosName, setMamcosName] = useState('');
  const [prices, setPrices] = useState<{ commodity: string; price: number; market: string; recordedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ totalHectares: 0, averageYieldPerHectare: 0, totalRevenue: 0 });
  const [workQueue, setWorkQueue] = useState<any[]>([]);
  const [queueMetrics, setQueueMetrics] = useState<Record<string, number>>({});
  const reduce = useReducedMotion();

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [dashRes, listingsRes, pricesRes, workspaceRes] = await Promise.allSettled([
          mamcosApi.dashboard(),
          marketplaceApi.getLandListings(),
          marketplaceApi.getMarketPrices(),
          workspaceApi.context(),
        ]);
        const secretary = dashRes.status === 'fulfilled' ? dashRes.value.data : null;
        const m = secretary?.mamcos;
        setMamcosName(m?.name || '');
        setStats({
          farmers: m?.farmers?.length ?? 0,
          farms: m?.farms?.length ?? 0,
          mamcos: m?.farms?.filter((f: { isVerified?: boolean }) => f.isVerified)?.length ?? 0,
          listings: listingsRes.status === 'fulfilled' ? listingsRes.value.data?.length || 0 : 0,
        });
        if (pricesRes.status === 'fulfilled') setPrices(pricesRes.value.data?.slice(0, 5) || []);
        if (workspaceRes.status === 'fulfilled') {
          setWorkQueue(workspaceRes.value.data?.workQueue ?? []);
          setQueueMetrics(workspaceRes.value.data?.metrics ?? {});
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  useEffect(() => {
    reportsApi.kpis().then((result) => setKpis(result.data)).catch(console.error);
  }, []);

  const statCards: StatDef[] = [
    { label: 'Your Farmers', value: stats.farmers, sub: 'Active members', icon: UserGroupIcon, color: 'var(--green-400)' },
    { label: 'Your Farms', value: stats.farms, sub: 'GPS mapped', icon: Plant01Icon, color: 'var(--green-400)' },
    { label: 'Verified Farms', value: stats.mamcos, sub: 'Boundary confirmed', icon: CheckmarkBadge02Icon, color: 'var(--gold-400)' },
    { label: 'Boundary queue', value: queueMetrics.pendingBoundaryApprovals ?? 0, sub: 'Mapped, awaiting approval', icon: MapsIcon, color: 'var(--gold-400)' },
    { label: 'Renter queue', value: (queueMetrics.pendingRenterAcceptance ?? 0) + (queueMetrics.pendingFieldVerification ?? 0), sub: 'Assignments in progress', icon: HandshakeIcon, color: 'var(--blue-400)' },
    { label: 'M-LAX Listings', value: stats.listings, sub: 'Land & tractor ads', icon: Store01Icon, color: 'var(--blue-400)' },
    { label: 'Cooperative Hectares', value: kpis.totalHectares.toLocaleString(), sub: 'Registered farm area', icon: MapsIcon, color: 'var(--purple-400)' },
    { label: 'Average Yield / ha', value: `${Math.round(kpis.averageYieldPerHectare).toLocaleString()} kg`, sub: 'Harvested crop cycles', icon: WheatIcon, color: 'var(--green-400)' },
    { label: 'Cooperative Revenue', value: `TZS ${Math.round(kpis.totalRevenue).toLocaleString()}`, sub: 'Recorded sales revenue', icon: MoneyBag01Icon, color: 'var(--gold-400)' },
  ];

  return (
    <div className="page-shell">
      <div>
        <div className="page-kicker" style={{ marginBottom: 4 }}>MAYODE GROUP Cooperative</div>
        <h1 className="page-title" style={{ fontSize: '1.7rem' }}>
          {mamcosName || 'Your AMCOS'}
        </h1>
        <p className="page-subtitle">
          Members, farms, boundary approvals, renter assignments, and memberships — in one place.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map((stat, i) => <StatCard key={stat.label} stat={stat} index={i} />)
        }
      </div>

      {workQueue.length > 0 && (
        <motion.div
          className="insight-panel"
          style={{ marginTop: 8 }}
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="insight-panel-head">
            <div>
              <h2>Work queues</h2>
              <p>Boundary approvals and renter assignments that need your attention.</p>
            </div>
            <span className="badge badge-gold">{workQueue.length} open</span>
          </div>
          <div className="role-list">
            {workQueue.slice(0, 8).map((item: any) => (
              <Link key={`${item.kind}-${item.id}`} href={item.href || '/dashboard/farms'} className="quick-action">
                <span className="quick-action-icon" style={{ color: 'var(--gold-400)', background: 'color-mix(in srgb, var(--gold-400) 12%, transparent)' }}>
                  <HugeiconsIcon icon={item.kind === 'BOUNDARY_APPROVAL' ? Plant01Icon : HandshakeIcon} size={17} strokeWidth={1.8} />
                </span>
                <span className="quick-action-label">{item.label || item.farm?.farmCode || 'Open item'}</span>
                <span className="quick-action-arrow">
                  <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={2} />
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      <div className="dash-two-col">
        <motion.div
          className="insight-panel"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="insight-panel-head">
            <div>
              <h2>Latest Market Prices</h2>
              <p>Most recent recordings, TZS per kg.</p>
            </div>
            <span className="badge badge-green">Live</span>
          </div>
          {prices.length === 0 ? (
            <div className="chart-empty-state">
              {loading ? 'Loading prices…' : 'No market prices recorded yet.'}
            </div>
          ) : (
            <div className="role-list">
              {prices.map((p, idx) => (
                <motion.div
                  key={`${p.commodity}-${idx}`}
                  className="role-list-item"
                  initial={reduce ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.2 + idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-1)' }}>{p.commodity}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>{p.market || 'Market unknown'}</div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-hover)', fontFeatureSettings: "'tnum'" }}>
                    <CountUpValue value={Number(p.price)} /> <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 500 }}>TZS</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          className="insight-panel"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="insight-panel-head">
            <div>
              <h2>Quick Actions</h2>
              <p>Common cooperative tasks.</p>
            </div>
          </div>
          <div className="role-list">
            {SECRETARY_ACTIONS.map((action, idx) => (
              <motion.div
                key={action.href}
                initial={reduce ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.26 + idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link href={action.href} className="quick-action">
                  <span className="quick-action-icon" style={{ color: action.color, background: `color-mix(in srgb, ${action.color} 12%, transparent)` }}>
                    <HugeiconsIcon icon={action.icon} size={17} strokeWidth={1.8} />
                  </span>
                  <span className="quick-action-label">{action.label}</span>
                  <span className="quick-action-arrow">
                    <HugeiconsIcon icon={ArrowRight01Icon} size={15} strokeWidth={2} />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);

  useEffect(() => {
    const roleLanding: Record<string, string> = {
      FARMER: '/dashboard/farmer',
      FIELD_OFFICER: '/dashboard/field-officer',
      AUDITOR: '/dashboard/auditor',
      FINANCIAL_PROVIDER: '/dashboard/financial-provider',
      BUYER: '/dashboard/buyer',
    };
    if (role && roleLanding[role]) router.replace(roleLanding[role]);
  }, [role, router]);

  if (role === 'MAMCOS_SECRETARY') return <SecretaryDashboard />;
  if (role === 'SUPER_ADMIN' || role === 'ADMIN') return <AdminOverviewDashboard />;
  return null;
}
