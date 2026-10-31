'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AlertToast, { type ToastAlert } from '@/components/AlertToast';
import { irrigationApi } from '@/lib/api';
import { Empty, IrrigationProvider, LoadError, Notice, PageHeader, Tabs } from '../irrigation/ui';
import { useSchemeScope } from '../irrigation/useSchemeScope';
import AddSchemeModal from './AddSchemeModal';
import Overview from '../irrigation/Overview';
import { CanalList } from '../irrigation/Canals';
import { BlockList } from '../irrigation/Blocks';
import { HectareRegister } from '../irrigation/Hectares';

type Tab = 'overview' | 'canals' | 'blocks' | 'hectares';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'canals', label: 'Canal list' }, { id: 'blocks', label: 'Block list' }, { id: 'hectares', label: 'Hectare register' },
];

const SUBTITLES: Record<Tab, string> = {
  overview: 'The scheme and where its allocation stands.',
  canals: "The scheme's canals with their block counts, area and leaders.",
  blocks: 'Every block across the canals, with its hectare units and leadership.',
  hectares: 'Every hectare unit, who holds it and its guardian.',
};
const ADD_LABEL: Partial<Record<Tab, string>> = { overview: 'Add scheme', canals: 'Add canal', blocks: 'Add block' };
const ADD_KIND: Record<Tab, '' | 'scheme' | 'canal' | 'block'> = { overview: 'scheme', canals: 'canal', blocks: 'block', hectares: '' };

/** The scheme's structure on one page: overview, then canals, blocks and hectares as tables. */
export default function SchemeStructurePage() {
  const { can, schemes, list, schemeId, setSchemeId, context, showAmcos } = useSchemeScope();
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === requested) ? (requested as Tab) : 'overview');
  const [adding, setAdding] = useState<'' | 'scheme' | 'canal' | 'block'>('');
  const [notice, setNotice] = useState('');
  const [alerts, setAlerts] = useState<ToastAlert[]>([]);
  // Once per visit to this menu: what still needs setting up, as a closable box at the bottom right.
  const [alertsFor, setAlertsFor] = useState('');
  useEffect(() => {
    if (!schemeId || alertsFor === schemeId) return;
    let live = true;
    irrigationApi.overview({ schemeId }).then((res) => {
      if (!live) return;
      setAlertsFor(schemeId);
      const list: ToastAlert[] = res.data?.alerts ?? [];
      setAlerts([...list].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1)));
    }).catch(() => {});
    return () => { live = false; };
  }, [schemeId, alertsFor]);

  if (!can('irrigation', 'VIEW')) return <Empty title="You do not have access to this section" hint="Ask an administrator to grant the irrigation permission." />;
  return (
    <IrrigationProvider value={context}>
      <main>
        <PageHeader title="Scheme Structure" subtitle={SUBTITLES[tab]} />
        <LoadError message={schemes.error} onRetry={schemes.reload} />
        {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
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
            {can('irrigation', 'CREATE') && (schemeId || tab === 'overview') && ADD_LABEL[tab] && (
              <button type="button" className="btn-primary" onClick={() => setAdding(ADD_KIND[tab])}>{ADD_LABEL[tab]}</button>
            )}
          </div>
        </div>
        {tab === 'overview' && <Overview bare />}
        {tab === 'canals' && <CanalList adding={adding === 'canal'} onAddDone={() => setAdding('')} />}
        {tab === 'blocks' && <BlockList adding={adding === 'block'} onAddDone={() => setAdding('')} />}
        {tab === 'hectares' && <HectareRegister />}
      </main>
      <AlertToast alerts={alerts} title="Setup alerts" onClose={() => setAlerts([])} />
      {adding === 'scheme' && <AddSchemeModal onClose={() => setAdding('')} onSaved={(created) => { setAdding(''); schemes.reload(); setSchemeId(created.id); setNotice(`${created.name} added. Now add its canals.`); setTab('canals'); }} />}
    </IrrigationProvider>
  );
}
