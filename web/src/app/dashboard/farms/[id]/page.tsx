'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { farmsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

interface FarmDetail {
  id: string;
  farmCode: string;
  name?: string;
  village?: string;
  plotNumber?: string;
  blockNumber?: string;
  section?: string;
  ward?: string;
  district?: string;
  region?: string;
  socialHectares: number;
  actualAcres?: number;
  grade: string;
  isVerified: boolean;
  isLeased: boolean;
  hasIrrigation: boolean;
  soilType?: string;
  waterSource?: string;
  centerLatitude?: number;
  centerLongitude?: number;
  boundaryCoordinates?: unknown;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  mamcos?: { name: string };
}
interface Photo { id: string; url: string; caption?: string }

export default function FarmDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const role = useAuthStore((state) => state.user?.role);

  const [farm, setFarm] = useState<FarmDetail | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      farmsApi.getOne(id).then((res) => setFarm(res.data)),
      farmsApi.listPhotos(id).then((res) => setPhotos(res.data || [])).catch(() => setPhotos([])),
    ]).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { if (id) load(); }, [id]);

  const approveBoundary = async () => {
    setApproving(true);
    setMessage('');
    try {
      await farmsApi.reviewBoundary(id);
      setMessage('Boundary approved. This is now the official AMCOS farm boundary.');
      load();
    } catch (e: any) {
      setMessage(e?.response?.data?.message || 'Could not approve boundary. Map the boundary first.');
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Loading farm…</div>;
  }
  if (!farm) {
    return <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>Farm not found.</div>;
  }

  const hasBoundary = !!farm.boundaryCoordinates && farm.centerLatitude != null;
  const canApprove = (role === 'MAMCOS_SECRETARY' || role === 'SUPER_ADMIN') && !farm.isVerified;

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
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span className={`badge ${farm.isVerified ? 'badge-green' : 'badge-gold'}`}>{farm.isVerified ? '✓ Verified' : '⏳ Pending'}</span>
          <span className={`badge ${hasBoundary ? 'badge-green' : 'badge-gray'}`}>{hasBoundary ? 'Boundary mapped' : 'Not mapped'}</span>
        </div>
      </div>

      {message && <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', color: 'var(--accent)', fontSize: '13px' }}>{message}</div>}

      <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>Farm details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px' }}>
          <Attr label="AMCOS" value={farm.mamcos?.name} />
          <Attr label="Social hectares" value={`${farm.socialHectares} ha`} />
          <Attr label="Actual acres" value={farm.actualAcres ? `${farm.actualAcres} ac` : undefined} />
          <Attr label="Grade" value={farm.grade} />
          <Attr label="Plot number" value={farm.plotNumber} />
          <Attr label="Block" value={farm.blockNumber} />
          <Attr label="Section" value={farm.section} />
          <Attr label="Ward" value={farm.ward} />
          <Attr label="District" value={farm.district} />
          <Attr label="Region" value={farm.region} />
          <Attr label="Village" value={farm.village} />
          <Attr label="Irrigation" value={farm.hasIrrigation ? 'Yes' : 'No'} />
          <Attr label="Soil type" value={farm.soilType} />
          <Attr label="Water source" value={farm.waterSource} />
          <Attr label="GPS center" value={farm.centerLatitude != null ? `${farm.centerLatitude.toFixed(5)}, ${farm.centerLongitude?.toFixed(5)}` : undefined} />
        </div>
      </div>

      <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>Photos & survey evidence ({photos.length})</h3>
        {photos.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>No photos uploaded yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt={p.caption || 'Farm photo'} style={{ width: '96px', height: '96px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--neutral-200)' }} />
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
