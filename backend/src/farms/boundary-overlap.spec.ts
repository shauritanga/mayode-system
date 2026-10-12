import { BadRequestException } from '@nestjs/common';
import {
  assertValidBoundary,
  findOverlap,
  overlapAreaM2,
  toPolygon,
} from './boundary-overlap';

// ~100 m squares near Mbeya (0.0009° ≈ 100 m)
const sq = (x: number, y: number, size = 0.0009) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});
const farm = (id: string, g: unknown) => ({
  id,
  farmCode: id,
  boundaryCoordinates: g,
});

describe('farm boundary overlap', () => {
  const base = toPolygon(sq(34.5, -8.9))!;

  it('treats farms that only share an edge as not overlapping', () => {
    const next = toPolygon(sq(34.5009, -8.9))!;
    expect(overlapAreaM2(base, next)).toBeLessThan(1);
    expect(findOverlap(base, [farm('F2', sq(34.5009, -8.9))])).toBeNull();
  });

  it('allows farms that are apart', () => {
    expect(findOverlap(base, [farm('F2', sq(34.6, -8.9))])).toBeNull();
  });

  it('blocks farms that share land', () => {
    const hit = findOverlap(base, [farm('F2', sq(34.5005, -8.9))]);
    expect(hit?.farm.id).toBe('F2');
    expect(hit!.areaM2).toBeGreaterThan(4000); // ~half of a 1 ha square
  });

  it('blocks a boundary drawn inside another farm', () => {
    expect(
      findOverlap(toPolygon(sq(34.5002, -8.8998, 0.0002))!, [
        farm('F2', sq(34.5, -8.9)),
      ]),
    ).not.toBeNull();
  });

  it('rejects boundaries that are not closed polygons', () => {
    expect(() =>
      assertValidBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [1, 1],
            [2, 2],
          ],
        ],
      }),
    ).toThrow(BadRequestException);
    expect(() => assertValidBoundary(null)).toThrow(BadRequestException);
  });

  it('accepts a Feature wrapper', () => {
    expect(
      assertValidBoundary({ type: 'Feature', geometry: sq(34.5, -8.9) }),
    ).toBeTruthy();
  });
});
