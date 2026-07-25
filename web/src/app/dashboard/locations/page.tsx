'use client';
import { useEffect, useState } from 'react';
import { locationsApi } from '@/lib/api';

interface Region { id: string; name: string; _count?: { districts: number } }
interface District { id: string; name: string; _count?: { wards: number } }
interface Ward { id: string; name: string }

export default function LocationsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    locationsApi.getRegions()
      .then(res => setRegions(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleRegionClick = async (region: Region) => {
    setSelectedRegion(region);
    setSelectedDistrict(null);
    setDistricts([]);
    setWards([]);
    setLoadingDistricts(true);
    try {
      const res = await locationsApi.getDistricts(region.id);
      setDistricts(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingDistricts(false); }
  };

  const handleDistrictClick = async (district: District) => {
    setSelectedDistrict(district);
    setWards([]);
    setLoadingWards(true);
    try {
      const res = await locationsApi.getWards(district.id);
      setWards(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingWards(false); }
  };

  const filteredRegions = regions.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{ width: '4px', height: '26px', background: 'linear-gradient(to bottom, #10B981, #34D399)', borderRadius: '9999px' }} />
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '24px', fontWeight: 800, color: '#F9FAFB' }}>Locations</h1>
        </div>
        <p style={{ fontSize: '13px', color: '#6B7280', marginLeft: '14px' }}>Tanzania administrative boundaries — Region → District → Ward</p>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Regions', value: regions.length, color: '#10B981' },
          { label: 'Districts', value: selectedRegion ? districts.length : '—', color: '#F59E0B' },
          { label: 'Wards', value: selectedDistrict ? wards.length : '—', color: '#3B82F6' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: '16px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        {/* Regions */}
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#F9FAFB', marginBottom: '10px' }}>📍 Regions ({regions.length})</div>
            <input
              id="region-search"
              type="search"
              placeholder="Search region…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field"
              style={{ fontSize: '12px', padding: '8px 12px' }}
            />
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>Loading…</div>
            ) : filteredRegions.map(r => (
              <button
                key={r.id}
                id={`region-${r.id}`}
                onClick={() => handleRegionClick(r)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 20px',
                  background: selectedRegion?.id === r.id ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                  borderLeft: selectedRegion?.id === r.id ? '3px solid #10B981' : '3px solid transparent',
                  border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '13px', color: selectedRegion?.id === r.id ? '#10B981' : '#D1D5DB', fontWeight: selectedRegion?.id === r.id ? 600 : 400 }}>{r.name}</span>
                <span style={{ fontSize: '11px', color: '#6B7280' }}>{r._count?.districts ?? ''}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Districts */}
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#F9FAFB' }}>
              🏘 Districts {selectedRegion ? `in ${selectedRegion.name}` : ''}
              {districts.length > 0 && ` (${districts.length})`}
            </div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {!selectedRegion ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#4B5563', fontSize: '13px' }}>← Select a region</div>
            ) : loadingDistricts ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>Loading…</div>
            ) : districts.map(d => (
              <button
                key={d.id}
                id={`district-${d.id}`}
                onClick={() => handleDistrictClick(d)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 20px',
                  background: selectedDistrict?.id === d.id ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                  borderLeft: selectedDistrict?.id === d.id ? '3px solid #F59E0B' : '3px solid transparent',
                  border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '13px', color: selectedDistrict?.id === d.id ? '#F59E0B' : '#D1D5DB', fontWeight: selectedDistrict?.id === d.id ? 600 : 400 }}>{d.name}</span>
                <span style={{ fontSize: '11px', color: '#6B7280' }}>{d._count?.wards ?? ''}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Wards */}
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#F9FAFB' }}>
              🏘 Wards {selectedDistrict ? `in ${selectedDistrict.name}` : ''}
              {wards.length > 0 && ` (${wards.length})`}
            </div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {!selectedDistrict ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#4B5563', fontSize: '13px' }}>← Select a district</div>
            ) : loadingWards ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>Loading…</div>
            ) : wards.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#4B5563', fontSize: '13px' }}>No wards found.</div>
            ) : wards.map(w => (
              <div key={w.id} style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '13px', color: '#D1D5DB' }}>{w.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
