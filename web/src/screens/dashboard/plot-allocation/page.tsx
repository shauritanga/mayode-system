'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Empty, IrrigationProvider, LoadError, PageHeader, Tabs } from '../irrigation/ui';
import { useSchemeScope } from '../irrigation/useSchemeScope';
import AllocationOverview from '../irrigation/AllocationOverview';
import AllocateWorkspace from '../irrigation/AllocateWorkspace';
import Transfers from '../irrigation/Transfers';
import FarmersList from '../farmers/page';

type Tab = 'farmers' | 'overview' | 'allocate' | 'transfers';
const TABS: { id: Tab; label: string }[] = [
  { id: 'farmers', label: 'Farmers' }, { id: 'overview', label: 'Allocation overview' },
  { id: 'allocate', label: 'Allocate hectare' }, { id: 'transfers', label: 'Transfer history' },
];
const SUBTITLES: Record<Tab, string> = {
  overview: 'How much of the scheme is allocated to members, by canal and block.',
  allocate: 'Choose a canal and block, pick a free hectare, then pick the member who will farm it.',
  farmers: 'Everyone registered in your AMCOS. Open a farmer to see their hectares and the farms they guide.',
  transfers: 'Hectare transfers between members. Nothing is overwritten; each transfer closes one allocation and opens another.',
};

/** Members and their hectares on one page: who holds what, allocating, looking a farmer up, and transfers. */
export default function PlotAllocationPage() {
  const { can, schemes, list, schemeId, setSchemeId, context, showAmcos } = useSchemeScope();
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === requested) ? (requested as Tab) : 'farmers');
  const [adding, setAdding] = useState(false);

  if (!can('irrigation_allocations', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the allocation permission." />;
  const canCreate = can('irrigation_allocations', 'CREATE') && !!schemeId;
  return (
    <IrrigationProvider value={context}>
      <main>
        <PageHeader title="Farmers & Plot Allocation" subtitle={SUBTITLES[tab]} />
        <LoadError message={schemes.error} onRetry={schemes.reload} />
        <div className="ss-toolbar">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="ss-toolbar-actions">
            {list.length > 0 && tab !== 'farmers' && (
              <label className="ss-scheme-picker">
                <span className="muted">Scheme</span>
                <select className="input-field" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.name}{showAmcos && s.mamcos ? ` · ${s.mamcos.name}` : ''}</option>)}
                </select>
              </label>
            )}
            {canCreate && tab === 'overview' && <button type="button" className="btn-primary" onClick={() => setTab('allocate')}>Allocate hectare</button>}
            {canCreate && tab === 'transfers' && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>New transfer</button>}
          </div>
        </div>
        {tab === 'overview' && <AllocationOverview bare />}
        {tab === 'allocate' && <AllocateWorkspace bare />}
        {tab === 'farmers' && <FarmersList embedded />}
        {tab === 'transfers' && <Transfers bare adding={adding} onAddDone={() => setAdding(false)} />}
      </main>
    </IrrigationProvider>
  );
}
