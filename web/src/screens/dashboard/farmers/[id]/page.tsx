'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { hasPermission, isPathAllowed } from '@/lib/nav';
import { useAuthStore } from '@/store/auth.store';
import { API_BASE_URL, api, farmDefaultsApi, farmersApi, irrigationApi } from '@/lib/api';
import { EditFarmerModal, LocalVerificationModal, RemoveFarmerModal } from './FarmerActions';
import { printFarmerId } from './printFarmerId';
import { BASE, CardsSkeleton, ConfirmDialog, Empty, LoadError, Panel, StatCard, StatusBadge, fmtDate, fmtHa, titleCase, useApi } from '../../irrigation/ui';

const TIER_LABEL: Record<string, string> = { STANDARD: 'Tier 1 · Standard member', FAMILY: 'Tier 2 · Family / beneficiary', ALTERNATIVE_ID: 'Tier 3 · Alternative ID' };
const IDENTIFIER_LABEL: Record<string, string> = {
  NIDA: 'NIDA', VOTER_ID: 'Voter ID', DRIVER_LICENSE: "Driver's license", LOCAL_VERIFICATION: 'Local verification', GUARDIAN: 'Guardian (beneficial owner)', PHONE_ONLY: 'Phone number only',
};
const METHOD_LABEL: Record<string, string> = { VILLAGE_LETTER: 'Village / street letter', LOCAL_VOTER_ID: 'Local voter ID', GUARANTOR: 'Chairman guarantor' };

const photoSrc = (url?: string | null) => (!url ? null : /^https?:/.test(url) ? url : `${API_BASE_URL.replace(/\/api\/v\d+\/?$/, '')}${url}`);

