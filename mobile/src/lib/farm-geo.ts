/**
 * Shared farm mapping helpers — "mapped" means a walked GPS boundary polygon,
 * not just a seed/import center pin.
 */

export type FarmGeoLike = {
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  boundaryCoordinates?: any;
};

/** Normalize Feature / GeometryCollection-ish payloads down to a Polygon-like object. */
export function asPolygonGeometry(raw: any): { type?: string; coordinates?: number[][][] } | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'Feature' && raw.geometry) return asPolygonGeometry(raw.geometry);
  if (raw.type === 'FeatureCollection' && Array.isArray(raw.features) && raw.features[0]) {
    return asPolygonGeometry(raw.features[0]);
  }
  if (Array.isArray(raw.coordinates?.[0]) && raw.coordinates[0].length >= 3) return raw;
  if (raw.geometry) return asPolygonGeometry(raw.geometry);
  return null;
}

export function isFarmBoundaryMapped(farm: FarmGeoLike | null | undefined): boolean {
  if (!farm) return false;
  const poly = asPolygonGeometry(farm.boundaryCoordinates);
  const ring = poly?.coordinates?.[0];
  return Array.isArray(ring) && ring.length >= 3;
}

export function hasFarmCenterPin(farm: FarmGeoLike | null | undefined): boolean {
  return farm?.centerLatitude != null && farm?.centerLongitude != null;
}

/** The point to use for the farm itself: its saved centre pin, else the middle of its boundary. */
export function farmPoint(farm: FarmGeoLike | null | undefined): { latitude: number; longitude: number } | null {
  if (!farm) return null;
  if (hasFarmCenterPin(farm)) return { latitude: Number(farm.centerLatitude), longitude: Number(farm.centerLongitude) };
  const ring = asPolygonGeometry(farm.boundaryCoordinates)?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;
  const lon = ring.reduce((a, c) => a + Number(c[0]), 0) / ring.length;
  const lat = ring.reduce((a, c) => a + Number(c[1]), 0) / ring.length;
  return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
}
