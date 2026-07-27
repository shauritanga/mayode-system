'use client';
import { useEffect, useState } from 'react';
import { farmsApi, fieldSurveysApi } from '@/lib/api';
import Modal from '@/components/Modal';

interface Farm { id: string; farmCode: string; name?: string; village?: string }
interface Survey {
  id: string;
  surveyDate: string;
  source: string;
  soilPh?: number | null;
  soilTexture?: string | null;
  soilOrganicMatter?: number | null;
  roadDistanceMeters?: number | null;
  roadAccessQuality?: string | null;
  waterSource?: string | null;
  waterDistanceMeters?: number | null;
  waterReliability?: string | null;
  slope?: string | null;
  floodRisk?: string | null;
  observations?: string | null;
}

const EMPTY_FORM = {
  soilPh: '', soilTexture: '', soilOrganicMatter: '', soilNotes: '',
  roadDistanceMeters: '', roadAccessQuality: '',
  waterSource: '', waterDistanceMeters: '', waterReliability: '',
  slope: '', floodRisk: '', observations: '', latitude: '', longitude: '',
};

export default function FieldSurveysPage() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Farm | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    farmsApi.getAll().then(res => setFarms(res.data?.data || res.data || [])).catch(console.error);
  }, []);

  const loadSurveys = (farmId: string) => {
    fieldSurveysApi.listForFarm(farmId).then(res => setSurveys(res.data || [])).catch(console.error);
  };

  const selectFarm = (farm: Farm) => {
    setSelected(farm);
    setForm(EMPTY_FORM);
    setShowForm(false);
    loadSurveys(farm.id);
  };

  const filtered = search
    ? farms.filter(f => `${f.farmCode} ${f.name || ''}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm(f => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      await fieldSurveysApi.create(selected.id, {
        soilPh: form.soilPh ? Number(form.soilPh) : undefined,
        soilTexture: form.soilTexture || undefined,
        soilOrganicMatter: form.soilOrganicMatter ? Number(form.soilOrganicMatter) : undefined,
        soilNotes: form.soilNotes || undefined,
        roadDistanceMeters: form.roadDistanceMeters ? Number(form.roadDistanceMeters) : undefined,
        roadAccessQuality: form.roadAccessQuality || undefined,
        waterSource: form.waterSource || undefined,
        waterDistanceMeters: form.waterDistanceMeters ? Number(form.waterDistanceMeters) : undefined,
        waterReliability: form.waterReliability || undefined,
        slope: form.slope || undefined,
        floodRisk: form.floodRisk || undefined,
        observations: form.observations || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadSurveys(selected.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to record survey');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>Field Surveys</h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>MAYODE field-data collection: GPS, soil, road and water access per farm</p>
      </div>

      <div className="glass-card" style={{ padding: '16px', marginBottom: '20px' }}>
        <input
          className="input-field"
          placeholder="Search farm by code or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {filtered.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {filtered.map(f => (
              <button key={f.id} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => { selectFarm(f); setSearch(''); }}>
                {f.farmCode} {f.name ? `· ${f.name}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {selected.farmCode} {selected.name ? `(${selected.name})` : ''}
            </h2>
            <button className="btn-primary" onClick={() => setShowForm(true)}>+ New survey</button>
          </div>

          {showForm && (
            <Modal
              title="New field survey"
              subtitle={`${selected.farmCode}${selected.name ? ` · ${selected.name}` : ''}`}
              onClose={() => { setShowForm(false); setError(''); }}
              width="680px"
              footer={
                <>
                  <button className="btn-secondary" onClick={() => { setShowForm(false); setError(''); }} disabled={submitting}>Cancel</button>
                  <button className="btn-primary" onClick={submit} disabled={submitting}>
                    {submitting ? 'Saving…' : 'Record survey'}
                  </button>
                </>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                <Field label="Soil pH" value={form.soilPh} onChange={v => set('soilPh', v)} />
                <Field label="Soil texture" value={form.soilTexture} onChange={v => set('soilTexture', v)} />
                <Field label="Organic matter (%)" value={form.soilOrganicMatter} onChange={v => set('soilOrganicMatter', v)} />
                <Field label="Road distance (m)" value={form.roadDistanceMeters} onChange={v => set('roadDistanceMeters', v)} />
                <Field label="Road access (GOOD/FAIR/POOR)" value={form.roadAccessQuality} onChange={v => set('roadAccessQuality', v)} />
                <Field label="Water source" value={form.waterSource} onChange={v => set('waterSource', v)} />
                <Field label="Water distance (m)" value={form.waterDistanceMeters} onChange={v => set('waterDistanceMeters', v)} />
                <Field label="Water reliability" value={form.waterReliability} onChange={v => set('waterReliability', v)} />
                <Field label="Slope" value={form.slope} onChange={v => set('slope', v)} />
                <Field label="Flood risk" value={form.floodRisk} onChange={v => set('floodRisk', v)} />
                <Field label="Latitude" value={form.latitude} onChange={v => set('latitude', v)} />
                <Field label="Longitude" value={form.longitude} onChange={v => set('longitude', v)} />
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '6px' }}>Observations</label>
                <textarea className="input-field" rows={3} value={form.observations} onChange={e => set('observations', e.target.value)} style={{ resize: 'vertical' }} />
              </div>
              {error && <p style={{ color: 'var(--red-400)', fontSize: '12px', marginTop: '10px' }}>{error}</p>}
            </Modal>
          )}

          <div className="glass-card" style={{ overflow: 'hidden' }}>
            {surveys.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>No surveys recorded for this farm yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Soil pH</th><th>Road</th><th>Water</th><th>Flood risk</th></tr></thead>
                  <tbody>
                    {surveys.map(s => (
                      <tr key={s.id}>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{new Date(s.surveyDate).toLocaleDateString('en-GB')}</td>
                        <td style={{ color: 'var(--text-primary)', fontSize: '12px' }}>{s.soilPh ?? '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{s.roadDistanceMeters != null ? `${s.roadDistanceMeters}m (${s.roadAccessQuality || '—'})` : '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{s.waterSource || '—'}</td>
                        <td style={{ color: 'var(--neutral-400)', fontSize: '12px' }}>{s.floodRisk || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '6px' }}>{label}</label>
      <input className="input-field" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
