'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { cropCyclesApi, farmsApi, integrationsApi, inventoryApi } from '@/lib/api';

const INTAKE_TYPES = [
  'SOIL_TESTER',
  'DRONE_REPORT',
  'RICE_SORTER',
  'QR_TRACEABILITY',
  'LOGISTICS_OPTIMIZER',
] as const;

function severityBadge(severity?: string) {
  if (severity === 'HIGH') return 'badge-gold';
  if (severity === 'MEDIUM') return 'badge-blue';
  return 'badge-green';
}

export default function AiInsightsPage() {
  const [catalog, setCatalog] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [advisoryCycleId, setAdvisoryCycleId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [intake, setIntake] = useState({
    sourceType: 'SOIL_TESTER',
    farmId: '',
    cropCycleId: '',
    lotId: '',
    externalReference: '',
    ph: '',
    texture: '',
    organicMatter: '',
    nitrogenPpm: '',
    phosphorusPpm: '',
    potassiumPpm: '',
    qualityGrade: '',
    moisturePct: '',
    brokenPct: '',
    trackingCode: '',
    notes: '',
    summary: '',
    modelProvider: '',
    modelVersion: '',
  });
  const [savingIntake, setSavingIntake] = useState(false);
  const [lots, setLots] = useState<any[]>([]);
  const [traceLink, setTraceLink] = useState('');

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      integrationsApi.catalog(),
      integrationsApi.aiRecords(
        sourceFilter === 'all' ? undefined : { sourceType: sourceFilter },
      ),
      cropCyclesApi.getAll(),
      farmsApi.getAll(),
      inventoryApi.lots(),
    ])
      .then(([cat, rec, cyc, farmRes, lotsRes]) => {
        if (cat.status === 'fulfilled') setCatalog(cat.value.data);
        if (rec.status === 'fulfilled') setRecords(rec.value.data || []);
        if (cyc.status === 'fulfilled') {
          setCycles(cyc.value.data?.data || cyc.value.data || []);
        }
        if (farmRes.status === 'fulfilled') {
          const raw = farmRes.value.data;
          setFarms(raw?.data || raw || []);
        }
        if (lotsRes.status === 'fulfilled') {
          setLots(lotsRes.value.data || []);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceFilter]);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    if (!advisoryCycleId) return;
    setGenerating(true);
    setMessage('');
    setError('');
    try {
      await integrationsApi.generateFieldAdvisory(advisoryCycleId);
      setMessage('Field advisory generated and stored.');
      load();
    } catch (err: any) {
      setError(
        err?.response?.data?.message || 'Unable to generate field advisory.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const submitIntake = async (e: FormEvent) => {
    e.preventDefault();
    setSavingIntake(true);
    setMessage('');
    setError('');
    try {
      if (intake.sourceType === 'SOIL_TESTER' && !intake.farmId && !intake.cropCycleId) {
        setError('Select a farm (or crop cycle) so fertilizer guidance can sync to the right place.');
        setSavingIntake(false);
        return;
      }
      if (intake.sourceType === 'RICE_SORTER' && !intake.lotId) {
        setError('Select a lot so sorter grade and moisture update warehouse inventory.');
        setSavingIntake(false);
        return;
      }
      if (intake.sourceType === 'QR_TRACEABILITY' && !intake.trackingCode && !intake.lotId) {
        setError('Provide a tracking code or lot for QR traceability events.');
        setSavingIntake(false);
        return;
      }

      const payload: Record<string, unknown> = {
        schema: `mayode.${intake.sourceType.toLowerCase()}.v1`,
        notes: intake.notes || undefined,
        modelProvider: intake.modelProvider || undefined,
        modelVersion: intake.modelVersion || undefined,
      };
      if (intake.sourceType === 'SOIL_TESTER') {
        payload.ph = intake.ph ? Number(intake.ph) : undefined;
        payload.texture = intake.texture || undefined;
        payload.organicMatter = intake.organicMatter
          ? Number(intake.organicMatter)
          : undefined;
        payload.nitrogenPpm = intake.nitrogenPpm
          ? Number(intake.nitrogenPpm)
          : undefined;
        payload.phosphorusPpm = intake.phosphorusPpm
          ? Number(intake.phosphorusPpm)
          : undefined;
        payload.potassiumPpm = intake.potassiumPpm
          ? Number(intake.potassiumPpm)
          : undefined;
      }
      if (intake.sourceType === 'RICE_SORTER') {
        payload.qualityGrade = intake.qualityGrade || undefined;
        payload.moisturePct = intake.moisturePct
          ? Number(intake.moisturePct)
          : undefined;
        payload.brokenPct = intake.brokenPct
          ? Number(intake.brokenPct)
          : undefined;
      }
      if (intake.sourceType === 'QR_TRACEABILITY') {
        payload.trackingCode = intake.trackingCode || undefined;
        payload.event = 'SCAN';
      }
      await integrationsApi.createAiRecord({
        sourceType: intake.sourceType,
        farmId: intake.farmId || undefined,
        cropCycleId: intake.cropCycleId || undefined,
        lotId: intake.lotId || undefined,
        externalReference: intake.externalReference || undefined,
        payload,
        recommendation: intake.summary
          ? { summary: intake.summary, severity: 'MEDIUM' }
          : undefined,
      });
      setMessage(
        intake.sourceType === 'SOIL_TESTER'
          ? 'Soil test stored with fertilizer guidance (farm soil fields synced when farm selected).'
          : intake.sourceType === 'RICE_SORTER'
            ? 'Sorter result stored; lot inventory grades updated. Open Traceability to verify.'
            : `${intake.sourceType.replace(/_/g, ' ')} record stored.`,
      );
      const sorterLotId = intake.lotId;
      const sorterLotNumber = lots.find((l: any) => l.id === sorterLotId)?.lotNumber;
      setIntake((c) => ({
        ...c,
        externalReference: '',
        ph: '',
        texture: '',
        organicMatter: '',
        nitrogenPpm: '',
        phosphorusPpm: '',
        potassiumPpm: '',
        qualityGrade: '',
        moisturePct: '',
        brokenPct: '',
        trackingCode: '',
        notes: '',
        summary: '',
        modelProvider: '',
        modelVersion: '',
      }));
      load();
      if (intake.sourceType === 'RICE_SORTER' && sorterLotNumber) {
        setTraceLink(sorterLotNumber);
      } else {
        setTraceLink('');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to store intake record.');
    } finally {
      setSavingIntake(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-kicker">AI · Phase 1.5</div>
          <h1 className="page-title">AI Insights</h1>
          <p className="page-subtitle">
            Field Advisory MVP plus soil/drone/sorter intake into MAYOData
            integration records.
          </p>
        </div>
      </div>

      {error && <div className="alert-box alert-danger">{error}</div>}
      {message && <div className="alert-box alert-success">{message}</div>}
      {traceLink && (
        <div className="alert-box" style={{ marginBottom: 16 }}>
          Sorter saved for <strong>{traceLink}</strong>.{' '}
          <Link href={`/dashboard/traceability?q=${encodeURIComponent(traceLink)}`}>
            Open in Traceability →
          </Link>
        </div>
      )}

      {catalog && (
        <div className="action-panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                {catalog.primaryProduct?.name || 'Field Advisory'}
              </h2>
              <p className="panel-copy">
                {catalog.primaryProduct?.description} Schema{' '}
                <code>{catalog.primaryProduct?.recordSchema}</code>
              </p>
            </div>
            <span className="badge badge-green">
              {catalog.primaryProduct?.status || 'live'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(catalog.intakeProducts || []).map((p: any) => (
              <span
                key={p.id}
                className={`badge ${
                  p.status === 'live'
                    ? 'badge-green'
                    : p.status === 'intake_ready'
                      ? 'badge-blue'
                      : 'badge-gray'
                }`}
              >
                {p.id.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={generate} className="action-panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Generate field advisory</h2>
            <p className="panel-copy">
              Runs rule-based checks on protocol tasks, soil/water, fertilizer,
              and harvest timing — stores `FIELD_ADVISORY`.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            className="input-field"
            required
            value={advisoryCycleId}
            onChange={(e) => setAdvisoryCycleId(e.target.value)}
            style={{ minWidth: 280, flex: 1 }}
          >
            <option value="">Select crop cycle…</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.farm?.farmCode || 'Farm'} · {c.season} · {c.status}
                {c.farmer
                  ? ` · ${c.farmer.firstName} ${c.farmer.lastName}`
                  : ''}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={generating}>
            {generating ? 'Generating…' : 'Generate advisory'}
          </button>
        </div>
      </form>

      <form onSubmit={submitIntake} className="action-panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Equipment / partner intake</h2>
            <p className="panel-copy">
              Store soil tester, drone, sorter, or QR payloads against a farm or
              cycle.
            </p>
          </div>
        </div>
        <div className="form-grid-wide">
          <label className="form-label">
            Source type
            <select
              className="input-field"
              value={intake.sourceType}
              onChange={(e) =>
                setIntake((c) => ({ ...c, sourceType: e.target.value }))
              }
            >
              {INTAKE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Farm
            <select
              className="input-field"
              value={intake.farmId}
              onChange={(e) =>
                setIntake((c) => ({ ...c, farmId: e.target.value }))
              }
            >
              <option value="">Optional…</option>
              {farms.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.farmCode || f.name || f.id}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Crop cycle
            <select
              className="input-field"
              value={intake.cropCycleId}
              onChange={(e) =>
                setIntake((c) => ({ ...c, cropCycleId: e.target.value }))
              }
            >
              <option value="">Optional…</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.farm?.farmCode || 'Farm'} · {c.season}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Lot
            <select
              className="input-field"
              value={intake.lotId}
              onChange={(e) =>
                setIntake((c) => ({ ...c, lotId: e.target.value }))
              }
            >
              <option value="">Optional (required for sorter grade push)…</option>
              {lots.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber} · {Math.round(l.totalWeightKg || 0)} kg
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            External reference
            <input
              className="input-field"
              value={intake.externalReference}
              onChange={(e) =>
                setIntake((c) => ({
                  ...c,
                  externalReference: e.target.value,
                }))
              }
              placeholder="Lab ID / device serial"
            />
          </label>
          {intake.sourceType === 'SOIL_TESTER' && (
            <>
              <label className="form-label">
                pH
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  value={intake.ph}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, ph: e.target.value }))
                  }
                />
              </label>
              <label className="form-label">
                Texture
                <input
                  className="input-field"
                  value={intake.texture}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, texture: e.target.value }))
                  }
                />
              </label>
              <label className="form-label">
                Organic matter %
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  value={intake.organicMatter}
                  onChange={(e) =>
                    setIntake((c) => ({
                      ...c,
                      organicMatter: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="form-label">
                N (ppm)
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  value={intake.nitrogenPpm}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, nitrogenPpm: e.target.value }))
                  }
                />
              </label>
              <label className="form-label">
                P (ppm)
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  value={intake.phosphorusPpm}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, phosphorusPpm: e.target.value }))
                  }
                />
              </label>
              <label className="form-label">
                K (ppm)
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  value={intake.potassiumPpm}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, potassiumPpm: e.target.value }))
                  }
                />
              </label>
            </>
          )}
          {intake.sourceType === 'RICE_SORTER' && (
            <>
              <label className="form-label">
                Quality grade
                <input
                  className="input-field"
                  value={intake.qualityGrade}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, qualityGrade: e.target.value }))
                  }
                  placeholder="A / B / C (auto if blank)"
                />
              </label>
              <label className="form-label">
                Moisture %
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  value={intake.moisturePct}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, moisturePct: e.target.value }))
                  }
                />
              </label>
              <label className="form-label">
                Broken %
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  value={intake.brokenPct}
                  onChange={(e) =>
                    setIntake((c) => ({ ...c, brokenPct: e.target.value }))
                  }
                />
              </label>
            </>
          )}
          {intake.sourceType === 'QR_TRACEABILITY' && (
            <label className="form-label">
              Tracking code
              <input
                className="input-field"
                value={intake.trackingCode}
                onChange={(e) =>
                  setIntake((c) => ({ ...c, trackingCode: e.target.value }))
                }
                placeholder="INV-2026-0042"
              />
            </label>
          )}
          <label className="form-label">
            Model provider (optional)
            <input
              className="input-field"
              value={intake.modelProvider}
              onChange={(e) =>
                setIntake((c) => ({ ...c, modelProvider: e.target.value }))
              }
              placeholder="Partner model name"
            />
          </label>
          <label className="form-label">
            Model version (optional)
            <input
              className="input-field"
              value={intake.modelVersion}
              onChange={(e) =>
                setIntake((c) => ({ ...c, modelVersion: e.target.value }))
              }
              placeholder="v1.2.0"
            />
          </label>
          <label className="form-label form-grid-wide">
            Notes
            <input
              className="input-field"
              value={intake.notes}
              onChange={(e) =>
                setIntake((c) => ({ ...c, notes: e.target.value }))
              }
            />
          </label>
          <label className="form-label form-grid-wide">
            Recommendation summary override (optional)
            <input
              className="input-field"
              value={intake.summary}
              onChange={(e) =>
                setIntake((c) => ({ ...c, summary: e.target.value }))
              }
              placeholder="Overrides auto summary when set"
            />
          </label>
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={savingIntake}
          style={{ marginTop: 12 }}
        >
          {savingIntake ? 'Saving…' : 'Store intake record'}
        </button>
      </form>

      <div className="table-panel">
        <div className="section-toolbar">
          <strong>Integration records</strong>
          <select
            className="input-field"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            <option value="all">All sources</option>
            <option value="FIELD_ADVISORY">Field advisory</option>
            {INTAKE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="muted" style={{ padding: 24 }}>
            Loading…
          </p>
        ) : !records.length ? (
          <p className="muted" style={{ padding: 24 }}>
            No AI integration records yet. Generate an advisory or store
            intake.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Farm / cycle</th>
                  <th>Summary</th>
                  <th>Severity</th>
                  <th>Captured</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const rec =
                    r.recommendation && typeof r.recommendation === 'object'
                      ? r.recommendation
                      : {};
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>
                        {String(r.sourceType).replace(/_/g, ' ')}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {r.farm?.farmCode || '—'}
                        {r.cropCycle?.season
                          ? ` · ${r.cropCycle.season}`
                          : ''}
                        {r.externalReference
                          ? ` · ${r.externalReference}`
                          : ''}
                      </td>
                      <td style={{ maxWidth: 360 }}>
                        {rec.summary ||
                          (Array.isArray(rec.findings)
                            ? rec.findings[0]?.message
                            : null) ||
                          '—'}
                      </td>
                      <td>
                        {rec.severity ? (
                          <span className={`badge ${severityBadge(rec.severity)}`}>
                            {rec.severity}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {r.capturedAt
                          ? new Date(r.capturedAt).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
