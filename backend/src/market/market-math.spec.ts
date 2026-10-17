import { monthKey, priceTrends } from './market-math';

describe('priceTrends', () => {
  it('reports latest price and change against the previous reading, per commodity', () => {
    const t = priceTrends([
      { commodity: 'Paddy', price: 1000, recordedAt: new Date('2026-01-01') },
      { commodity: 'Paddy', price: 1100, recordedAt: new Date('2026-02-01') },
      { commodity: 'Paddy', price: 1050, recordedAt: new Date('2026-03-01') },
      { commodity: 'Rice', price: 2500, recordedAt: new Date('2026-03-01') },
    ]);
    const paddy = t.find((x) => x.commodity === 'Paddy')!;
    expect(paddy).toMatchObject({ latest: 1050, previous: 1100, changePct: -4.5, readings: 3 });
    expect(paddy.series.map((s) => s.price)).toEqual([1000, 1100, 1050]);
    expect(t.find((x) => x.commodity === 'Rice')).toMatchObject({ latest: 2500, previous: null, changePct: null });
  });

  it('keys months', () => {
    expect(monthKey(new Date('2026-07-15T10:00:00Z'))).toBe('2026-07');
  });
});
