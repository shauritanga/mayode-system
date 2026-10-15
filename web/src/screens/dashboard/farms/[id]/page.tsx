'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { cropCyclesApi, farmsApi, plotsApi, riceVarietiesApi, uploadsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { isFarmBoundaryMapped } from '@/lib/farm-geo';
import {
  OWNERSHIP_LABELS,
  acresToHectares,
  fmtCoord,
  fmtHa,
  locationLabel,
  productionLabel,
  riceVarieties,
  totalPlotHectares,
} from '@/lib/farm-format';
import FarmEditorModal from '@/components/FarmEditorModal';
import PlotEditorModal from '@/components/PlotEditorModal';
import Modal from '@/components/Modal';

const FarmBoundaryMap = dynamic(() => import('@/components/FarmBoundaryMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 48, textAlign: 'center', color: 'var(--neutral-500)', fontSize: 14 }}>Loading map…</div>,
});

interface Photo { id: string; url: string; caption?: string | null }

const dateFmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function FarmDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const role = useAuthStore((state) => state.user?.role);

  const [farm, setFarm] = useState<any>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [varieties, setVarieties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [plotEditor, setPlotEditor] = useState<{ plot?: any } | null>(null);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cycleForm, setCycleForm] = useState({ open: false, season: '', varietyId: '', plantingDate: '' });

  const load = () => {
    Promise.all([
      farmsApi.getOne(id).then((res) => setFarm(res.data)),
      farmsApi.listPhotos(id).then((res) => setPhotos(res.data || [])).catch(() => setPhotos([])),
    ]).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    load();
    riceVarietiesApi.list().then((res) => setVarieties(res.data || [])).catch(() => setVarieties([]));
  }, [id]);

  const fail = (e: any, fallback: string) => {
    const msg = e?.response?.data?.message;
    setMessage(Array.isArray(msg) ? msg.join(', ') : msg || fallback);
  };

  const approveBoundary = async () => {
    setApproving(true);
    setMessage('');
    try {
      await farmsApi.reviewBoundary(id);
      setMessage('Boundary approved. This is now the official AMCOS farm boundary.');
      load();
    } catch (e: any) {
      fail(e, 'Could not approve boundary. Map the boundary first.');
    } finally {
      setApproving(false);
    }
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setMessage('');
    try {
      for (const file of Array.from(files)) {
        const { data } = await uploadsApi.upload(file);
        await farmsApi.addPhoto(id, { url: data.url, caption: file.name.replace(/\.[^.]+$/, '') });
      }
      load();
    } catch (e: any) {
      fail(e, 'Could not upload the photo.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (photo: Photo) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await farmsApi.deletePhoto(photo.id);
      setLightbox(null);
      load();
    } catch (e: any) {
      fail(e, 'Could not delete the photo.');
    }
  };

  const removePlot = async (plot: any) => {
    if (!window.confirm(`Delete plot ${plot.plotCode}?`)) return;
    try {
      await plotsApi.remove(plot.id);
      load();
    } catch (e: any) {
      fail(e, 'Could not delete the plot.');
    }
  };

  const addCrop = async () => {
    const variety = varieties.find((x) => x.id === cycleForm.varietyId);
    if (!cycleForm.season.trim() || !variety) return setMessage('Choose a rice variety and enter the season.');
    try {
      await cropCyclesApi.create({
        farmId: id,
        season: cycleForm.season.trim(),
        riceVariety: variety.name,
        riceVarietyId: variety.id,
        plantingDate: cycleForm.plantingDate ? new Date(cycleForm.plantingDate).toISOString() : undefined,
      });
      setCycleForm({ open: false, season: '', varietyId: '', plantingDate: '' });
      setMessage('Crop cycle added.');
      load();
    } catch (e: any) {
      fail(e, 'Could not add the crop cycle.');
    }
  };

  if (loading) {
    return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading farm…</div>;
  }
  if (!farm) {
    return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Farm not found.</div>;
  }

  const hasBoundary = isFarmBoundaryMapped(farm);
  const hasMap = hasBoundary || farm.centerLatitude != null || (farm.plots || []).some((p: any) => p.boundaryCoordinates || p.centerLatitude != null);
  const canApprove = (role === 'MAMCOS_SECRETARY' || role === 'SUPER_ADMIN') && !farm.isVerified;
  const canEditFarm = role === 'SUPER_ADMIN' || role === 'FIELD_OFFICER';
  const canEditPlots = canEditFarm || role === 'ADMIN';
  const plots: any[] = farm.plots || [];
  const cycles: any[] = farm.cropCycles || [];
  const currentVarieties = riceVarieties(farm);
  const plotAcres = plots.reduce((s, p) => s + (p.sizeAcres || 0), 0);

  return (
    <div>
      <button className="btn-secondary" style={{ marginBottom: '16px', fontSize: '12px' }} onClick={() => router.back()}>← Back</button>

      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, var(--accent), var(--green-400))', borderRadius: '9999px' }} />
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)' }}>{farm.farmCode}</h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginLeft: '14px' }}>
            {farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName} · ${farm.farmer.controlNumber}` : 'No farmer linked'}
            {farm.name ? ` · ${farm.name}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`badge ${farm.isVerified ? 'badge-green' : 'badge-gold'}`}>{farm.isVerified ? '✓ Verified' : '⏳ Pending'}</span>
          <span className={`badge ${hasBoundary ? 'badge-green' : 'badge-gray'}`}>{hasBoundary ? 'Boundary mapped' : 'Not mapped'}</span>
          <span className={`badge ${farm.hasIrrigation ? 'badge-blue' : 'badge-gold'}`}>{productionLabel(farm)}</span>
          {canEditFarm && <button className="btn-primary" style={{ fontSize: 12, padding: '8px 14px' }} onClick={() => setEditing(true)}>Edit farm</button>}
        </div>
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)', fontSize: '13px' }}>{message}</div>}

      <Section title="Location">
        <Attr label="Farm ID" value={farm.farmCode} />
        <Attr label="Farmer" value={farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName}` : undefined} />
        <Attr label="AMCOS" value={farm.mamcos?.name} />
        <Attr label="Region" value={farm.region} />
        <Attr label="District" value={farm.district} />
        <Attr label="Ward" value={farm.ward} />
        <Attr label="Village" value={farm.village} />
        <Attr label="Sub-village" value={farm.subVillage} />
        <Attr label="Plot / block / section" value={[farm.plotNumber, farm.blockNumber, farm.section].filter(Boolean).join(' / ') || undefined} />
        <Attr label="Full location" value={locationLabel(farm)} />
        <Attr label="GPS coordinates" value={farm.centerLatitude != null ? fmtCoord(farm.centerLatitude, farm.centerLongitude) : undefined} />
        <Attr label="Accessibility" value={farm.accessibility} />
      </Section>

      <Section title="Size">
        <Attr label="Farm size" value={fmtHa(farm.socialHectares)} />
        <Attr label="Measured size" value={farm.actualAcres ? `${farm.actualAcres} ac (${fmtHa(acresToHectares(farm.actualAcres))})` : undefined} />
        <Attr label="Plots" value={`${plots.length}`} />
        <Attr label="Total plot size" value={plotAcres ? `${plotAcres.toFixed(2)} ac (${fmtHa(totalPlotHectares(farm))})` : undefined} />
        <Attr label="Grade" value={farm.grade} />
      </Section>

      <Section title="Land ownership & tenure">
        <Attr label="Ownership" value={farm.ownershipType ? OWNERSHIP_LABELS[farm.ownershipType] || farm.ownershipType : undefined} />
        <Attr label="Land tenure" value={farm.landTenure} />
        <Attr label="Landowner" value={farm.ownerName} />
        <Attr label="Landowner phone" value={farm.ownerPhone} />
        <Attr label="Currently leased" value={farm.isLeased ? 'Yes' : 'No'} />
        <Attr label="Available for rent" value={farm.isAvailableForRent ? 'Yes' : 'No'} />
      </Section>
      {(farm.ownerships?.length > 0 || farm.leases?.length > 0) && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 16, overflowX: 'auto' }}>
          {farm.ownerships?.length > 0 && (
            <>
              <h3 style={h3}>Legal ownership records</h3>
              <table className="data-table">
                <thead><tr><th>Owner</th><th>Phone</th><th>Source</th><th>Confirmation</th><th>Confirmed</th></tr></thead>
                <tbody>
                  {farm.ownerships.map((o: any) => (
                    <tr key={o.id}>
                      <td>{o.ownerFarmer ? `${o.ownerFarmer.firstName} ${o.ownerFarmer.lastName}` : o.ownerName || '—'}</td>
                      <td>{o.ownerPhone || '—'}</td>
                      <td>{String(o.source).replace(/_/g, ' ')}</td>
                      <td>{String(o.confirmationStatus)}</td>
                      <td>{dateFmt(o.confirmedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {farm.leases?.length > 0 && (
            <>
              <h3 style={{ ...h3, marginTop: farm.ownerships?.length ? 18 : 0 }}>Recent leases</h3>
              <table className="data-table">
                <thead><tr><th>Renter</th><th>Phone</th><th>Season</th><th>From</th><th>To</th><th>Status</th></tr></thead>
                <tbody>
                  {farm.leases.map((l: any) => (
                    <tr key={l.id}>
                      <td>{l.renterName || '—'}</td>
                      <td>{l.renterPhone}</td>
                      <td>{l.farmingSeason?.name || '—'}</td>
                      <td>{dateFmt(l.leaseStartDate)}</td>
                      <td>{dateFmt(l.leaseEndDate)}</td>
                      <td>{String(l.status).replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <Section title="Water & production system">
        <Attr label="Production system" value={productionLabel(farm)} />
        <Attr label="Water source" value={farm.waterSource} />
        <Attr label="Irrigation method" value={farm.irrigationMethod} />
        <Attr label="Near road" value={farm.nearRoad ? 'Yes' : 'No'} />
      </Section>

      <Section title="Soil">
        <Attr label="Soil type" value={farm.soilType} />
        <Attr label="Soil fertility" value={farm.soilFertility} />
        <Attr label="Soil condition" value={farm.soilCondition} />
        <Attr label="Previous crops" value={farm.previousCrops?.length ? farm.previousCrops.join(', ') : undefined} />
      </Section>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={headRow}>
          <h3 style={h3}>Rice varieties & crop cycles ({cycles.length})</h3>
          {canEditPlots && <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setCycleForm((f) => ({ ...f, open: !f.open }))}>{cycleForm.open ? 'Cancel' : '+ Add variety'}</button>}
        </div>
        <p style={{ fontSize: 13, color: 'var(--neutral-500)', margin: '0 0 12px' }}>
          Current rice variety: <strong style={{ color: 'var(--text-primary)' }}>{currentVarieties.join(', ') || '—'}</strong>
        </p>
        {cycleForm.open && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
            <label className="form-label">Rice variety
              <select className="input-field" value={cycleForm.varietyId} onChange={(e) => setCycleForm((f) => ({ ...f, varietyId: e.target.value }))}>
                <option value="">Select variety…</option>
                {varieties.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="form-label">Season<input className="input-field" placeholder="2026/2027 Masika" value={cycleForm.season} onChange={(e) => setCycleForm((f) => ({ ...f, season: e.target.value }))} /></label>
            <label className="form-label">Planting date<input className="input-field" type="date" value={cycleForm.plantingDate} onChange={(e) => setCycleForm((f) => ({ ...f, plantingDate: e.target.value }))} /></label>
            <div style={{ alignSelf: 'end' }}><button className="btn-primary" onClick={addCrop}>Save crop cycle</button></div>
          </div>
        )}
        {cycles.length === 0 ? (
          <p style={mutedText}>No crop cycles recorded for this farm yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Season</th><th>Rice variety</th><th>Planted</th><th>Expected harvest</th><th className="num">Est. yield (kg)</th><th className="num">Actual yield (kg)</th><th>Status</th></tr></thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id}>
                    <td>{c.season}</td>
                    <td>{c.riceVariety || '—'}</td>
                    <td>{dateFmt(c.plantingDate)}</td>
                    <td>{dateFmt(c.expectedHarvest)}</td>
                    <td className="num">{c.estimatedYieldKg?.toLocaleString() ?? '—'}</td>
                    <td className="num">{c.actualYieldKg?.toLocaleString() ?? '—'}</td>
                    <td>{String(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={h3}>Farm boundary map</h3>
        {hasMap ? (
          <>
            <FarmBoundaryMap farm={farm} plots={plots} />
            <p style={{ ...mutedText, marginTop: 8 }}>
              Green: farm boundary · Blue: plot boundaries · Purple: plot GPS points
              {!hasBoundary && ' · No walked boundary yet — showing the GPS point only.'}
            </p>
          </>
        ) : (
          <p style={mutedText}>No GPS coordinates or boundary on file. A field officer can map the boundary from the mobile app, or enter coordinates by editing the farm.</p>
        )}
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={headRow}>
          <h3 style={h3}>Plots ({plots.length})</h3>
          {canEditPlots && <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setPlotEditor({})}>+ Add plot</button>}
        </div>
        {plots.length === 0 ? (
          <p style={mutedText}>No plots recorded for this farm yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Plot ID</th><th>Name</th><th className="num">Size (acres)</th><th className="num">Size (ha)</th><th>Irrigation</th><th>Soil</th><th>GPS</th><th>Stage</th><th></th></tr></thead>
              <tbody>
                {plots.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.plotCode}</strong></td>
                    <td>{p.name || '—'}</td>
                    <td className="num">{p.sizeAcres ?? '—'}</td>
                    <td className="num">{p.sizeAcres ? acresToHectares(p.sizeAcres).toFixed(2) : '—'}</td>
                    <td>{p.irrigationStatus || '—'}</td>
                    <td>{p.soilCondition || '—'}</td>
                    <td>{p.boundaryCoordinates ? 'Boundary' : p.centerLatitude != null ? fmtCoord(p.centerLatitude, p.centerLongitude) : '—'}</td>
                    <td>{p.currentStage || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canEditPlots && (
                        <>
                          <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px', marginRight: 6 }} onClick={() => setPlotEditor({ plot: p })}>Edit</button>
                          <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => removePlot(p)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={headRow}>
          <h3 style={h3}>Farm photographs ({photos.length})</h3>
          {canEditPlots && (
            <label className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? 'Uploading…' : '+ Add photos'}
              <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={(e) => { uploadPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {photos.length === 0 ? (
          <p style={mutedText}>No photos uploaded yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {photos.map((p) => (
              <button key={p.id} type="button" onClick={() => setLightbox(p)} style={{ padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }} aria-label={p.caption || 'Open farm photo'}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || 'Farm photo'} style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--neutral-200)' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {canApprove && (
        <div className="glass-card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Boundary review</h3>
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)', marginBottom: '14px' }}>
            {hasBoundary
              ? 'Review the GPS boundary and evidence above, then approve this as the official AMCOS farm boundary.'
              : 'Waiting for a Field Officer to map this farm’s boundary before it can be approved.'}
          </p>
          <button className="btn-primary" onClick={approveBoundary} disabled={!hasBoundary || approving}>
            {approving ? 'Approving…' : 'Approve official boundary'}
          </button>
        </div>
      )}

      {editing && <FarmEditorModal farm={farm} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setMessage('Farm updated.'); load(); }} />}
      {plotEditor && <PlotEditorModal farmId={id} plot={plotEditor.plot} onClose={() => setPlotEditor(null)} onSaved={() => { setPlotEditor(null); load(); }} />}
      {lightbox && (
        <Modal
          title={lightbox.caption || 'Farm photo'}
          width="820px"
          onClose={() => setLightbox(null)}
          footer={
            <>
              {canEditPlots && <button className="btn-secondary" onClick={() => removePhoto(lightbox)}>Delete photo</button>}
              <button className="btn-primary" onClick={() => setLightbox(null)}>Close</button>
            </>
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.caption || 'Farm photo'} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: 10 }} />
        </Modal>
      )}
    </div>
  );
}

const h3: React.CSSProperties = { fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 };
const headRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 };
const mutedText: React.CSSProperties = { fontSize: '13px', color: 'var(--neutral-500)' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
      <h3 style={{ ...h3, marginBottom: 14 }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>{children}</div>
    </div>
  );
}

function Attr({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--neutral-500)', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{value || '—'}</div>
    </div>
  );
}
