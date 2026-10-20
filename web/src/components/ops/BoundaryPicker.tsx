'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** A drawn corner: [latitude, longitude]. */
export type Corner = [number, number];

const DEFAULT_CENTER: Corner = [-8.9, 34.3]; // Mbarali, Mbeya

/** Approximate area in hectares of a small polygon (flat-earth is accurate enough at farm scale). */
export function areaHectares(corners: Corner[]): number {
  if (corners.length < 3) return 0;
  const lat0 = corners.reduce((s, c) => s + c[0], 0) / corners.length;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const pts = corners.map(([lat, lng]) => [lng * mPerDegLng, lat * mPerDegLat]);
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2 / 10_000;
}

export const centroid = (corners: Corner[]): Corner => [corners.reduce((s, c) => s + c[0], 0) / corners.length, corners.reduce((s, c) => s + c[1], 0) / corners.length];

/** GeoJSON Polygon (longitude first, ring closed) for the API. */
export function toPolygon(corners: Corner[]) {
  const ring = corners.map(([lat, lng]) => [lng, lat]);
  return { type: 'Polygon' as const, coordinates: [[...ring, ring[0]]] };
}

/** Corners from a stored GeoJSON polygon, without the closing point. */
export function fromPolygon(raw: any): Corner[] {
  const g = raw?.type === 'Feature' ? raw.geometry : raw;
  const ring: number[][] | undefined = g?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return [];
  return ring.slice(0, -1).map(([lng, lat]) => [lat, lng] as Corner);
}

function Clicks({ onAdd }: { onAdd: (c: Corner) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function Fit({ corners, center, focus }: { corners: Corner[]; center?: Corner | null; focus: Corner[] }) {
  const map = useMap();
  useEffect(() => {
    if (corners.length) map.fitBounds(L.latLngBounds(corners), { padding: [28, 28], maxZoom: 17 });
    else if (center) map.setView(center, 16);
    else if (focus.length) map.fitBounds(L.latLngBounds(focus), { padding: [28, 28], maxZoom: 15 });
    // Only on first show: re-fitting after every click would make the map jump while drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Click the map to place the corners of a farm, in order. Undo removes the last corner. */
/** `focus` is where to open when nothing is drawn or typed yet: the points of the farms already on the map. */
export default function BoundaryPicker({ corners, onChange, center, focus = [] }: { corners: Corner[]; onChange: (c: Corner[]) => void; center?: Corner | null; focus?: Corner[] }) {
  const ha = areaHectares(corners);
  return (
    <div>
      <MapContainer center={center ?? corners[0] ?? focus[0] ?? DEFAULT_CENTER} zoom={center || corners.length ? 16 : focus.length ? 13 : 11} style={{ height: 380, width: '100%', borderRadius: 12, cursor: 'crosshair' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit corners={corners} center={center} focus={focus} />
        <Clicks onAdd={(c) => onChange([...corners, c])} />
        {corners.length >= 3 ? <Polygon positions={corners} pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 0.2, weight: 3 }} /> : corners.length === 2 ? <Polyline positions={corners} pathOptions={{ color: '#059669', weight: 3 }} /> : null}
        {corners.map((c, i) => <CircleMarker key={i} center={c} radius={5} pathOptions={{ color: '#fff', weight: 2, fillColor: '#059669', fillOpacity: 1 }} />)}
      </MapContainer>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
        <button type="button" className="btn-secondary" disabled={!corners.length} onClick={() => onChange(corners.slice(0, -1))}>Undo last corner</button>
        <button type="button" className="btn-secondary" disabled={!corners.length} onClick={() => onChange([])}>Clear</button>
        <span style={{ color: 'var(--neutral-500)' }}>
          {corners.length < 3 ? `Click the map to place each corner of the farm in turn (${corners.length} placed, at least 3 needed).` : `${corners.length} corners · about ${ha.toFixed(ha < 10 ? 2 : 1)} ha`}
        </span>
      </div>
    </div>
  );
}
