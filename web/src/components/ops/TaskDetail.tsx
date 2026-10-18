'use client';
import { type ReactNode } from 'react';
import { dateTime, label } from '@/lib/ops';
import { DataTable, Facts, Status } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ACTIVITIES = ['LAND_PREPARATION', 'SEED_SELECTION', 'NURSERY_ESTABLISHMENT', 'PLANTING', 'FERTILIZING', 'WEEDING', 'PEST_CONTROL', 'IRRIGATION', 'FIELD_INSPECTION', 'HARVESTING', 'DRYING', 'STORAGE', 'TRANSPORT'];
export const PRIORITIES: [string, string][] = [['LOW', 'Low'], ['NORMAL', 'Normal'], ['HIGH', 'High'], ['URGENT', 'Urgent']];

/** Everything recorded about one task: instructions, GPS evidence, the worker's report, any inspection, and the full history. */
export default function TaskDetail({ t }: { t: any }): ReactNode {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Status value={t.status} />{t.overdue && <span className="badge badge-red">Overdue</span>}<span className="badge badge-gray">{label(t.priority)} priority</span>{t.type === 'INSPECTION' && <span className="badge badge-blue">Inspection</span>}
      </div>
      {t.reviewComment && <div className={`alert-box ${t.status === 'COMPLETED' ? '' : 'alert-danger'}`} style={{ marginBottom: 12 }}><strong>{label(t.reviewDecision)}:</strong> {t.reviewComment}</div>}
      <Facts items={[
        ['Activity', label(t.activityType)], ['Farm', t.farm?.name ?? '—'], ['Plot', t.plot ? t.plot.name ?? t.plot.plotCode : '—'], ['Crop season', t.cropCycle?.season ?? '—'],
        ['Assigned to', t.assigneeName ?? '—'], ['Assigned by', t.assignedByName ?? '—'], ['Reviewer', t.reviewerName ?? '—'], ['Planned start', dateTime(t.plannedStart)], ['Deadline', dateTime(t.deadline)],
        ['GPS required', t.requireGps ? `Yes, within ${t.geofenceM} m` : 'No'], ['Expected output', t.expectedOutput ?? '—'], ['Inputs to use', t.requiredInputs ?? '—'],
      ]} />
      {t.instructions && <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}><strong>Instructions:</strong> {t.instructions}</p>}
      {t.inspectionObjective && <p style={{ fontSize: 13 }}><strong>What to look for:</strong> {t.inspectionObjective}</p>}
      {t.parent && <p style={{ fontSize: 12 }}>Follow-up to {t.parent.reference}: {t.parent.title}</p>}

      {t.checkIns?.length > 0 && (<>
        <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>GPS check-ins</h4>
        <DataTable rows={t.checkIns} rowKey={(c: any) => c.id} columns={[{ header: 'Recorded', render: (c: any) => dateTime(c.serverTime) }, { header: 'Type', render: (c: any) => label(c.kind) },
          { header: 'Position', render: (c: any) => `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}${c.accuracyM != null ? ` (±${Math.round(c.accuracyM)} m)` : ''}` },
          { header: 'From the plot', render: (c: any) => (c.distanceM != null ? `${Math.round(c.distanceM)} m` : 'No plot position') },
          { header: 'Location', render: (c: any) => (c.withinGeofence == null ? '—' : c.withinGeofence ? <span className="badge badge-green">On site</span> : <span className="badge badge-red">Outside</span>) }, { header: 'Note', render: (c: any) => c.note ?? '—' }]} />
      </>)}
      {t.reports?.length > 0 && (<>
        <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Work report</h4>
        {t.reports.map((r: any) => (
          <div key={r.id} className="glass-card" style={{ padding: 12, fontSize: 13, marginBottom: 8 }}>
            <div>Submitted {dateTime(r.submittedAt)} · {r.workDoneQty != null ? `${r.workDoneQty} ${r.workDoneUnit ?? ''} done` : 'quantity not stated'}{r.equipment ? ` · ${r.equipment}` : ''}</div>
            {r.observations && <div>{r.observations}</div>}{r.incompleteReason && <div><strong>Not finished because:</strong> {r.incompleteReason}</div>}
            {r.photoUrls?.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{r.photoUrls.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer">Photo</a>)}</div>}
          </div>
        ))}
      </>)}
      {t.inputMovements?.length > 0 && (<>
        <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Inputs used</h4>
        <DataTable rows={t.inputMovements} rowKey={(m: any) => m.id} columns={[{ header: 'Input', render: (m: any) => m.item.name }, { header: 'Quantity', align: 'right', render: (m: any) => `${-m.quantity} ${m.item.unit}` }, { header: 'When', render: (m: any) => dateTime(m.createdAt) }]} />
      </>)}
      {t.inspection && (<>
        <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Inspection findings</h4>
        <Facts items={[['Crop condition', t.inspection.cropCondition ?? '—'], ['Growth stage', t.inspection.growthStage ?? '—'], ['Pests', t.inspection.pests ?? '—'], ['Diseases', t.inspection.diseases ?? '—'], ['Soil and water', t.inspection.soilWater ?? '—']]} />
        {t.inspection.observations && <p style={{ fontSize: 13 }}>{t.inspection.observations}</p>}
        {Array.isArray(t.inspection.recommendations) && t.inspection.recommendations.length > 0 && <ul style={{ fontSize: 13, paddingLeft: 18 }}>{t.inspection.recommendations.map((r: any, i: number) => <li key={i}>{r.text}{r.suggestedActivity ? ` (suggested: ${label(r.suggestedActivity)})` : ''}</li>)}</ul>}
      </>)}
      {t.followUps?.length > 0 && (<>
        <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Follow-up tasks</h4>
        <ul style={{ fontSize: 13, paddingLeft: 18, margin: 0 }}>{t.followUps.map((f: any) => <li key={f.id}>{f.reference} · {f.title} · {f.assigneeName ?? '—'} · {label(f.status)}</li>)}</ul>
      </>)}
      <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>History</h4>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{t.events?.map((e: any) => <li key={e.id}><strong>{label(e.type.replace('task.', ''))}</strong> · {dateTime(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ''}{e.note ? ` — ${e.note}` : ''}</li>)}</ul>
    </>
  );
}