/** A farmer's profile: photo and details on top, their hectares below, then the farms they guide. */
export default function FarmerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((st) => st.user);
  // In the AMCOS portal the farmer list is a tab of Farmers & Plot Allocation.
  const listHref = user && isPathAllowed('/dashboard/plot-allocation', user) ? '/dashboard/plot-allocation' : '/dashboard/farmers';
  const router = useRouter();
  const [dialog, setDialog] = useState<'edit' | 'remove' | 'verify' | null>(null);
  const [revoking, setRevoking] = useState<any>(null);
  const canEdit = hasPermission(user, 'farmers', 'EDIT');
  const canRemove = hasPermission(user, 'farmers', 'DELETE');
  const person = useApi<any>(() => farmersApi.getOne(id), [id]);
  // Hectare records come from the irrigation scheme; a farmer outside it, or a user without that grant, simply has none to show.
  const land = useApi<any>(() => irrigationApi.farmer(id), [id]);
  const overdue = useApi<any>(hasPermission(user, 'farmers', 'VIEW') ? () => farmDefaultsApi.forFarmer(id) : null, [id]);
  const f = person.data;
  const name = f ? `${f.firstName} ${f.lastName}` : 'Farmer';
  const photo = photoSrc(f?.photoUrl);
  const details: [string, any][] = f ? [
    ['Farmer ID', f.controlNumber ?? '—'], ['Phone', f.user?.phone ?? '—'], ['Email', f.user?.email ?? '—'], ['Gender', titleCase(f.gender) || '—'], ['Date of birth', fmtDate(f.dateOfBirth)],
    ['Village', f.village ?? '—'], ['Ward', f.ward ?? '—'], ['District', f.district ?? '—'], ['AMCOS', f.mamcos?.name ?? '—'],
    ['Registered', fmtDate(f.createdAt)],
    ['Registration tier', TIER_LABEL[f.registrationTier] ?? '—'], ['Identified by', IDENTIFIER_LABEL[f.identifierUsed] ?? '—'],
    ...(f.idNumber ? [['ID number', f.idNumber] as [string, any]] : []),
  ] : [];
  const d = land.data;
  const printId = () => {
    if (!f) return;
    // Registration number is the farm id: canal.block + side, a dash, then the hectare number (5.15R-12).
    const shamba = (d?.current ?? []).map((a: any) => {
      const code: string = a.hectare.code, block: string = a.block?.code ?? '';
      return block && code.startsWith(block) && /^\d+$/.test(code.slice(block.length)) ? `${block}-${code.slice(block.length)}` : code;
    }).join(', ');
    const ok = printFarmerId({
      name, farmerId: f.controlNumber ?? '', photoUrl: photo, initials: `${f.firstName?.[0] ?? ''}${f.lastName?.[0] ?? ''}`.toUpperCase(),
      amcosName: f.mamcos?.name ?? '', amcosAddress: [f.mamcos?.location, f.mamcos?.district].filter(Boolean).join(' - '), amcosCode: f.mamcos?.code ?? '',
      shamba, village: f.village ?? '', ward: f.ward ?? '', issuedOn: fmtDate(f.createdAt),
    });
    if (!ok) window.alert('The browser blocked the print window. Allow pop-ups for this site and try again.');
  };
  const guided = d ? [...d.guided.current, ...d.guided.history] : [];
  return (
    <>
      <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: 12, marginBottom: 14, display: 'flex', gap: 6 }}>
        <Link href={listHref} style={{ color: 'inherit', textDecoration: 'underline' }}>Farmers</Link><span>/</span><span>{name}</span>
      </nav>
      <LoadError message={person.error} onRetry={person.reload} />
      {overdue.data?.case && (
        <div role="alert" className="glass-card" style={{ padding: '12px 16px', marginBottom: 14, borderLeft: '4px solid var(--red-400)' }}>
          <strong style={{ color: 'var(--red-400)' }}>Farms blocked: debt overdue</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Owes <strong>TZS {Math.round(overdue.data.case.debt).toLocaleString('en-US')}</strong>{overdue.data.case.daysOverdue != null ? `, ${overdue.data.case.daysOverdue} days overdue` : ''}.{' '}
            {overdue.data.case.status === 'UNDER_AMCOS' && `The farms cannot be leased and are run by the AMCOS until ${fmtDate(overdue.data.case.graceEndsAt)}. Paying the debt gives them back; another farmer may pay it and farm them this season.`}
            {overdue.data.case.status === 'MLAX_NOTICE' && `Last warning sent. The farms go to M-LAX on ${fmtDate(overdue.data.case.graceEndsAt)} unless the debt is paid.`}
            {overdue.data.case.status === 'AT_MLAX' && 'The farms are on M-LAX for leasing. The owner receives nothing from the lease and can only get them back by leasing them through M-LAX.'}
            {' '}{hasPermission(user, 'farm_administration', 'VIEW') && <Link href="/dashboard/farm-administration" style={{ textDecoration: 'underline' }}>Open farms under administration</Link>}
          </div>
        </div>
      )}
      {person.loading ? <CardsSkeleton count={3} /> : !f ? null : (
        <>
          <Panel>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ width: 160, height: 160, borderRadius: 16, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2, rgba(127,127,127,.15))', display: 'grid', placeItems: 'center' }}>
                {photo
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded files come from the API origin, not a static asset
                  ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 48, fontWeight: 600 }}>{`${f.firstName?.[0] ?? ''}${f.lastName?.[0] ?? ''}`.toUpperCase() || '?'}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{name}</h2>
                  <StatusBadge value={f.isBlacklisted ? 'BLACKLISTED' : f.verificationStatus} />
                  {(
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button type="button" className="btn-secondary" onClick={printId}>Print ID</button>
                      {canEdit && <button type="button" className="btn-secondary" onClick={() => setDialog('edit')}>Edit</button>}
                      {canRemove && f.mamcosId && <button type="button" className="btn-secondary" style={{ color: 'var(--red-400)' }} onClick={() => setDialog('remove')}>Remove from AMCOS</button>}
                    </span>
                  )}
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: 0 }}>
                  {details.map(([k, v]) => <div key={k}><dt className="muted" style={{ fontSize: 12 }}>{k}</dt><dd style={{ margin: '2px 0 0' }}>{v}</dd></div>)}
                </dl>
              </div>
            </div>
          </Panel>

          <Panel title="Hectares" pad={false}>
            {land.loading ? <div style={{ padding: 16 }}><CardsSkeleton count={2} /></div>
              : !d || (!d.current.length && !d.pending.length) ? <Empty title="No hectares" hint="This farmer holds no hectare in the irrigation scheme." />
              : (
                <>
                  <div className="metric-grid" style={{ padding: 16 }}>
                    <StatCard label="Active hectares" value={d.current.length} hint={fmtHa(d.totalActiveHectares)} />
                    <StatCard label="Awaiting approval" value={d.pending.length} />
                    <StatCard label="Past allocations" value={d.history.length} />
                  </div>
                  <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Block</th><th>Canal</th><th>Since</th><th>Status</th><th>Guardian</th></tr></thead><tbody>
                    {[...d.current, ...d.pending].map((a: any) => (
                      <tr key={a.id}>
                        <td><Link href={`${BASE}/structure/hectares/${a.hectare.id}`} style={{ fontWeight: 600 }}>{a.hectare.code}</Link></td>
                        <td><Link href={`${BASE}/structure/blocks/${a.block.id}`}>{a.block.code}</Link></td>
                        <td><Link href={`${BASE}/structure/canals/${a.canal.id}`}>{a.canal.code}</Link></td>
                        <td>{fmtDate(a.allocatedOn)}</td><td><StatusBadge value={a.status} /></td>
                        <td>{a.guardian ? <Link href={`/dashboard/farmers/${a.guardian.id}`}>{a.guardian.name}</Link> : '—'}</td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </>
              )}
          </Panel>

          <Panel title="Local verification" pad={false}
            actions={canEdit && f.identifierUsed === 'PHONE_ONLY' || (canEdit && f.registrationTier === 'ALTERNATIVE_ID') ? <button type="button" className="btn-primary" onClick={() => setDialog('verify')}>Add verification</button> : undefined}>
            {!f.localVerifications?.length
              ? <Empty title="No local verification" hint={f.identifierUsed === 'PHONE_ONLY' ? 'This farmer has no ID on file. Add a village letter, local voter ID or a chairman guarantor.' : 'Only needed for farmers with no NIDA, voter ID or driver\'s license.'} />
              : (
                <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Method</th><th>Details</th><th>Recorded</th><th>Status</th><th /></tr></thead><tbody>
                  {f.localVerifications.map((v: any) => (
                    <tr key={v.id} style={v.revokedAt ? { opacity: 0.6 } : undefined}>
                      <td>{METHOD_LABEL[v.method] ?? v.method}</td>
                      <td>
                        {v.reference ?? ''}
                        {v.letterDocumentUrl && <> <a href={photoSrc(v.letterDocumentUrl) ?? '#'} target="_blank" rel="noreferrer">View letter</a></>}
                        {v.guarantor && <>{`${v.guarantor.firstName} ${v.guarantor.lastName}`} <span className="muted">· {titleCase(v.guarantorPosition)}</span></>}
                      </td>
                      <td>{fmtDate(v.createdAt)}</td>
                      <td>{v.revokedAt ? <span className="muted">Revoked {fmtDate(v.revokedAt)}</span> : <StatusBadge value="ACTIVE" />}</td>
                      <td>{canEdit && !v.revokedAt && <button type="button" className="btn-secondary" onClick={() => setRevoking(v)}>Revoke</button>}</td>
                    </tr>
                  ))}
                </tbody></table></div>
              )}
          </Panel>

          <Panel title="Farms guided by this farmer" pad={false}>
            {land.loading ? <div style={{ padding: 16 }}><CardsSkeleton count={1} /></div>
              : !guided.length ? <Empty title="No guided farms" hint="Farms registered in a relative's name but owned by this farmer show here." />
              : (
                <>
                  <div className="muted" style={{ fontSize: 13, padding: '12px 16px 0' }}>Registered in other farmers&apos; names; this farmer is their guardian.</div>
                  <div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Hectare</th><th>Registered to</th><th>Block</th><th>Canal</th><th>Since</th><th>Status</th></tr></thead><tbody>
                    {guided.map((g: any) => (
                      <tr key={g.id} style={g.endedOn ? { opacity: 0.6 } : undefined}>
                        <td><Link href={`${BASE}/structure/hectares/${g.hectare.id}`} style={{ fontWeight: 600 }}>{g.hectare.code}</Link></td>
                        <td><Link href={`/dashboard/farmers/${g.holder.id}`}>{g.holder.name}</Link> <span className="muted">· {g.holder.memberNumber}</span></td>
                        <td>{g.block.code}</td><td>{g.canal.code}</td><td>{fmtDate(g.startedOn)}</td>
                        <td>{g.endedOn ? <span className="muted">Ended {fmtDate(g.endedOn)}</span> : <StatusBadge value="ACTIVE" />}</td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </>
              )}
          </Panel>
        </>
      )}
      {dialog === 'verify' && f && <LocalVerificationModal farmer={f} onClose={() => setDialog(null)} onSaved={person.reload} />}
      {revoking && f && <ConfirmDialog title="Revoke verification" body="The farmer will no longer count as locally verified." confirmLabel="Revoke" danger askReason
        onClose={() => setRevoking(null)}
        onConfirm={async (reason?: string) => { await api.post(`/farmers/${f.id}/local-verifications/${revoking.id}/revoke`, { reason }); setRevoking(null); person.reload(); }} />}
      {dialog === 'edit' && f && <EditFarmerModal farmer={f} onClose={() => setDialog(null)} onSaved={person.reload} />}
      {dialog === 'remove' && f && <RemoveFarmerModal farmer={f} onClose={() => setDialog(null)} onRemoved={() => router.push(listHref)} />}
    </>
  );
}
