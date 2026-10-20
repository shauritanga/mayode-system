'use client';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { MapContainer, Polygon, CircleMarker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ClickToZoom, MapBase } from '@/components/MapBase';
import 'leaflet/dist/leaflet.css';
import { asPolygonGeometry, hasFarmCenterPin, isFarmBoundaryMapped, type FarmGeoLike } from '@/lib/farm-geo';
import { locationLabel, productionLabel, riceVarieties, tenureLabel } from '@/lib/farm-format';

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
  hasIrrigation?: boolean;
  ownershipType?: string | null;
  landTenure?: string | null;
  region?: string | null;
  district?: string | null;
  ward?: string | null;
  village?: string | null;
  subVillage?: string | null;
  cropCycles?: { riceVariety?: string | null; status?: string | null }[];
  /** When given, each plot with a walked boundary (or a GPS point) is drawn on top of its farm. */
  plots?: (FarmGeoLike & { id?: string; plotCode?: string; name?: string | null; sizeAcres?: number | null })[];
  farmer?: { firstName: string; lastName: string; controlNumber: string };
}

// Mbarali, Mbeya — the cooperative's home district — as a sensible default center.
const DEFAULT_CENTER: [number, number] = [-8.9, 34.3];

const VERIFIED = '#34d399';
const PENDING = '#fbbf24';
const PIN_ONLY = '#60a5fa';

function boundaryLatLngs(farm: MappableFarm): [number, number][] | null {
  const poly = asPolygonGeometry(farm.boundaryCoordinates);
  const ring = poly?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  return ring.map(([lng, lat]) => [lat, lng]);
}

