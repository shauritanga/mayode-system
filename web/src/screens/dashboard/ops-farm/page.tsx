'use client';
import { useState } from 'react';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { kg, label, tzs, dateTime } from '@/lib/ops';
import { ErrorNote, Field, Loading, PageHead, Tabs, Toolbar, useLoad } from '@/components/ops/ui';
import { ChartCard, DonutBreakdown, GroupedBarChart } from '@/components/role-dashboards/Charts';
import { MetricTile } from '@/components/role-dashboards/DashboardPrimitives';
import FarmsPanel from '@/components/ops/FarmsPanel';
import TasksPanel from '@/components/ops/TasksPanel';
import { AttendancePanel, HarvestsPanel, InputsPanel } from '@/components/ops/FarmRecordsPanels';
import ReportsRunner from '@/components/ops/ReportsRunner';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = 'overview' | 'farms' | 'tasks' | 'attendance' | 'inputs' | 'harvests' | 'reports';

export default function OpsFarmPage() {
  const user = useAuthStore((s) => s.user);
  const can = (r: string, a: 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' = 'VIEW') => hasPermission(user, r, a);
  const tabs = ([
    ['overview', 'Overview', can('ops_reports')], ['farms', 'Farms and plots', can('ops_farm_tasks')], ['tasks', 'Tasks and inspections', can('ops_farm_tasks')], ['attendance', 'Attendance', can('ops_farm_tasks')],
    ['inputs', 'Inputs', can('ops_farm_inputs')], ['harvests', 'Harvests', can('ops_harvest')], ['reports', 'Reports', can('ops_reports')],
  ] as [Tab, string, boolean][]).filter((t) => t[2]).map(([id, label]) => ({ id, label }));
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'overview');
  const goto = (t: Tab) => { if (tabs.some((x) => x.id === t)) setTab(t); };
  return (
    <div>
      <PageHead kicker="Mayode Operations" title="Mayode Farms" subtitle="Plots and seasons, work assigned to the team, GPS-checked attendance, inputs used and the harvest that reaches the warehouse." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview goto={goto} />}
      {tab === 'farms' && <FarmsPanel canCreate={can('ops_farm_tasks', 'CREATE')} canEdit={can('ops_farm_tasks', 'EDIT')} />}
      {tab === 'tasks' && <TasksPanel canCreate={can('ops_farm_tasks', 'CREATE')} canReview={can('ops_farm_review', 'EDIT')} canCancel={can('ops_farm_tasks', 'EDIT')} />}
      {tab === 'attendance' && <AttendancePanel />}
      {tab === 'inputs' && <InputsPanel canCreate={can('ops_farm_inputs', 'CREATE')} canEdit={can('ops_farm_inputs', 'EDIT')} />}
      {tab === 'harvests' && <HarvestsPanel canCreate={can('ops_harvest', 'CREATE')} canEdit={can('ops_harvest', 'EDIT')} />}
      {tab === 'reports' && <ReportsRunner groups={['Mayode Farms']} />}
      {!tabs.length && <ErrorNote message="Your role does not include Mayode Farms." />}
    </div>
  );
}

const START_KEY = 'mayode.farms.startHereDismissed';
const readDismissed = () => { try { return localStorage.getItem(START_KEY) === '1'; } catch { return false; } };
const num = (n?: number | null) => (n || 0).toLocaleString();

const LinkBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--green-600, var(--accent))', fontWeight: 600, cursor: 'pointer' }}>{children}</button>
);

