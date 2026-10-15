'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { cropCyclesApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import CropCycleEditorModal from '@/components/CropCycleEditorModal';
import CropStageStepper from '@/components/CropStageStepper';
import { fmtHa } from '@/lib/farm-format';
import { IRRIGATION_TYPES, PRODUCTION_METHODS, fmtDate, fmtKg, stageIndex, stageLabel, statusBadgeClass } from '@/lib/crop-stages';

const h3: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' };
const money = (n?: number | null) => `TZS ${Math.round(n || 0).toLocaleString()}`;

function Attr({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--neutral-500)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value || value === 0 ? value : '—'}</div>
    </div>
  );
}

export default function CropCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const [cycle, setCycle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const load = () => {
    cropCyclesApi.getOne(id)
      .then((res) => setCycle(res.data))
      .catch(() => setError('Could not load this crop season.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); }, [id]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>Loading crop season…</div>;
  if (error || !cycle) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>{error || 'Crop season not found.'}</div>;

  const canEdit = role === 'SUPER_ADMIN' || role === 'FIELD_OFFICER';
  const farmer = cycle.farmer;
  // Timeline: stage moves recorded here plus the stage reported in each field visit.
  const timeline = [
    ...(cycle.stageChanges || []).map((c: any) => ({ key: `c-${c.id}`, at: c.changedAt, stage: c.stage, by: c.source === 'VISIT' ? 'Field visit' : 'Admin', note: c.note })),
    ...(cycle.officerVisits || [])
      .filter((v: any) => v.growthStage && !(cycle.stageChanges || []).some((c: any) => c.source === 'VISIT' && c.stage === v.growthStage && Math.abs(new Date(c.changedAt).getTime() - new Date(v.visitedAt).getTime()) < 1000))
      .map((v: any) => ({ key: `v-${v.id}`, at: v.visitedAt, stage: v.growthStage, by: v.fieldOfficer ? `Field visit · ${v.fieldOfficer.firstName} ${v.fieldOfficer.lastName}` : 'Field visit', note: v.observations })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const totalCost = (cycle.costs || []).reduce((s: number, c: any) => s + (c.totalCost || 0), 0);
  const totalRevenue = (cycle.revenues || []).reduce((s: number, r: any) => s + (r.totalRevenue || 0), 0);
  const tasks: any[] = cycle.calendarTasks || [];
  const done = tasks.filter((t) => t.status === 'COMPLETED').length;
  const yieldPerHa = cycle.actualYieldKg && cycle.areaPlantedHa ? Math.round(cycle.actualYieldKg / cycle.areaPlantedHa) : null;
  const expectedPerHa = cycle.estimatedYieldKg && cycle.areaPlantedHa ? Math.round(cycle.estimatedYieldKg / cycle.areaPlantedHa) : null;

  return (
    <div>
      <button className="btn-secondary" style={{ marginBottom: 16, fontSize: 12 }} onClick={() => router.back()}>← Back</button>

      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 4, height: 26, background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: 9999 }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{cycle.season}</h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--neutral-500)', marginLeft: 14 }}>
            <Link href={`/dashboard/farms/${cycle.farmId}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{cycle.farm?.farmCode}</Link>
            {farmer ? ` · ${farmer.firstName} ${farmer.lastName} · ${farmer.controlNumber}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge ${statusBadgeClass(cycle.status)}`}>{cycle.status}</span>
          {canEdit && <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setEditing(true)}>Edit / update stage</button>}
        </div>
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={h3}>Growth stage · {stageIndex(cycle.growthStage) >= 0 ? stageLabel(cycle.growthStage) : 'Not recorded yet'}</h3>
        <CropStageStepper stage={cycle.growthStage} />
        {cycle.stageUpdatedAt && <p style={{ fontSize: 12, color: 'var(--neutral-500)', margin: '12px 0 0' }}>Last updated {fmtDate(cycle.stageUpdatedAt)}</p>}
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={h3}>Crop season details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          <Attr label="Season name" value={cycle.season} />
          <Attr label="Farming season" value={cycle.farmingSeason?.name} />
          <Attr label="Rice variety" value={cycle.riceVariety} />
          <Attr label="Planting date" value={fmtDate(cycle.plantingDate)} />
          <Attr label="Expected harvest date" value={fmtDate(cycle.expectedHarvest)} />
          <Attr label="Actual harvest date" value={fmtDate(cycle.harvestDate)} />
          <Attr label="Area planted" value={cycle.areaPlantedHa != null ? fmtHa(cycle.areaPlantedHa) : undefined} />
          <Attr label="Farm size" value={cycle.farm ? fmtHa(cycle.farm.socialHectares) : undefined} />
          <Attr label="Seed quantity" value={cycle.seedQuantityKg != null ? `${cycle.seedQuantityKg} kg` : undefined} />
          <Attr label="Production method" value={PRODUCTION_METHODS[cycle.productionMethod]} />
          <Attr label="Irrigation type" value={IRRIGATION_TYPES[cycle.irrigationType]} />
          <Attr label="Crop status" value={cycle.status} />
          <Attr label="Expected yield" value={fmtKg(cycle.estimatedYieldKg)} />
          <Attr label="Actual yield" value={fmtKg(cycle.actualYieldKg)} />
          <Attr label="Expected yield per ha" value={expectedPerHa ? `${expectedPerHa.toLocaleString()} kg/ha` : undefined} />
          <Attr label="Actual yield per ha" value={yieldPerHa ? `${yieldPerHa.toLocaleString()} kg/ha` : undefined} />
        </div>
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={h3}>Stage timeline</h3>
        {timeline.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--neutral-500)' }}>No stage changes recorded yet.</p>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {timeline.map((t) => (
              <li key={t.key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12, fontSize: 13 }}>
                <span style={{ color: 'var(--neutral-500)' }}>{fmtDate(t.at)}</span>
                <span>
                  <strong>{stageLabel(t.stage)}</strong> <span style={{ color: 'var(--neutral-500)' }}>· {t.by}</span>
                  {t.note && <div style={{ color: 'var(--neutral-500)', marginTop: 2 }}>{t.note}</div>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {(cycle.officerVisits || []).length > 0 && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 16, overflowX: 'auto' }}>
          <h3 style={h3}>Field-officer visits</h3>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Officer</th><th>Stage</th><th>Crop</th><th>Water</th><th>Pests</th><th>Disease</th><th>Observations</th></tr></thead>
            <tbody>
              {cycle.officerVisits.map((v: any) => (
                <tr key={v.id}>
                  <td>{fmtDate(v.visitedAt)}</td>
                  <td>{v.fieldOfficer ? `${v.fieldOfficer.firstName} ${v.fieldOfficer.lastName}` : '—'}</td>
                  <td>{v.growthStage ? stageLabel(v.growthStage) : '—'}</td>
                  <td>{v.cropCondition || '—'}</td>
                  <td>{v.waterStatus || '—'}</td>
                  <td>{v.pestStatus || '—'}</td>
                  <td>{v.diseaseStatus || '—'}</td>
                  <td>{v.observations || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="glass-card" style={{ padding: 20, marginBottom: 16, overflowX: 'auto' }}>
        <h3 style={h3}>Rice calendar tasks ({done}/{tasks.length} done)</h3>
        {tasks.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--neutral-500)' }}>No calendar tasks scheduled. Set a planting date and variety to generate them.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Task</th><th>Due</th><th>Status</th><th>Completed</th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{fmtDate(t.dueDate)}</td>
                  <td>{String(t.status).replace(/_/g, ' ')}</td>
                  <td>{fmtDate(t.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass-card" style={{ padding: 20 }}>
        <h3 style={h3}>Economics</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          <Attr label="Input costs" value={money(totalCost)} />
          <Attr label="Revenue" value={money(totalRevenue)} />
          <Attr label="Margin" value={money(totalRevenue - totalCost)} />
          <Attr label="Activities logged" value={(cycle.activities || []).length} />
        </div>
      </div>

      {editing && <CropCycleEditorModal cycle={cycle} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}
