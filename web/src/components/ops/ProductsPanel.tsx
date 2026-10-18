'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { kg, label, tzs } from '@/lib/ops';
import { DataTable, ErrorNote, Field, FormGrid, Loading, Toolbar, useAction, useLoad } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function ProductsPanel({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const [edit, setEdit] = useState<any>(null);
  const { data, error, loading, reload } = useLoad<any[]>(() => opsApi.products());
  return (
    <>
      <Toolbar right={canCreate && <button className="btn-primary" onClick={() => setEdit({})}>New product</button>}>{null}</Toolbar>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : (
        <DataTable rows={data ?? []} rowKey={(p) => p.id} onRow={canEdit ? (p) => setEdit(p) : undefined} empty="No products yet. Add paddy, each rice brand and pack size, broken rice and by-products."
          columns={[{ header: 'Code', render: (p) => p.code }, { header: 'Product', render: (p) => <strong>{p.name}</strong> }, { header: 'Brand', render: (p) => p.brand ?? '—' }, { header: 'Kind', render: (p) => label(p.category) },
            { header: 'Variety', render: (p) => p.riceVariety ?? '—' }, { header: 'Pack', render: (p) => (p.packSizeKg ? kg(p.packSizeKg) : '—') }, { header: 'Price', align: 'right', render: (p) => (p.unitPrice != null ? tzs(p.unitPrice) : '—') },
            { header: 'Tax %', align: 'right', render: (p) => p.taxRatePercent }, { header: 'Active', render: (p) => (p.isActive ? 'Yes' : 'No') }]} />
      )}
      {edit && <ProductModal product={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function ProductModal({ product, onClose, onSaved }: { product: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: product.code ?? '', name: product.name ?? '', brand: product.brand ?? '', riceVariety: product.riceVariety ?? '', category: product.category ?? 'PROCESSED', grade: product.grade ?? '',
    packSizeKg: product.packSizeKg != null ? String(product.packSizeKg) : '', unit: product.unit ?? 'kg', unitPrice: product.unitPrice != null ? String(product.unitPrice) : '',
    taxRatePercent: product.taxRatePercent != null ? String(product.taxRatePercent) : '0', reorderLevelKg: product.reorderLevelKg != null ? String(product.reorderLevelKg) : '', isActive: product.isActive ?? true,
  });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  const submit = async () => {
    const body = { code: f.code || undefined, name: f.name, brand: f.brand || undefined, riceVariety: f.riceVariety || undefined, category: f.category, grade: f.grade || undefined, packSizeKg: num(f.packSizeKg), unit: f.unit || undefined, unitPrice: num(f.unitPrice), taxRatePercent: num(f.taxRatePercent), reorderLevelKg: num(f.reorderLevelKg), isActive: f.isActive };
    if ((await run(() => opsApi.saveProduct(body, product.id))) !== undefined) onSaved();
  };
  return (
    <Modal title={product.id ? `Edit ${product.name}` : 'New product'} width="720px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={submit}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <ErrorNote message={error} />
      <FormGrid>
        <Field label="Name"><input className="input-field" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Code" hint="Leave blank to generate one"><input className="input-field" value={f.code} onChange={(e) => set('code', e.target.value)} /></Field>
        <Field label="Kind"><select className="input-field" value={f.category} onChange={(e) => set('category', e.target.value)}><option value="PADDY">Paddy</option><option value="PROCESSED">Processed rice</option><option value="BROKEN">Broken rice</option><option value="BYPRODUCT">By-product (bran, husk)</option></select></Field>
        <Field label="Brand"><input className="input-field" value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
        <Field label="Rice variety"><input className="input-field" value={f.riceVariety} onChange={(e) => set('riceVariety', e.target.value)} /></Field>
        <Field label="Grade"><input className="input-field" value={f.grade} onChange={(e) => set('grade', e.target.value)} /></Field>
        <Field label="Pack size (kg)" hint="For bagged rice, e.g. 5, 10, 25, 50"><input className="input-field" type="number" value={f.packSizeKg} onChange={(e) => set('packSizeKg', e.target.value)} /></Field>
        <Field label="Sold by"><select className="input-field" value={f.unit} onChange={(e) => set('unit', e.target.value)}><option value="kg">Kilogram</option><option value="bag">Bag</option></select></Field>
        <Field label="Standard price (TZS)"><input className="input-field" type="number" value={f.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} /></Field>
        <Field label="Tax rate (%)"><input className="input-field" type="number" value={f.taxRatePercent} onChange={(e) => set('taxRatePercent', e.target.value)} /></Field>
        <Field label="Low-stock level (kg)"><input className="input-field" type="number" value={f.reorderLevelKg} onChange={(e) => set('reorderLevelKg', e.target.value)} /></Field>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />Active</label>
      </FormGrid>
    </Modal>
  );
}
