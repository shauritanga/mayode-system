'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { hasPermission, isPathAllowed } from '@/lib/nav';
import { useAuthStore } from '@/store/auth.store';
import { API_BASE_URL, farmersApi, irrigationApi } from '@/lib/api';
import { EditFarmerModal, RemoveFarmerModal } from './FarmerActions';
import { BASE, CardsSkeleton, Empty, LoadError, Panel, StatCard, StatusBadge, fmtDate, fmtHa, titleCase, useApi } from '../../irrigation/ui';

const photoSrc = (url?: string | null) => (!url ? null : /^https?:/.test(url) ? url : `${API_BASE_URL.replace(/\/api\/v\d+\/?$/, '')}${url}`);

/** A farmer's profile: photo and details on top, their hectares below, then the farms they guide. */
export default function FarmerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((st) => st.user);
  // In the AMCOS portal the farmer list is a tab of Farmers & Plot Allocation.
  const listHref = user && isPathAllowed('/dashboard/plot-allocation', user) ? '/dashboard/plot-allocation' : '/dashboard/farmers';
  const router = useRouter();
  const [dialog, setDialog] = useState<'edit' | 'remove' | null>(null);
  const canEdit = hasPermission(user, 'farmers', 'EDIT');
  const canRemove = hasPermission(user, 'farmers', 'DELETE');
  const person = useApi<any>(() => farmersApi.getOne(id), [id]);
  // Hectare records come from the irrigation scheme; a farmer outside it, or a user without that grant, simply has none to show.
  const land = useApi<any>(() => irrigationApi.farmer(id), [id]);
  const f = person.data;
  const name = f ? `${f.firstName} ${f.lastName}` : 'Farmer';
  const photo = photoSrc(f?.photoUrl);
  const details: [string, any][] = f ? [
    ['Phone', f.user?.phone ?? '—'], ['Email', f.user?.email ?? '—'], ['Gender', titleCase(f.gender) || '—'], ['Date of birth', fmtDate(f.dateOfBirth)],
    ['Village', f.village ?? '—'], ['Ward', f.ward ?? '—'], ['District', f.district ?? '—'], ['AMCOS', f.mamcos?.name ?? '—'],
    ['Farm size', f.farmSizeHa != null ? fmtHa(Number(f.farmSizeHa)) : '—'], ['Registered', fmtDate(f.createdAt)],
  ] : [];
  const d = land.data;
  const guided = d ? [...d.guided.current, ...d.guided.history] : [];
  return (
    <>
      <nav aria-label="Breadcrumb" className="muted" style={{ fontSize: 12, marginBottom: 14, display: 'flex', gap: 6 }}>
        <Link href={listHref} style={{ color: 'inherit', textDecoration: 'underline' }}>Farmers</Link><span>/</span><span>{name}</span>
      </nav>
      <LoadError message={person.error} onRetry={person.reload} />
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
                  {(canEdit || (canRemove && f.mamcosId)) && (
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
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
      {dialog === 'edit' && f && <EditFarmerModal farmer={f} onClose={() => setDialog(null)} onSaved={person.reload} />}
      {dialog === 'remove' && f && <RemoveFarmerModal farmer={f} onClose={() => setDialog(null)} onRemoved={() => router.push(listHref)} />}
    </>
  );
}
