import { BadRequestException } from '@nestjs/common';
import polygonClipping from 'polygon-clipping';

type Ring = number[][];
export type Polygon = Ring[];

/**
 * Overlap smaller than this is treated as two farms touching along a shared boundary. Walked GPS edges
 * never match exactly, so a sliver this small is the same edge, not shared land.
 */
export const BOUNDARY_TOUCH_TOLERANCE_M2 = 1;

/** Reduce a Polygon / Feature / FeatureCollection to its first polygon, or null. */
export function toPolygon(raw: any): Polygon | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'FeatureCollection' && raw.features?.length)
    return toPolygon(raw.features[0]);
  if (raw.type === 'Feature') return toPolygon(raw.geometry);
  if (raw.type === 'MultiPolygon' && raw.coordinates?.length)
    return raw.coordinates[0];
  if (raw.type === 'Polygon' && Array.isArray(raw.coordinates))
    return raw.coordinates;
  return null;
}

/** A usable boundary: a closed outer ring with at least 3 distinct, finite [lng, lat] points. */
export function assertValidBoundary(raw: any): Polygon {
  const polygon = toPolygon(raw);
  const outer = polygon?.[0];
  const valid =
    Array.isArray(outer) &&
    outer.length >= 4 &&
    outer.every(
      (p) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    ) &&
    new Set(outer.map((p) => `${p[0]},${p[1]}`)).size >= 3;
  if (!valid) {
    throw new BadRequestException(
      'The boundary must be a closed polygon with at least 3 distinct GPS points.',
    );
  }
  return polygon as Polygon;
}

export function bbox(polygon: Polygon): [number, number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of polygon[0]) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
}

function bboxesTouch(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

function ringAreaM2(ring: Ring, lat0: number): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = [ring[i][0] * mPerDegLng, ring[i][1] * mPerDegLat];
    const [x2, y2] = [ring[i + 1][0] * mPerDegLng, ring[i + 1][1] * mPerDegLat];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Area in m² where two polygons share land (0 when they only touch or are apart). */
export function overlapAreaM2(a: Polygon, b: Polygon): number {
  let shared: ReturnType<typeof polygonClipping.intersection>;
  try {
    shared = polygonClipping.intersection(a as any, b as any);
  } catch {
    // A self-crossing ring cannot be measured; refuse it rather than save it.
    throw new BadRequestException(
      'The boundary crosses itself. Walk the edge again without crossing your own path.',
    );
  }
  const lat0 = (bbox(a)[1] + bbox(a)[3]) / 2;
  let total = 0;
  for (const poly of shared) {
    const [outer, ...holes] = poly;
    total += ringAreaM2(outer as Ring, lat0);
    for (const hole of holes) total -= ringAreaM2(hole as Ring, lat0);
  }
  return total;
}

export interface MappedFarm {
  id: string;
  farmCode: string;
  boundaryCoordinates: unknown;
}

/** The first mapped farm whose land the candidate shares, with the size of the overlap. */
export function findOverlap(
  candidate: Polygon,
  others: MappedFarm[],
): { farm: MappedFarm; areaM2: number } | null {
  const box = bbox(candidate);
  let worst: { farm: MappedFarm; areaM2: number } | null = null;
  for (const farm of others) {
    const polygon = toPolygon(farm.boundaryCoordinates);
    if (!polygon?.[0]?.length || !bboxesTouch(box, bbox(polygon))) continue;
    let areaM2: number;
    try {
      areaM2 = overlapAreaM2(candidate, polygon);
    } catch {
      continue; // an already-saved bad polygon must not block everyone nearby
    }
    if (
      areaM2 > BOUNDARY_TOUCH_TOLERANCE_M2 &&
      (!worst || areaM2 > worst.areaM2)
    )
      worst = { farm, areaM2 };
  }
  return worst;
}
