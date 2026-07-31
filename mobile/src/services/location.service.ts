import * as Location from 'expo-location';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Request foreground location permission. Returns true if granted. */
export async function ensureLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** Capture a single high-accuracy GPS point (e.g. residence / farm center). */
export async function getCurrentPoint(): Promise<LatLng> {
  const granted = await ensureLocationPermission();
  if (!granted) {
    throw new Error('Location permission denied');
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

/** Compute the centroid of a list of points. */
export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) return { latitude: 0, longitude: 0 };
  const sum = points.reduce(
    (acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: sum.latitude / points.length,
    longitude: sum.longitude / points.length,
  };
}

/**
 * Approximate polygon area in acres using the shoelace formula on a local
 * equirectangular projection. Good enough for field plot sizing.
 */
export function polygonAreaAcres(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const R = 6378137; // Earth radius (m)
  const lat0 = (points[0].latitude * Math.PI) / 180;
  const toXY = (p: LatLng) => ({
    x: ((p.longitude * Math.PI) / 180) * R * Math.cos(lat0),
    y: ((p.latitude * Math.PI) / 180) * R,
  });
  const xy = points.map(toXY);
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    area += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
  }
  const sqMeters = Math.abs(area) / 2;
  return Number((sqMeters / 4046.8564224).toFixed(3)); // m² → acres
}

/**
 * Build a GeoJSON Polygon from captured points (auto-closes the ring).
 * GeoJSON uses [longitude, latitude] order.
 */
export function toGeoJsonPolygon(points: LatLng[]): {
  type: 'Polygon';
  coordinates: number[][][];
} {
  const ring = points.map((p) => [p.longitude, p.latitude]);
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Great-circle distance between two points, in meters (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ray-casting point-in-polygon test against a GeoJSON Polygon's outer ring
 * (holes, if any, are ignored — farm boundaries are simple polygons).
 */
export function isPointInPolygon(point: LatLng, polygon: GeoJsonPolygon): boolean {
  const ring = polygon?.coordinates?.[0];
  if (!ring || ring.length < 3) return false;
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** A farm hasn't had its boundary walked yet — fall back to a radius around its center point. */
export const FARM_CENTER_FALLBACK_RADIUS_M = 500;

export type FarmGeofenceResult =
  | { status: 'inside' }
  | { status: 'outside'; distanceM?: number }
  | { status: 'unmapped' };

/**
 * Check whether a device position is on a given farm: precise polygon test
 * if the boundary has been walked, otherwise a generous radius around the
 * farm's center point, otherwise unverifiable (farm has no GPS data yet).
 */
export function checkWithinFarm(
  point: LatLng,
  farm: { boundaryCoordinates?: GeoJsonPolygon | null; centerLatitude?: number | null; centerLongitude?: number | null },
): FarmGeofenceResult {
  const boundary = farm.boundaryCoordinates;
  if (boundary && (boundary.coordinates?.[0]?.length ?? 0) >= 3) {
    return isPointInPolygon(point, boundary) ? { status: 'inside' } : { status: 'outside' };
  }
  if (farm.centerLatitude != null && farm.centerLongitude != null) {
    const d = distanceMeters(point, { latitude: farm.centerLatitude, longitude: farm.centerLongitude });
    return d <= FARM_CENTER_FALLBACK_RADIUS_M ? { status: 'inside' } : { status: 'outside', distanceM: d };
  }
  return { status: 'unmapped' };
}