function FitToFarms({ points }: { points: [number, number][] }) {
  const map = useMap();
  // `points` is rebuilt on every render; only re-fit when the farms themselves change, so opening a popup never moves the map.
  const key = points.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * A farm of a few hectares is a speck when the map shows a whole district. While zoomed out, each farm with a
 * boundary also gets a pin at its middle so it can be seen and clicked; the pins go away once the shape is big enough to see.
 */
function CentrePins({ polygons, popup, colorOf }: { polygons: { farm: MappableFarm; positions: [number, number][] }[]; popup: (farm: MappableFarm) => ReactNode; colorOf: (farm: MappableFarm) => string }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  if (zoom >= 15) return null;
  return (
    <>
      {polygons.map(({ farm, positions }) => {
        const centre: [number, number] = [positions.reduce((t, p) => t + p[0], 0) / positions.length, positions.reduce((t, p) => t + p[1], 0) / positions.length];
        return (
          <CircleMarker key={`pin-${farm.id}`} center={centre} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: colorOf(farm), fillOpacity: 0.95 }}>
            <Popup>{popup(farm)}</Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function FarmPopup({ farm }: { farm: MappableFarm }) {
  const varieties = riceVarieties(farm);
  return (
    <div style={{ minWidth: 200, lineHeight: 1.5 }}>
      <strong>{farm.farmCode}</strong>
      <br />
      {farm.farmer ? `${farm.farmer.firstName} ${farm.farmer.lastName}` : 'No farmer linked'}
      <br />
      {locationLabel(farm)}
      <br />
      {farm.socialHectares} ha · {productionLabel(farm)}
      <br />
      Tenure: {tenureLabel(farm)}
      <br />
      Rice: {varieties.length ? varieties.join(', ') : '—'}
      <br />
      {farm.isVerified ? 'Verified' : 'Pending verification'}
      <br />
      <a href={`/dashboard/farms/${farm.id}`}>Open farm →</a>
    </div>
  );
}

const legendDot = (color: string) => (
  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: color, marginRight: 6 }} />
);

/** `renderPopup` replaces the default farmer-oriented popup, for farms that have no farmer (Mayode's own). */
export default function FarmsMap({ farms, renderPopup, ownFarms = false }: { farms: MappableFarm[]; renderPopup?: (farm: MappableFarm) => ReactNode; ownFarms?: boolean }) {
  const popup = (farm: MappableFarm) => (renderPopup ? renderPopup(farm) : <FarmPopup farm={farm} />);
  const polygons = farms
    .filter(isFarmBoundaryMapped)
    .map((farm) => ({ farm, positions: boundaryLatLngs(farm) }))
    .filter((entry): entry is { farm: MappableFarm; positions: [number, number][] } => entry.positions !== null);
  const polygonIds = new Set(polygons.map((p) => p.farm.id));
  // Registered farms with a GPS point but no walked boundary yet are shown as pins so every located farm is on the map.
  const pins = farms.filter((f) => !polygonIds.has(f.id) && hasFarmCenterPin(f));

  const points: [number, number][] = [
    ...polygons.flatMap((p) => p.positions),
    ...pins.map((f) => [f.centerLatitude as number, f.centerLongitude as number] as [number, number]),
  ];
  const missing = farms.length - polygons.length - pins.length;

  if (points.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--neutral-500)', fontSize: '14px' }}>
        None of these farms has GPS coordinates or a walked boundary yet.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer center={points[0] || DEFAULT_CENTER} zoom={12} scrollWheelZoom={false} style={{ height: 520, width: '100%', borderRadius: 12 }}>
        <MapBase />
        <ClickToZoom />
        <FitToFarms points={points} />
        {polygons.map(({ farm, positions }) => {
          const color = farm.isVerified ? VERIFIED : PENDING;
          return (
            <Polygon key={farm.id} positions={positions} pathOptions={{ color, fillColor: color, fillOpacity: 0.28, weight: 3 }}>
              <Popup>{popup(farm)}</Popup>
            </Polygon>
          );
        })}
        <CentrePins polygons={polygons} popup={popup} colorOf={(farm) => (ownFarms || farm.isVerified ? VERIFIED : PENDING)} />
        {pins.map((farm) => (
          <CircleMarker
            key={farm.id}
            center={[farm.centerLatitude as number, farm.centerLongitude as number]}
            radius={7}
            pathOptions={{ color: '#fff', weight: 2, fillColor: PIN_ONLY, fillOpacity: 0.9 }}
          >
            <Popup>{popup(farm)}</Popup>
          </CircleMarker>
        ))}
        {farms.flatMap((farm) => (farm.plots ?? []).map((plot) => {
          const ring = boundaryLatLngs({ ...farm, boundaryCoordinates: plot.boundaryCoordinates });
          const label = plot.name ?? plot.plotCode ?? 'Plot';
          const key = plot.id ?? `${farm.id}-${plot.plotCode}`;
          if (ring) return <Polygon key={key} positions={ring} pathOptions={{ color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.25, weight: 2 }}><Tooltip sticky>{farm.farmCode} · {label}</Tooltip></Polygon>;
          if (!hasFarmCenterPin(plot) || (plot.centerLatitude === farm.centerLatitude && plot.centerLongitude === farm.centerLongitude)) return null;
          return <CircleMarker key={key} center={[plot.centerLatitude as number, plot.centerLongitude as number]} radius={5} pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#22d3ee', fillOpacity: 0.9 }}><Tooltip>{farm.farmCode} · {label}</Tooltip></CircleMarker>;
        }))}
      </MapContainer>
      <div
        style={{
          position: 'absolute', left: 12, bottom: 12, zIndex: 500, background: 'var(--surface-1)', color: 'var(--text-1)',
          border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '8px 12px', fontSize: 12, lineHeight: 1.7,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {ownFarms ? (
          <div>{legendDot(VERIFIED)}Farm boundary ({polygons.length})</div>
        ) : (
          <>
            <div>{legendDot(VERIFIED)}Verified boundary ({polygons.filter((p) => p.farm.isVerified).length})</div>
            <div>{legendDot(PENDING)}Boundary pending ({polygons.filter((p) => !p.farm.isVerified).length})</div>
          </>
        )}
        <div>{legendDot(PIN_ONLY)}GPS point only ({pins.length})</div>
        {farms.some((f) => f.plots?.length) && <div>{legendDot('#22d3ee')}Plots</div>}
        {missing > 0 && <div style={{ color: 'var(--text-3)' }}>{missing} farm{missing === 1 ? '' : 's'} without GPS</div>}
      </div>
    </div>
  );
}
