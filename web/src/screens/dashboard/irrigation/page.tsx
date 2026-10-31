'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import { BASE, Empty, IrrigationProvider, LoadError, PageHeader, useApi, useCan, type SchemeLite } from './ui';
import Overview from './Overview';
import SchemeForm from './SchemeForm';
import { CanalList, CanalDetail } from './Canals';
import { BlockList, BlockDetail } from './Blocks';
import { HectareRegister, HectareDetail } from './Hectares';
import AllocationOverview from './AllocationOverview';
import AllocateWorkspace from './AllocateWorkspace';
import { FarmerSearch, FarmerDetail } from './FarmerDetail';
import Transfers from './Transfers';
import LeadershipOverview from './LeadershipOverview';
import Assignments from './Assignments';
import LeadershipHistory from './LeadershipHistory';

type Resource = 'irrigation' | 'irrigation_allocations' | 'irrigation_leadership';

const MENU: { heading: string; resource: Resource; items: { label: string; href: string }[] }[] = [
  {
    heading: 'Scheme Structure', resource: 'irrigation',
    items: [
      { label: 'Scheme Overview', href: BASE },
      { label: 'Scheme Registration', href: `${BASE}/structure/scheme` },
      { label: 'Canal List', href: `${BASE}/structure/canals` },
      { label: 'Block List', href: `${BASE}/structure/blocks` },
      { label: 'Hectare Register', href: `${BASE}/structure/hectares` },
    ],
  },
  {
    heading: 'Farmers & Plot Allocation', resource: 'irrigation_allocations',
    items: [
      { label: 'Allocation Overview', href: `${BASE}/allocation/overview` },
      { label: 'Hectare Allocation', href: `${BASE}/allocation/allocate` },
      { label: 'Farmer / Hectare Details', href: `${BASE}/allocation/farmers` },
      { label: 'Transfer History', href: `${BASE}/allocation/transfers` },
    ],
  },
  {
    heading: 'Leadership & Committees', resource: 'irrigation_leadership',
    items: [
      { label: 'Leadership Overview', href: `${BASE}/leadership/overview` },
      { label: 'Leader Assignments', href: `${BASE}/leadership/assignments` },
      { label: 'Leadership History', href: `${BASE}/leadership/history` },
    ],
  },
];

const AREA_RESOURCE: Record<string, Resource> = { structure: 'irrigation', allocation: 'irrigation_allocations', leadership: 'irrigation_leadership' };

export default function IrrigationPage() {
  const params = useParams<{ slug?: string[] }>();
  const pathname = usePathname();
  const router = useRouter();
  const can = useCan();
  const slug = params?.slug ?? [];
  const [area, page, id] = slug;

  const schemes = useApi<SchemeLite[]>(() => irrigationApi.schemes(), []);
  const [chosenId, setChosenId] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('irrigation.schemeId') ?? '' : ''));
  // The remembered scheme if it is still visible to this user, otherwise the first one.
  const schemeId = schemes.data?.find((x) => x.id === chosenId)?.id ?? schemes.data?.[0]?.id ?? '';
  const setSchemeId = useCallback((value: string) => {
    setChosenId(value);
    if (typeof window !== 'undefined') localStorage.setItem('irrigation.schemeId', value);
  }, []);

  const menu = useMemo(() => MENU.filter((section) => can(section.resource, 'VIEW')), [can]);

  // Land on the first section the role may use (e.g. a leadership-only role has no scheme overview).
  useEffect(() => {
    if (!area && !can('irrigation', 'VIEW') && menu[0]) router.replace(menu[0].items[0].href);
  }, [area, can, menu, router]);

  const context = useMemo(() => ({
    schemes: schemes.data ?? [], schemeId, setSchemeId, loading: schemes.loading, reloadSchemes: schemes.reload, can,
  }), [schemes.data, schemes.loading, schemes.reload, schemeId, setSchemeId, can]);

  const resource = area ? AREA_RESOURCE[area] : 'irrigation';
  const allowed = !!resource && can(resource, 'VIEW');

  const body = () => {
    if (!allowed) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the matching irrigation permission." />;
    if (schemes.error) return <LoadError message={schemes.error} onRetry={schemes.reload} />;
    if (!area) return <Overview />;
    if (area === 'structure') {
      if (page === 'scheme') return <SchemeForm schemeId={id} />;
      if (page === 'canals') return id ? <CanalDetail id={id} /> : <CanalList />;
      if (page === 'blocks') return id ? <BlockDetail id={id} /> : <BlockList />;
      if (page === 'hectares') return id ? <HectareDetail id={id} /> : <HectareRegister />;
    }
    if (area === 'allocation') {
      if (page === 'overview') return <AllocationOverview />;
      if (page === 'allocate') return <AllocateWorkspace />;
      if (page === 'farmers') return id ? <FarmerDetail farmerId={id} /> : <FarmerSearch />;
      if (page === 'transfers') return <Transfers />;
    }
    if (area === 'leadership') {
      if (page === 'overview') return <LeadershipOverview />;
      if (page === 'assignments') return <Assignments />;
      if (page === 'history') return <LeadershipHistory />;
    }
    return (
      <>
        <PageHeader title="Page not found" />
        <Empty title="That irrigation page does not exist" action={<Link className="btn-primary" href={BASE}>Back to the overview</Link>} />
      </>
    );
  };

  return (
    <IrrigationProvider value={context}>
      <main>
        <div className="accounting-layout">
          <aside className="accounting-subsidebar" aria-label="Scheme Management sections">
            <div className="accounting-subsidebar-heading">Scheme Management</div>
            {context.schemes.length > 1 && (
              <label className="form-label" style={{ padding: '0 6px 10px' }}>Scheme
                <select className="input-field" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
                  {context.schemes.map((s) => <option key={s.id} value={s.id}>{s.name}{s.mamcos ? ` · ${s.mamcos.name}` : ''}</option>)}
                </select>
              </label>
            )}
            {menu.map((section) => (
              <div key={section.heading} className="accounting-nav-group">
                <div className="muted" style={{ padding: '10px 9px 4px', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{section.heading}</div>
                <div className="accounting-nav-children" style={{ paddingLeft: 4 }}>
                  {section.items.map((item) => {
                    const active = item.href === BASE ? pathname === BASE : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return <Link key={item.href} href={item.href} className={`accounting-nav-child ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>{item.label}</Link>;
                  })}
                </div>
              </div>
            ))}
          </aside>
          <div style={{ minWidth: 0 }}>{body()}</div>
        </div>
      </main>
    </IrrigationProvider>
  );
}
