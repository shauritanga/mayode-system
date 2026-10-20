import { BadRequestException } from '@nestjs/common';
import { cleanBoundary } from './farm-ops.service';

const square = [[34.1, -8.9], [34.2, -8.9], [34.2, -8.8], [34.1, -8.8]];

describe('cleanBoundary', () => {
  it('leaves an omitted boundary alone and lets a null one clear it', () => {
    expect(cleanBoundary(undefined)).toBeUndefined();
    expect(cleanBoundary(null)).toBeNull();
  });
  it('closes an open ring', () => {
    const r = cleanBoundary({ type: 'Polygon', coordinates: [square] });
    expect(r!.coordinates[0]).toHaveLength(5);
    expect(r!.coordinates[0][4]).toEqual(square[0]);
  });
  it('keeps a ring that is already closed', () => {
    expect(cleanBoundary({ type: 'Polygon', coordinates: [[...square, square[0]]] })!.coordinates[0]).toHaveLength(5);
  });
  it('rejects fewer than three corners, a wrong shape, or points off the globe', () => {
    for (const bad of [{ type: 'Polygon', coordinates: [[[34, -8], [35, -8]]] }, { type: 'Point', coordinates: [34, -8] }, 'x', { type: 'Polygon', coordinates: [[[200, -8], [35, -8], [35, -9]]] }]) {
      expect(() => cleanBoundary(bad)).toThrow(BadRequestException);
    }
  });
});
