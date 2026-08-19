/**
 * Shared farm mapping helpers — "mapped" means a walked GPS boundary polygon,
 * not just a seed/import center pin. Keep in sync with mobile/src/lib/farm-geo.ts.
 */

export type FarmGeoLike = {
  centerLatitude?: number | null;
  centerLongitude?: number | null;
  boundaryCoordinates?: unknown;
};

/** Normalize Feature / GeometryCollection-ish payloads down to a Polygon-like object. */
export function asPolygonGeometry(
  raw: any,
): { type?: string; coordinates?: number[][][] } | null {
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
