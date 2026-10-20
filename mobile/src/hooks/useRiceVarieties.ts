import { useEffect, useState } from 'react';
import { riceVarietiesApi, type RiceVariety } from '../lib/data';

/** The rice varieties Super Admin has set up. Reads are cached, so the list is still there offline. */
export function useRiceVarieties() {
  const [varieties, setVarieties] = useState<RiceVariety[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    riceVarietiesApi
      .list()
      .then((res) => { if (live) setVarieties(Array.isArray(res.data) ? res.data : []); })
      .catch(() => undefined)
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  return { varieties, loading };
}

/** The harvest date (YYYY-MM-DD) a variety gives for a planting date, or '' when either is missing. */
export function harvestFromPlanting(plantingDate: string, maturityDays?: number | null): string {
  if (!plantingDate || !maturityDays) return '';
  const planted = new Date(`${plantingDate}T00:00:00Z`);
  if (Number.isNaN(planted.getTime())) return '';
  return new Date(planted.getTime() + maturityDays * 86_400_000).toISOString().slice(0, 10);
}
