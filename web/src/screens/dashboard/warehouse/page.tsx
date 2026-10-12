'use client';
import { TableSkeleton } from '@/components/role-dashboards/DashboardPrimitives';
import { useCallback, useEffect, useState } from 'react';
import { usersApi, warehousesApi, saleOrdersApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/lib/nav';
import Modal from '@/components/Modal';
import ErrorBanner from '@/components/ErrorBanner';
import OrderDetail from '../sale-orders/OrderDetail';
import WarehouseDispatchPanel from '../inventory/WarehouseDispatchPanel';
import Link from 'next/link';

interface Keeper { user: { id: string; firstName?: string; lastName?: string } }
interface Warehouse {
  id: string; name: string; mamcosId?: string | null; location?: string | null; capacityKg?: number | null; isActive: boolean;
  mamcos?: { name: string } | null; keepers: Keeper[];
  balance: { onHandKg: number; reservedKg: number; availableKg: number };
  unlottedKg?: number;
}
interface Unreceived { id: string; trackingCode: string; weightKg: number; qualityGrade?: string | null; lotNumber?: string | null; farmer?: { firstName?: string; lastName?: string } }
interface AccountOption { id: string; firstName?: string; lastName?: string; mamcosId?: string | null }

type Dialog =
  | { kind: 'new' }
  | { kind: 'receive' | 'adjust' | 'keepers' | 'lot'; warehouse: Warehouse }
  | null;

const kg = (n: number) => `${n.toLocaleString()} kg`;

export default function WarehousePage() {
  const user = useAuthStore((s) => s.user);
  const can = (r: string, a: string) => hasPermission(user, r, a);
  const canDesk = can('warehouse_desk', 'VIEW');
  const canView = can('warehouses', 'VIEW');

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [found, setFound] = useState<{ id: string } | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const fetchAll = useCallback(
    () => (canView ? warehousesApi.list() : Promise.resolve({ data: [] }))
      .then((r) => { setWarehouses(r.data ?? []); setError(''); })
      .catch((e) => setError(apiErrorMessage(e, 'Could not load warehouses')))
      .finally(() => setLoading(false)),
    [canView],
  );
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLooking(true); setLookupError(''); setFound(null);
    try { const r = await saleOrdersApi.lookup(reference); setFound({ id: r.data.id }); }
    catch (err) { setLookupError(apiErrorMessage(err, 'No sale order with this reference')); }
    finally { setLooking(false); }
  };

  return (
    <div className="ua-page">
      <div className="ua-head">
        <div>
          <h1 className="ua-title">Warehouse</h1>
          <p className="ua-sub">Receive harvest, check buyers&rsquo; references, load trucks and keep stock accurate. Deliveries are recorded and batched into lots on <Link href="/dashboard/inventory">Harvest &amp; Lots</Link>.</p>
        </div>
        {can('warehouses', 'CREATE') && <button className="btn-primary" onClick={() => setDialog({ kind: 'new' })}>+ New warehouse</button>}
      </div>
      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {canDesk && (
        <section className="ua-panel so-desk">
          <h2 className="ua-section-title">Buyer at the counter</h2>
          <form className="so-lookup" onSubmit={lookup}>
            <input className="input-field" required autoComplete="off" placeholder="Enter the buyer's reference, e.g. MAD-26-0042" value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Sale order reference" />
            <button className="btn-primary" disabled={looking}>{looking ? 'Looking…' : 'Find order'}</button>
          </form>
          {lookupError && <div className="ua-form-error" role="alert" style={{ marginTop: 12 }}>{lookupError}</div>}
          {found && <div style={{ marginTop: 16 }}><OrderDetail key={found.id} orderId={found.id} onChanged={fetchAll} /></div>}
        </section>
      )}

      {canView && (
        <section>
          <h2 className="ua-section-title" style={{ marginBottom: 12 }}>Warehouses &amp; stock</h2>
          {loading ? <TableSkeleton rows={4} avatar={false} /> : warehouses.length === 0 ? (
            <div className="ua-panel"><div className="ua-empty"><strong>No warehouses yet</strong>{can('warehouses', 'CREATE') ? 'Create the first warehouse, then receive harvest into it.' : 'Ask an administrator to create one.'}</div></div>
          ) : (
            <div className="so-cards">
              {warehouses.map((w) => (
                <article key={w.id} className="so-card">
                  <header>
                    <div>
                      <div className="so-card-title">{w.name}</div>
                      <div className="ua-hint">{w.location || 'No location'}{w.mamcos ? ` · ${w.mamcos.name}` : ''}</div>
                    </div>
                    {!w.isActive && <span className="so-chip is-cancelled">Inactive</span>}
                  </header>
                  <div className="so-stock">
                    <div><b>{kg(w.balance.onHandKg)}</b><span>On hand</span></div>
                    <div><b>{kg(w.balance.reservedKg)}</b><span>Reserved</span></div>
                    <div><b>{kg(w.balance.availableKg)}</b><span>Available</span></div>
                  </div>
                  {w.capacityKg ? <div className="so-bar" aria-hidden><i style={{ width: `${Math.min(100, (w.balance.onHandKg / w.capacityKg) * 100)}%` }} /></div> : null}
                  {(w.unlottedKg ?? 0) > 0 && (
                    <div className="so-note">
                      <b>{kg(w.unlottedKg!)}</b>{' '}counted in but not in a lot, so it can&rsquo;t be sold yet.
                      {can('warehouse_desk', 'EDIT') && <button className="so-link" onClick={() => setDialog({ kind: 'lot', warehouse: w })}>Make a lot</button>}
                    </div>
                  )}
                  <div className="ua-hint">Keepers: {w.keepers.length ? w.keepers.map((k) => `${k.user.firstName ?? ''} ${k.user.lastName ?? ''}`.trim()).join(', ') : 'none assigned (any permitted user can act)'}</div>
                  <footer>
                    {can('warehouse_desk', 'EDIT') && <button className="btn-secondary ua-action" onClick={() => setDialog({ kind: 'receive', warehouse: w })}>Receive harvest</button>}
                    {can('warehouse_desk', 'EDIT') && <button className="btn-secondary ua-action" onClick={() => setDialog({ kind: 'adjust', warehouse: w })}>Adjust</button>}
                    {can('warehouses', 'EDIT') && <button className="btn-secondary ua-action" onClick={() => setDialog({ kind: 'keepers', warehouse: w })}>Keepers</button>}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {canDesk && can('sales', 'VIEW') && (
        <details className="ua-panel so-desk">
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-1)' }}>Older sales (made before sale orders)</summary>
          <p className="ua-hint" style={{ margin: '10px 0' }}>For sales recorded the old way, look up the invoice number and record the gate pass. New sales are loaded from their sale order above.</p>
          <WarehouseDispatchPanel />
        </details>
      )}

      {dialog?.kind === 'new' && <NewWarehouse onClose={() => setDialog(null)} onDone={() => { setDialog(null); fetchAll(); }} />}
      {dialog?.kind === 'receive' && <Receive warehouse={dialog.warehouse} onClose={() => setDialog(null)} onDone={() => { setDialog(null); fetchAll(); }} />}
      {dialog?.kind === 'lot' && <MakeLot warehouse={dialog.warehouse} onClose={() => setDialog(null)} onDone={() => { setDialog(null); fetchAll(); }} />}
      {dialog?.kind === 'adjust' && <Adjust warehouse={dialog.warehouse} onClose={() => setDialog(null)} onDone={() => { setDialog(null); fetchAll(); }} />}
      {dialog?.kind === 'keepers' && <Keepers warehouse={dialog.warehouse} onClose={() => setDialog(null)} onDone={fetchAll} />}
    </div>
  );
}

function useSubmit(done: () => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (fn: () => Promise<unknown>, fallback: string) => {
    setSaving(true); setError('');
    try { await fn(); done(); } catch (e) { setError(apiErrorMessage(e, fallback)); } finally { setSaving(false); }
  };
  return { saving, error, submit };
}

function NewWarehouse({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', location: '', capacityKg: '' });
  const { saving, error, submit } = useSubmit(onDone);
  return (
    <Modal title="New warehouse" onClose={onClose} width="460px" footer={<>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="wh-new" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create warehouse'}</button></>}>
      <form id="wh-new" className="ua-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(() => warehousesApi.create({ name: f.name.trim(), location: f.location.trim() || undefined, capacityKg: f.capacityKg ? Number(f.capacityKg) : undefined }), 'Could not create the warehouse'); }}>
        <div className="ua-field"><label className="ua-label" htmlFor="wn-name">Name</label><input id="wn-name" className="input-field" required placeholder="e.g. Main store" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="ua-field"><label className="ua-label" htmlFor="wn-loc">Location<span className="ua-opt">optional</span></label><input id="wn-loc" className="input-field" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        <div className="ua-field"><label className="ua-label" htmlFor="wn-cap">Capacity (kg)<span className="ua-opt">optional</span></label><input id="wn-cap" className="input-field" type="number" min={1} value={f.capacityKg} onChange={(e) => setF({ ...f, capacityKg: e.target.value })} /></div>
        {error && <div className="ua-form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}

function Receive({ warehouse, onClose, onDone }: { warehouse: Warehouse; onClose: () => void; onDone: () => void }) {
  const [records, setRecords] = useState<Unreceived[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [manual, setManual] = useState('');
  const [note, setNote] = useState('');
  const [loadError, setLoadError] = useState('');
  const { saving, error, submit } = useSubmit(onDone);
  useEffect(() => { warehousesApi.unreceived().then((r) => setRecords(r.data ?? [])).catch((e) => setLoadError(apiErrorMessage(e, 'Could not load delivered harvest'))); }, []);
  const total = records.filter((r) => picked.includes(r.id)).reduce((s, r) => s + r.weightKg, 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal title={`Receive harvest into ${warehouse.name}`} subtitle="Pick the deliveries you have weighed in, or enter a counted quantity." onClose={onClose} width="580px" footer={<>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="wh-recv" className="btn-primary" disabled={saving || (!picked.length && !manual)}>{saving ? 'Saving…' : picked.length ? `Receive ${total.toLocaleString()} kg` : 'Receive'}</button></>}>
      <form id="wh-recv" className="ua-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(() => warehousesApi.receive(warehouse.id, picked.length ? { inventoryRecordIds: picked, note: note || undefined } : { quantityKg: Number(manual), note: note || undefined }), 'Could not receive the stock'); }}>
        {loadError && <div className="ua-form-error">{loadError}</div>}
        <div className="so-records">
          {records.length === 0 ? <div className="ua-hint">No delivered harvest is waiting to be received.</div> : records.map((r) => (
            <label key={r.id} className="so-record">
              <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              <span><b>{r.trackingCode}</b> · {r.weightKg.toLocaleString()} kg{r.qualityGrade ? ` · grade ${r.qualityGrade}` : ''}{r.farmer ? ` · ${r.farmer.firstName ?? ''} ${r.farmer.lastName ?? ''}` : ''}</span>
            </label>
          ))}
        </div>
        <div className="ua-field">
          <label className="ua-label" htmlFor="wr-manual">Or a counted quantity (kg)<span className="ua-opt">only when no records are picked</span></label>
          <input id="wr-manual" className="input-field" type="number" min={1} step="any" disabled={picked.length > 0} value={manual} onChange={(e) => setManual(e.target.value)} />
        </div>
        <div className="ua-field"><label className="ua-label" htmlFor="wr-note">Note<span className="ua-opt">optional</span></label><input id="wr-note" className="input-field" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {error && <div className="ua-form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}

function MakeLot({ warehouse, onClose, onDone }: { warehouse: Warehouse; onClose: () => void; onDone: () => void }) {
  const free = warehouse.unlottedKg ?? 0;
  const [lotNumber, setLotNumber] = useState('');
  const [variety, setVariety] = useState('');
  const [qty, setQty] = useState(String(free));
  const { saving, error, submit } = useSubmit(onDone);
  return (
    <Modal title={`Make a lot — ${warehouse.name}`} subtitle="Stock that was counted in has no lot, so it can't be sold. A lot labels part of it as rice for sale." onClose={onClose} width="480px" footer={<>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="wh-lot" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create lot'}</button></>}>
      <form id="wh-lot" className="ua-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(() => warehousesApi.makeLot(warehouse.id, { lotNumber: lotNumber.trim(), riceVariety: variety.trim() || undefined, quantityKg: Number(qty) }), 'Could not create the lot'); }}>
        <div className="ua-role-note">{kg(free)} is counted in but not in a lot.</div>
        <div className="ua-field"><label className="ua-label" htmlFor="ml-no">Lot number</label><input id="ml-no" className="input-field" required minLength={3} placeholder="e.g. LOT-2026-001" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} /></div>
        <div className="ua-row">
          <div className="ua-field"><label className="ua-label" htmlFor="ml-var">Rice variety<span className="ua-opt">optional</span></label><input id="ml-var" className="input-field" placeholder="e.g. Super" value={variety} onChange={(e) => setVariety(e.target.value)} /></div>
          <div className="ua-field"><label className="ua-label" htmlFor="ml-qty">Weight (kg)</label><input id="ml-qty" className="input-field" type="number" min={1} max={free} step="any" required value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        </div>
        <span className="ua-hint">This is your own rice, with no source farmers, so selling it produces an invoice but no farmer payouts.</span>
        {error && <div className="ua-form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}

function Adjust({ warehouse, onClose, onDone }: { warehouse: Warehouse; onClose: () => void; onDone: () => void }) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const { saving, error, submit } = useSubmit(onDone);
  return (
    <Modal title={`Adjust stock — ${warehouse.name}`} subtitle="Use a negative number for spoilage or shrinkage. Every adjustment is recorded with your name." onClose={onClose} width="460px" footer={<>
      <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="submit" form="wh-adj" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record adjustment'}</button></>}>
      <form id="wh-adj" className="ua-form" autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(() => warehousesApi.adjust(warehouse.id, { deltaKg: Number(delta), reason }), 'Could not adjust stock'); }}>
        <div className="ua-field"><label className="ua-label" htmlFor="wa-d">Change (kg)</label><input id="wa-d" className="input-field" type="number" step="any" required placeholder="e.g. -25" value={delta} onChange={(e) => setDelta(e.target.value)} /></div>
        <div className="ua-field"><label className="ua-label" htmlFor="wa-r">Reason</label><input id="wa-r" className="input-field" required minLength={3} placeholder="e.g. Spoilage found during recount" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {error && <div className="ua-form-error" role="alert">{error}</div>}
      </form>
    </Modal>
  );
}

function Keepers({ warehouse, onClose, onDone }: { warehouse: Warehouse; onClose: () => void; onDone: () => void }) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [userId, setUserId] = useState('');
  const [keepers, setKeepers] = useState(warehouse.keepers);
  const [error, setError] = useState('');
  useEffect(() => { usersApi.getAll().then((r) => setAccounts(Array.isArray(r.data) ? r.data : (r.data?.data ?? []))).catch((e) => setError(apiErrorMessage(e, 'Could not load accounts'))); }, []);
  const name = (u: { firstName?: string; lastName?: string }) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Account';
  const add = async () => {
    try { await warehousesApi.assignKeeper(warehouse.id, userId); const a = accounts.find((x) => x.id === userId); if (a) setKeepers((k) => [...k, { user: a }]); setUserId(''); setError(''); onDone(); }
    catch (e) { setError(apiErrorMessage(e, 'Could not assign the keeper')); }
  };
  const remove = async (id: string) => {
    try { await warehousesApi.removeKeeper(warehouse.id, id); setKeepers((k) => k.filter((x) => x.user.id !== id)); setError(''); onDone(); }
    catch (e) { setError(apiErrorMessage(e, 'Could not remove the keeper')); }
  };
  const eligible = accounts.filter((a) => (a.mamcosId ?? null) === (warehouse.mamcosId ?? null) && !keepers.some((k) => k.user.id === a.id));
  return (
    <Modal title={`Keepers — ${warehouse.name}`} subtitle="A keeper can only confirm, release and receive stock for the warehouses they keep." onClose={onClose} width="480px" footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <div className="ua-form">
        {keepers.length === 0 ? <div className="ua-hint">No keepers assigned.</div> : (
          <ul className="so-keepers">{keepers.map((k) => (<li key={k.user.id}><span>{name(k.user)}</span><button className="btn-secondary ua-action is-danger" onClick={() => remove(k.user.id)}>Remove</button></li>))}</ul>
        )}
        <div className="ua-field">
          <label className="ua-label" htmlFor="wk-user">Add a keeper</label>
          <div className="so-lookup">
            <select id="wk-user" className="input-field" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select an account…</option>
              {eligible.map((a) => <option key={a.id} value={a.id}>{name(a)}</option>)}
            </select>
            <button className="btn-primary" disabled={!userId} onClick={add}>Add</button>
          </div>
        </div>
        {error && <div className="ua-form-error" role="alert">{error}</div>}
      </div>
    </Modal>
  );
}
