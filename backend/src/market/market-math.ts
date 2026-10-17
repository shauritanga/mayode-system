export interface PricePoint {
  commodity: string;
  price: number;
  recordedAt: Date;
}

export interface PriceTrend {
  commodity: string;
  latest: number;
  previous: number | null;
  /** Change since the previous reading, in percent; null with fewer than two readings. */
  changePct: number | null;
  readings: number;
  series: { date: string; price: number }[];
}

/** Per-commodity latest price, change against the reading before it, and the history for a chart. */
export function priceTrends(points: PricePoint[]): PriceTrend[] {
  const groups = new Map<string, PricePoint[]>();
  for (const p of points) {
    const list = groups.get(p.commodity) ?? [];
    list.push(p);
    groups.set(p.commodity, list);
  }
  return [...groups.entries()]
    .map(([commodity, list]) => {
      const sorted = [...list].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
      const latest = sorted[sorted.length - 1];
      const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
      return {
        commodity,
        latest: latest.price,
        previous: previous?.price ?? null,
        changePct: previous && previous.price > 0 ? Math.round(((latest.price - previous.price) / previous.price) * 1000) / 10 : null,
        readings: sorted.length,
        series: sorted.map((p) => ({ date: p.recordedAt.toISOString().slice(0, 10), price: p.price })),
      };
    })
    .sort((a, b) => a.commodity.localeCompare(b.commodity));
}

/** Calendar-month key (YYYY-MM) for grouping sales. */
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);
