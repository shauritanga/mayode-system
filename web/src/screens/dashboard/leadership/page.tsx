'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Empty, IrrigationProvider, LoadError, PageHeader, Tabs } from '../irrigation/ui';
import { useSchemeScope } from '../irrigation/useSchemeScope';
import LeadershipOverview from '../irrigation/LeadershipOverview';
import Assignments from '../irrigation/Assignments';
import LeadershipHistory from '../irrigation/LeadershipHistory';

type Tab = 'overview' | 'assignments' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'assignments', label: 'Leader assignments' }, { id: 'history', label: 'History' },
];
const SUBTITLES: Record<Tab, string> = {
  overview: 'Canal and block leader coverage and upcoming appointment expirations.',
  assignments: 'One active leader per canal and per block. Replacing a leader keeps the previous appointment in the history.',
  history: 'Current and past appointments, who replaced whom, and who recorded each change.',
};

/** Who leads each canal and block, how to appoint them, and the record of past appointments. */
export default function LeadershipPage() {
  const { can, schemes, list, schemeId, setSchemeId, context, showAmcos } = useSchemeScope();
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === requested) ? (requested as Tab) : 'overview');

  if (!can('irrigation_leadership', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the leadership permission." />;
  return (
    <IrrigationProvider value={context}>
      <main>
        <PageHeader title="Leadership & Committees" subtitle={SUBTITLES[tab]} />
        <LoadError message={schemes.error} onRetry={schemes.reload} />
        <div className="ss-toolbar">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="ss-toolbar-actions">
            {list.length > 0 && (
              <label className="ss-scheme-picker">
                <span className="muted">Scheme</span>
                <select className="input-field" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.name}{showAmcos && s.mamcos ? ` · ${s.mamcos.name}` : ''}</option>)}
                </select>
              </label>
            )}
            {can('irrigation_leadership', 'CREATE') && schemeId && tab === 'overview' && <button type="button" className="btn-primary" onClick={() => setTab('assignments')}>Appoint a leader</button>}
          </div>
        </div>
        {tab === 'overview' && <LeadershipOverview bare />}
        {tab === 'assignments' && <Assignments bare />}
        {tab === 'history' && <LeadershipHistory bare />}
      </main>
    </IrrigationProvider>
  );
}
