'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON */
import { useEffect, useState } from 'react';
import { InsightPanel, money } from '@/components/role-dashboards/DashboardPrimitives';
import { farmDefaultsApi } from '@/lib/api';

/**
 * Shown to a farmer: a warning when their own farms are blocked because of an overdue debt, and the farms in their AMCOS
 * that another farmer may pay for and farm this season (the owner's details are not shown).
 */
export default function OverdueFarmsPanel() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { farmDefaultsApi.me().then((r) => setData(r.data)).catch(() => setData(null)); }, []);
  if (!data || (!data.mine && !data.available?.length)) return null;
  const mine = data.mine;
  return (
    <>
      {mine && (
        <InsightPanel title="Your farms are blocked" subtitle="Your debt to the AMCOS is overdue">
          <p style={{ margin: 0 }}>
            You owe <strong>{money(mine.debt)}</strong>. Your farms cannot be leased.{' '}
            {mine.status === 'AT_MLAX'
              ? 'They are now on M-LAX. You receive nothing from their lease; to get a farm back you must lease it through M-LAX like anyone else.'
              : `They are run by the AMCOS until ${new Date(mine.graceEndsAt).toLocaleDateString('en-GB')}. Pay your debt at the AMCOS office before then to keep them; after that they go to M-LAX and getting them back costs more.`}
          </p>
        </InsightPanel>
      )}
      {data.available?.length > 0 && (
        <InsightPanel title="Farms you can take this season" subtitle="Pay the debt at the AMCOS office and farm the land this season">
          <div className="role-list">
            {data.available.map((c: any) => (
              <div className="role-list-item" key={c.id}>
                <div><strong>{c.farms.map((f: any) => `${f.name} (${f.farmCode})`).join(', ')}</strong><span>{c.farms.reduce((t: number, f: any) => t + f.socialHectares, 0)} ha</span></div>
                <strong>{money(c.debt)} to pay</strong>
              </div>
            ))}
          </div>
        </InsightPanel>
      )}
    </>
  );
}