function Overview({ goto }: { goto: (t: Tab) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dismissed, setDismissed] = useState(readDismissed);
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(START_KEY, '1'); } catch { /* the guide just comes back next visit */ } };
  const { data: d, error, loading } = useLoad<any>(() => opsApi.farmDashboard({ from: from || undefined, to: to || undefined }), [from, to]);
  if (loading && !d) return <Loading />;
  if (!d) return <ErrorNote message={error} />;

  const t = d.tasks;
  const attention = [
    t.overdue > 0 && { text: `${num(t.overdue)} task(s) are overdue`, to: 'tasks' as Tab },
    t.awaitingReview > 0 && { text: `${num(t.awaitingReview)} task(s) are waiting for review`, to: 'tasks' as Tab },
    t.returned > 0 && { text: `${num(t.returned)} task(s) were returned to the worker`, to: 'tasks' as Tab },
    d.attendance.outsideGeofence7d > 0 && { text: `${num(d.attendance.outsideGeofence7d)} check-in(s) in the last 7 days were outside the plot`, to: 'attendance' as Tab },
  ].filter(Boolean) as { text: string; to: Tab }[];
  const harvest = (d.harvestByFarm as any[]).map((h) => ({ farm: h.farm, Estimated: Math.round(h.estimatedKg / 100) / 10, Actual: Math.round(h.actualKg / 100) / 10 }));
  const empty = d.farms === 0 && !dismissed;

  return (
    <section className="role-dashboard" style={{ margin: 0 }} aria-label="Mayode Farms overview">
      <Toolbar>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />

      {empty && (
        <ChartCard title="Start here" subtitle="No Mayode farm has been added yet. Work through these in order."
          action={<button type="button" className="btn-secondary" onClick={dismiss} aria-label="Dismiss the start-here guide">Dismiss</button>}>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8, fontSize: 14 }}>
            <li><LinkBtn onClick={() => goto('farms')}>Farms and plots</LinkBtn> — add a farm, draw its boundary on the map and create its plots.</li>
            <li><LinkBtn onClick={() => goto('tasks')}>Tasks and inspections</LinkBtn> — assign work to the team and schedule inspections.</li>
            <li><LinkBtn onClick={() => goto('inputs')}>Inputs</LinkBtn> — record seed, fertiliser and chemicals as they are bought and used.</li>
            <li><LinkBtn onClick={() => goto('harvests')}>Harvests</LinkBtn> — record each harvest so it can be received at the warehouse.</li>
          </ol>
        </ChartCard>
      )}

      <div className="role-grid">
        <MetricTile label="Mayode farms" value={num(d.farms)} hint={`${num(d.plots)} plots`} />
        <MetricTile label="Seasons in progress" value={num(d.activeCycles)} hint="Planned and growing crops" tone="purple" />
        <MetricTile label="Expected harvest" value={kg(d.expectedHarvestKg)} hint="From seasons in progress" tone="gold" />
        <MetricTile label="Cost of production" value={tzs(d.productionCost)} hint="Costs recorded against crops" tone="blue" />
        <MetricTile label="Tasks assigned" value={num(t.assigned + t.inProgress)} hint={`${num(t.overdue)} overdue`} tone={t.overdue ? 'red' : 'green'} />
        <MetricTile label="Waiting for review" value={num(t.awaitingReview)} hint="Work submitted by the team" tone={t.awaitingReview ? 'gold' : 'green'} />
        <MetricTile label="Completed" value={num(t.completed)} hint={`${num(t.returned)} returned, ${num(t.rejected)} rejected`} />
        <MetricTile label="Check-ins, last 7 days" value={num(d.attendance.checkIns7d)} hint={`${num(d.attendance.outsideGeofence7d)} outside the plot`} tone="blue" />
      </div>

      <div className="role-two-col-even">
        <ChartCard title="Crop progress" subtitle="Seasons by growth stage">
          <DonutBreakdown data={(d.cropProgress as any[]).map((c) => ({ name: label(c.stage), value: c.count }))} />
        </ChartCard>
        <ChartCard title="Team work" subtitle="Tasks by status">
          <DonutBreakdown data={[
            { name: 'Assigned', value: t.assigned }, { name: 'In progress', value: t.inProgress }, { name: 'Waiting for review', value: t.awaitingReview },
            { name: 'Completed', value: t.completed }, { name: 'Returned', value: t.returned }, { name: 'Rejected', value: t.rejected },
          ]} />
        </ChartCard>
      </div>

      <div className="role-two-col-even">
        <ChartCard title="Harvest by farm" subtitle="Estimated against actual, tons">
          <GroupedBarChart data={harvest} xKey="farm" series={[{ key: 'Estimated', name: 'Estimated', color: 'var(--gold-400)' }, { key: 'Actual', name: 'Actual', color: 'var(--green-500)' }]} />
        </ChartCard>
        <ChartCard title="Inputs used" subtitle="Seed, fertiliser and chemicals in this period">
          {(d.inputUsage as any[]).length === 0 ? (
            <div className="role-empty-state">No inputs used yet.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {(d.inputUsage as any[]).map((i) => (
                <li key={i.item} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span>{i.item} <span style={{ color: 'var(--neutral-500)', fontSize: 12 }}>· {label(i.type)}</span></span>
                  <strong>{num(i.used)} {i.unit}</strong>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <div className="role-two-col-even">
        <ChartCard title="Needs attention" subtitle="Worked out from live records">
          {attention.length === 0 ? (
            <div className="role-empty-state">Nothing needs attention right now.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {attention.map((a) => (
                <li key={a.text} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span>{a.text}</span>
                  <LinkBtn onClick={() => goto(a.to)}>Open →</LinkBtn>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Upcoming inspections" subtitle="Scheduled field inspections">
          {(d.upcomingInspections as any[]).length === 0 ? (
            <div className="role-empty-state">No inspections scheduled.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
              {(d.upcomingInspections as any[]).map((i) => (
                <li key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                  <span><strong>{i.reference}</strong> <span style={{ color: 'var(--neutral-500)', fontSize: 12 }}>· {i.assignee ?? 'Not assigned'}</span></span>
                  <span style={{ color: 'var(--neutral-500)' }}>{dateTime(i.plannedStart)}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
