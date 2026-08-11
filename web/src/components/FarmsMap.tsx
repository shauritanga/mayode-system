'use client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default Leaflet marker icons reference bundler-relative asset paths that break under Next.js;
// point them at unpkg's hosted copies instead of shipping/wiring our own icon assets.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface MappableFarm {
  id: string;
  farmCode: string;
  name?: string;
  socialHectares: number;
  isVerified: boolean;
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
}

// Mbarali, Mbeya — the cooperative's home district — as a sensible default center.
const DEFAULT_CENTER: [number, number] = [-8.9, 34.3];

export default function FarmsMap({ farms }: { farms: MappableFarm[] }) {
  const located = farms.filter((f) => f.centerLatitude != null && f.centerLongitude != null);
  const center: [number, number] = located.length
    ? [located[0].centerLatitude as number, located[0].centerLongitude as number]
    : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={located.length ? 10 : 8} style={{ height: 420, width: '100%', borderRadius: 12 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((farm) => (
        <Marker key={farm.id} position={[farm.centerLatitude as number, farm.centerLongitude as number]}>
          <Popup>
            <strong>{farm.farmCode}</strong><br />
            {farm.name || 'Unnamed farm'}<br />
            {farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName}` : 'No farmer linked'}<br />
            {farm.socialHectares} ha · {farm.isVerified ? 'Verified' : 'Pending verification'}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
