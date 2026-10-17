'use client';
import { useEffect, useState } from 'react';
import { creditApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { day, tzs } from '@/lib/credit';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Profile = any;

const FACTOR_LABEL: Record<string, string> = {
  verification: 'Verified farmer', production: 'Production history', profitability: 'Profitability', loanRepayment: 'Loan repayment',
  cooperativeMembership: 'Cooperative membership', experience: 'Farming experience', farmSize: 'Farm size', insurance: 'Insurance',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>{title}</h3>
      {children}
    </section>
  );
}
const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div><div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>{label}</div><div style={{ fontWeight: 600, fontSize: 14 }}>{value ?? '—'}</div></div>
);
const Grid = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>{children}</div>
);

/** The Rice Farmer Credit Profile. Pass an application id (lender view) or a farmer id. */
export default function CreditProfileView({ applicationId, farmerId }: { applicationId?: string; farmerId?: string }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    const req = applicationId ? creditApi.applicationProfile(applicationId) : creditApi.farmerProfile(farmerId!);
    req.then((r) => { if (live) { setP(r.data); setError(''); } }).catch((e) => { if (live) setError(apiErrorMessage(e, 'Could not load the credit profile.')); });
    return () => { live = false; };
  }, [applicationId, farmerId]);

  if (error) return <div className="alert-box alert-danger">{error}</div>;
  if (!p) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--neutral-500)' }}>Loading profile…</div>;
  const score = p.score?.value ?? 0;
  const scoreColor = score >= 60 ? 'var(--green-500)' : score >= 40 ? 'var(--gold-400)' : 'var(--red-500)';

  return (
    <div id="credit-profile">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', border: `6px solid ${scoreColor}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Outfit, sans-serif', lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 10, color: 'var(--neutral-500)' }}>of 100</div>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{p.farmer.name}</div>
          <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
            {p.farmer.controlNumber} · {[p.farmer.village, p.farmer.district].filter(Boolean).join(', ') || 'Location not recorded'}{p.farmer.cooperative ? ` · ${p.farmer.cooperative}` : ''}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`badge ${p.score?.ready ? 'badge-green' : 'badge-gold'}`}>{p.score?.ready ? 'Credit ready' : 'Not yet credit ready'}</span>
            <span className={`badge ${p.farmer.verificationStatus === 'VERIFIED' ? 'badge-green' : 'badge-gray'}`}>{String(p.farmer.verificationStatus).toLowerCase()}</span>
            {p.farmer.isBlacklisted && <span className="badge badge-red">Blacklisted</span>}
          </div>
        </div>
      </div>

      <Section title="Score breakdown">
        <div style={{ display: 'grid', gap: 6 }}>
          {Object.entries(p.score?.factors ?? {}).map(([key, f]: [string, any]) => (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 52px', gap: 10, alignItems: 'center', fontSize: 12 }}>
              <span>{FACTOR_LABEL[key] ?? key}</span>
              <div style={{ height: 6, borderRadius: 9999, background: 'var(--border)' }}><div style={{ width: `${f.max ? (f.score / f.max) * 100 : 0}%`, height: '100%', borderRadius: 9999, background: scoreColor }} /></div>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.score}/{f.max}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Outlook for this loan">
        <Grid>
          <Stat label="Farm size (social ha)" value={p.outlook.farmHa} />
          <Stat label="Average yield (kg/ha)" value={p.outlook.yieldPerHa?.toLocaleString()} />
          <Stat label="Estimated yield" value={p.outlook.estimatedYieldKg ? `${p.outlook.estimatedYieldKg.toLocaleString()} kg` : null} />
          <Stat label="Expected revenue" value={tzs(p.outlook.expectedRevenue)} />
          <Stat label="Indicative borrowing limit" value={tzs(p.outlook.indicativeLimit)} />
        </Grid>
        <p style={{ fontSize: 11, color: 'var(--neutral-500)', margin: '6px 0 0' }}>
          {p.outlook.basis ? `Price basis: ${p.outlook.basis}. ` : 'No price history to value the harvest. '}Estimates come from this farmer’s own records and are a guide, not a promise.
        </p>
      </Section>

      <Section title="Farm size">
        <Grid>
          <Stat label="Farms" value={p.farmSize.farms.length} />
          <Stat label="Social hectares" value={p.farmSize.totalSocialHa} />
          <Stat label="GPS-mapped hectares" value={p.farmSize.totalMappedHa || null} />
        </Grid>
      </Section>

      <Section title="Production history and crop performance">
        <Grid>
          <Stat label="Seasons" value={p.cropPerformance.seasons} />
          <Stat label="Harvests recorded" value={p.cropPerformance.harvests} />
          <Stat label="Average kg/ha" value={p.cropPerformance.avgYieldPerHa?.toLocaleString()} />
          <Stat label="Harvest vs estimate" value={p.cropPerformance.vsEstimatePct == null ? null : `${p.cropPerformance.vsEstimatePct > 0 ? '+' : ''}${p.cropPerformance.vsEstimatePct}%`} />
        </Grid>
        {p.production.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table className="data-table"><thead><tr><th>Season</th><th>Variety</th><th>Area (ha)</th><th>Estimated kg</th><th>Harvested kg</th><th>kg/ha</th><th>Status</th></tr></thead>
              <tbody>{p.production.slice(0, 8).map((r: any, i: number) => (
                <tr key={i}><td>{r.season}</td><td>{r.variety ?? '—'}</td><td>{r.areaHa ?? '—'}</td><td>{r.estimatedKg?.toLocaleString() ?? '—'}</td><td>{r.actualKg?.toLocaleString() ?? '—'}</td><td>{r.yieldPerHa?.toLocaleString() ?? '—'}</td><td>{String(r.status).toLowerCase()}</td></tr>
              ))}</tbody></table>
          </div>
        )}
      </Section>

      <Section title="Sales history">
        <Grid>
          <Stat label="Rice sold" value={`${p.sales.totalKg.toLocaleString()} kg`} />
          <Stat label="Sales value" value={tzs(p.sales.totalValue)} />
          <Stat label="Average price/kg" value={tzs(p.sales.avgPricePerKg)} />
        </Grid>
      </Section>

      <Section title="Cooperative membership">
        <Grid>
          <Stat label="Member" value={p.membership.isMember ? 'Yes' : 'No'} />
          <Stat label="Cooperative" value={p.membership.cooperative} />
          <Stat label="Member since" value={day(p.membership.since)} />
          <Stat label="Years" value={p.membership.years} />
          <Stat label="Plan" value={p.membership.plan ? `${p.membership.plan} (${String(p.membership.status).toLowerCase().replace(/_/g, ' ')})` : null} />
        </Grid>
      </Section>

      <Section title="Input usage">
        <Grid>
          <Stat label="Total spent on inputs" value={tzs(p.inputs.totalCost)} />
          <Stat label="Bought on credit" value={tzs(p.inputs.onCredit)} />
          {p.inputs.byCategory.slice(0, 4).map((c: any) => <Stat key={c.category} label={String(c.category).toLowerCase()} value={tzs(c.total)} />)}
        </Grid>
      </Section>

      <Section title="Repayment history">
        <Grid>
          <Stat label="Borrowed to date" value={tzs(p.repayment.totalBorrowed)} />
          <Stat label="Outstanding" value={tzs(p.repayment.outstanding)} />
          <Stat label="Overdue" value={p.repayment.overdueAmount ? `${tzs(p.repayment.overdueAmount)} (${p.repayment.overdueInstalments})` : 'None'} />
        </Grid>
        {p.repayment.loans.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table className="data-table"><thead><tr><th>Lender</th><th>Amount</th><th>Outstanding</th><th>Repaid</th><th>Overdue</th><th>Issued</th></tr></thead>
              <tbody>{p.repayment.loans.map((l: any) => (
                <tr key={l.id}><td>{l.lender}</td><td>{tzs(l.original)}</td><td>{tzs(l.outstanding)}</td><td>{l.repaidPct}%</td><td>{l.overdueInstalments || '—'}</td><td>{day(l.issued)}</td></tr>
              ))}</tbody></table>
          </div>
        )}
      </Section>

      <Section title="Insurance status">
        <Grid>
          <Stat label="Active policies" value={p.insurance.activePolicies} />
          <Stat label="Sum insured" value={tzs(p.insurance.sumInsured)} />
          <Stat label="Insured hectares" value={p.insurance.insuredHa || null} />
          <Stat label="Claims" value={p.insurance.claims ? `${p.insurance.claims} (${tzs(p.insurance.claimsPaid)} paid)` : 'None'} />
        </Grid>
      </Section>
      <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}>Generated {day(p.generatedAt)}.</div>
    </div>
  );
}
