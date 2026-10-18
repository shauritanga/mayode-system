'use client';
import { useState } from 'react';
import { opsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import { kg, label, tzs, dateTime } from '@/lib/ops';
import { DataTable, ErrorNote, Facts, Field, Loading, PageHead, Tabs, Toolbar, useLoad } from '@/components/ops/ui';
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
  return (
    <div>
      <PageHead kicker="Mayode Operations" title="Mayode Farms" subtitle="Plots and seasons, work assigned to the team, GPS-checked attendance, inputs used and the harvest that reaches the warehouse." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview />}
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

function Overview() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: d, error, loading } = useLoad<any>(() => opsApi.farmDashboard({ from: from || undefined, to: to || undefined }), [from, to]);
  return (
    <>
      <Toolbar>
        <Field label="From"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Toolbar>
      <ErrorNote message={error} />
      {loading && !d ? <Loading /> : d && (<>
        <Facts min={180} items={[
          ['Mayode farms', d.farms], ['Plots', d.plots], ['Seasons in progress', d.activeCycles], ['Expected harvest', kg(d.expectedHarvestKg)],
          ['Tasks assigned', d.tasks.assigned], ['In progress', d.tasks.inProgress], ['Waiting for review', d.tasks.awaitingReview], ['Completed', d.tasks.completed], ['Returned', d.tasks.returned], ['Rejected', d.tasks.rejected], ['Overdue', d.tasks.overdue],
          ['Check-ins, last 7 days', d.attendance.checkIns7d], ['Outside the plot', d.attendance.outsideGeofence7d], ['Cost of production', tzs(d.productionCost)],
        ]} />
        <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Crop progress</h4>
        <DataTable rows={d.cropProgress} rowKey={(c: any) => c.stage} empty="No crops in the field." columns={[{ header: 'Growth stage', render: (c: any) => label(c.stage) }, { header: 'Seasons', align: 'right', render: (c: any) => c.count }]} />
        <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Harvest by farm</h4>
        <DataTable rows={d.harvestByFarm} rowKey={(c: any) => c.farm} empty="No harvests yet." columns={[{ header: 'Farm', render: (c: any) => c.farm }, { header: 'Estimated', align: 'right', render: (c: any) => kg(c.estimatedKg) }, { header: 'Actual', align: 'right', render: (c: any) => kg(c.actualKg) }]} />
        <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Inputs used</h4>
        <DataTable rows={d.inputUsage} rowKey={(c: any) => c.item} empty="No inputs used." columns={[{ header: 'Input', render: (c: any) => c.item }, { header: 'Kind', render: (c: any) => label(c.type) }, { header: 'Used', align: 'right', render: (c: any) => `${c.used} ${c.unit}` }]} />
        <h4 style={{ margin: '18px 0 8px', fontSize: 13 }}>Upcoming inspections</h4>
        <DataTable rows={d.upcomingInspections} rowKey={(c: any) => c.id} empty="None scheduled." columns={[{ header: 'Inspection', render: (c: any) => c.reference }, { header: 'Inspector', render: (c: any) => c.assignee ?? '—' }, { header: 'When', render: (c: any) => dateTime(c.plannedStart) }]} />
      </>)}
    </>
  );
}
