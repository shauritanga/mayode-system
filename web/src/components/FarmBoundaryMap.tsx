'use client';
import { useEffect } from 'react';
import { MapContainer, Polygon, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ClickToZoom, MapBase } from '@/components/MapBase';
import 'leaflet/dist/leaflet.css';
import { asPolygonGeometry, hasFarmCenterPin, type FarmGeoLike } from '@/lib/farm-geo';

type PlotGeo = FarmGeoLike & { id: string; plotCode: string; name?: string | null; sizeAcres?: number | null };

const toLatLngs = (raw: unknown): [number, number][] | null => {
  const ring = asPolygonGeometry(raw)?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  return ring.map(([lng, lat]) => [lat, lng]);
};

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 17 });
  }, [map, points]);
  return null;
}

/** One farm's walked boundary (green) with its plots (blue) drawn on top. */
export default function FarmBoundaryMap({ farm, plots }: { farm: FarmGeoLike & { farmCode: string }; plots: PlotGeo[] }) {
  const boundary = toLatLngs(farm.boundaryCoordinates);
  const plotShapes = plots
    .map((plot) => ({ plot, positions: toLatLngs(plot.boundaryCoordinates) }))
    .filter((p): p is { plot: PlotGeo; positions: [number, number][] } => p.positions !== null);
  const plotPins = plots.filter((p) => !toLatLngs(p.boundaryCoordinates) && hasFarmCenterPin(p));
  const center = hasFarmCenterPin(farm) ? ([farm.centerLatitude, farm.centerLongitude] as [number, number]) : null;

  const points: [number, number][] = [
    ...(boundary || []),
    ...plotShapes.flatMap((p) => p.positions),
    ...plotPins.map((p) => [p.centerLatitude as number, p.centerLongitude as number] as [number, number]),
    ...(!boundary && center ? [center] : []),
  ];
  if (points.length === 0) return null;

  return (
    <MapContainer center={points[0]} zoom={15} scrollWheelZoom={false} style={{ height: 380, width: '100%', borderRadius: 12 }}>
      <MapBase />
      <ClickToZoom />
      <Fit points={points} />
      {boundary && (
        <Polygon positions={boundary} pathOptions={{ color: '#facc15', fillColor: '#facc15', fillOpacity: 0.18, weight: 3 }}>
          <Tooltip sticky>{farm.farmCode} boundary</Tooltip>
        </Polygon>
      )}
      {!boundary && center && (
        <CircleMarker center={center} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#60a5fa', fillOpacity: 0.95 }}>
          <Tooltip>{farm.farmCode} (GPS point)</Tooltip>
        </CircleMarker>
      )}
      {plotShapes.map(({ plot, positions }) => (
        <Polygon key={plot.id} positions={positions} pathOptions={{ color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.25, weight: 2 }}>
          <Tooltip sticky>{plot.plotCode}{plot.sizeAcres ? ` · ${plot.sizeAcres} ac` : ''}</Tooltip>
        </Polygon>
      ))}
      {plotPins.map((plot) => (
        <CircleMarker
          key={plot.id}
          center={[plot.centerLatitude as number, plot.centerLongitude as number]}
          radius={6}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#c084fc', fillOpacity: 0.95 }}
        >
          <Tooltip>{plot.plotCode}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
