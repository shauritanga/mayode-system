'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { irrigationApi } from '@/lib/api';
import { BASE, Empty, IrrigationProvider, LoadError, PageHeader, useApi, useCan, type SchemeLite } from './ui';
import Overview from './Overview';
import SchemeForm from './SchemeForm';
import { CanalList, CanalDetail } from './Canals';
import { BlockList, BlockDetail } from './Blocks';
import { HectareRegister } from './Hectares';
import { HectareDetail } from './HectareDetail';
import AllocationOverview from './AllocationOverview';
import AllocateWorkspace from './AllocateWorkspace';
import { FarmerSearch, FarmerDetail } from './FarmerDetail';
import Transfers from './Transfers';
import LeadershipOverview from './LeadershipOverview';
import Assignments from './Assignments';
import LeadershipHistory from './LeadershipHistory';

type Resource = 'irrigation' | 'irrigation_allocations' | 'irrigation_leadership';

/** Where each old list page lives now. Detail pages (one canal, block, hectare or scheme) stay here. */
function movedTo(slug: string[]): string | null {
  const [area, page, id] = slug;
  const to = (path: string, tab?: string) => ({ path, tab });
  let t: { path: string; tab?: string } | null = null;
  if (!area) t = to('/dashboard/scheme-structure', 'overview');
  else if (area === 'structure') {
    if (page === 'scheme' && !id) t = to('/dashboard/scheme-structure', 'overview');
    else if (!id && (page === 'canals' || page === 'blocks' || page === 'hectares')) t = to('/dashboard/scheme-structure', page);
  } else if (area === 'allocation') {
    if (page === 'farmers' && id) return `/dashboard/farmers/${id}`;
    if (page === 'overview' || page === 'allocate' || page === 'transfers') t = to('/dashboard/plot-allocation', page);
    else if (page === 'farmers') t = to('/dashboard/plot-allocation', 'farmers');
  } else if (area === 'leadership' && (page === 'overview' || page === 'assignments' || page === 'history')) {
    t = to('/dashboard/leadership', page);
  }
  if (!t) return null;
  // Keep the old link's own query (a chosen block or hectare, "add") and say which tab to open.
  const query = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  if (t.tab) query.set('tab', t.tab);
  const qs = query.toString();
  return qs ? `${t.path}?${qs}` : t.path;
}

const AREA_RESOURCE: Record<string, Resource> = { structure: 'irrigation', allocation: 'irrigation_allocations', leadership: 'irrigation_leadership' };

export default function IrrigationPage() {
  const params = useParams<{ slug?: string[] }>();
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

  const context = useMemo(() => ({
    schemes: schemes.data ?? [], schemeId, setSchemeId, loading: schemes.loading, reloadSchemes: schemes.reload, can,
  }), [schemes.data, schemes.loading, schemes.reload, schemeId, setSchemeId, can]);

  const target = movedTo(slug);
  useEffect(() => { if (target) router.replace(target); }, [target, router]);

  const resource = area ? AREA_RESOURCE[area] : 'irrigation';
  const allowed = !!resource && can(resource, 'VIEW');

  const body = () => {
    if (target) return null;
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
        <div style={{ minWidth: 0 }}>{body()}</div>
      </main>
    </IrrigationProvider>
  );
}
