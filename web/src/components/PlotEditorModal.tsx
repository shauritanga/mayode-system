'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { plotsApi } from '@/lib/api';
import { ACRES_PER_HECTARE } from '@/lib/farm-format';

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--neutral-400)', marginBottom: '5px', fontWeight: 600 };

export default function PlotEditorModal({ farmId, plot, onClose, onSaved }: { farmId: string; plot?: any; onClose: () => void; onSaved: () => void }) {
  const s = (x: unknown) => (x == null ? '' : String(x));
  const [name, setName] = useState(s(plot?.name));
  const [size, setSize] = useState(s(plot?.sizeAcres));
  const [soil, setSoil] = useState(s(plot?.soilCondition));
  const [irrigation, setIrrigation] = useState(s(plot?.irrigationStatus));
  const [lat, setLat] = useState(s(plot?.centerLatitude));
  const [lng, setLng] = useState(s(plot?.centerLongitude));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const hectares = size && !Number.isNaN(Number(size)) ? (Number(size) / ACRES_PER_HECTARE).toFixed(2) : null;

  const submit = async () => {
    setError('');
    const sizeAcres = n(size);
    if (sizeAcres != null && (Number.isNaN(sizeAcres) || sizeAcres < 0.01)) return setError('Plot size must be at least 0.01 acres.');
    const centerLatitude = n(lat);
    const centerLongitude = n(lng);
    if ((centerLatitude == null) !== (centerLongitude == null)) return setError('Enter both latitude and longitude, or leave both blank.');
    const body = {
      name: name.trim() || undefined, sizeAcres, soilCondition: soil.trim() || undefined,
      irrigationStatus: irrigation.trim() || undefined, centerLatitude, centerLongitude,
    };
    setSaving(true);
    try {
      if (plot) await plotsApi.update(plot.id, body);
      else await plotsApi.create({ ...body, farmId });
      onSaved();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save the plot.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={plot ? `Edit ${plot.plotCode}` : 'Add plot'}
      subtitle="Plots are the individual parcels inside a farm"
      width="560px"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : plot ? 'Save plot' : 'Add plot'}</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        <div><label style={labelStyle}>Plot name</label><input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="North paddy" /></div>
        <div>
          <label style={labelStyle}>Plot size (acres)</label>
          <input className="input-field" type="number" min="0.01" step="0.01" value={size} onChange={(e) => setSize(e.target.value)} />
          {hectares && <small style={{ color: 'var(--text-3)' }}>≈ {hectares} ha</small>}
        </div>
        <div><label style={labelStyle}>Irrigation / water</label><input className="input-field" value={irrigation} onChange={(e) => setIrrigation(e.target.value)} placeholder="Gravity-fed canal, or rain-fed" /></div>
        <div><label style={labelStyle}>Soil condition</label><input className="input-field" value={soil} onChange={(e) => setSoil(e.target.value)} placeholder="Clay loam" /></div>
        <div><label style={labelStyle}>GPS latitude</label><input className="input-field" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
        <div><label style={labelStyle}>GPS longitude</label><input className="input-field" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} /></div>
      </div>
      {error && <div style={{ color: 'var(--red-400)', fontSize: 13, marginTop: 12 }}>{error}</div>}
    </Modal>
  );
}
