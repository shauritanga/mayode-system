'use client';
import { MapContainer, TileLayer, Polygon, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { asPolygonGeometry, isFarmBoundaryMapped, type FarmGeoLike } from '@/lib/farm-geo';

// Default Leaflet marker icons reference bundler-relative asset paths that break under Next.js;
// point them at unpkg's hosted copies instead of shipping/wiring our own icon assets.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface MappableFarm extends FarmGeoLike {
  id: string;
  farmCode: string;
  name?: string;
  socialHectares: number;
  isVerified: boolean;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
}

// Mbarali, Mbeya — the cooperative's home district — as a sensible default center.
const DEFAULT_CENTER: [number, number] = [-8.9, 34.3];

function boundaryLatLngs(farm: MappableFarm): [number, number][] | null {
  const poly = asPolygonGeometry(farm.boundaryCoordinates);
  const ring = poly?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  return ring.map(([lng, lat]) => [lat, lng]);
}

export default function FarmsMap({ farms }: { farms: MappableFarm[] }) {
  // Only farms with a real walked GPS boundary — a center pin from a seed/import
  // isn't a mapped farm, so it doesn't belong on this map.
  const mapped = farms
    .filter(isFarmBoundaryMapped)
    .map((farm) => ({ farm, positions: boundaryLatLngs(farm) }))
    .filter((entry): entry is { farm: MappableFarm; positions: [number, number][] } => entry.positions !== null);

  const center: [number, number] = mapped.length ? mapped[0].positions[0] : DEFAULT_CENTER;

  if (mapped.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>
        No farms with a walked GPS boundary yet.
      </div>
    );
  }

  return (
    <MapContainer center={center} zoom={mapped.length ? 12 : 8} style={{ height: 420, width: '100%', borderRadius: 12 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {mapped.map(({ farm, positions }) => (
        <Polygon
          key={farm.id}
          positions={positions}
          pathOptions={{
            color: farm.isVerified ? '#059669' : '#D97706',
            fillColor: farm.isVerified ? '#059669' : '#D97706',
            fillOpacity: 0.25,
            weight: 2,
          }}
        >
          <Popup>
            <strong>{farm.farmCode}</strong><br />
            {farm.name || 'Unnamed farm'}<br />
            {farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName}` : 'No farmer linked'}<br />
            {farm.socialHectares} ha · {farm.isVerified ? 'Verified' : 'Pending verification'}
          </Popup>
        </Polygon>
      ))}
    </MapContainer>
  );
}
