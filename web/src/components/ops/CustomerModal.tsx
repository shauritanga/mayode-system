'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { opsApi } from '@/lib/api';
import { Field, FormGrid, ErrorNote, useAction } from './ui';

export interface Customer {
  id: string; reference: string; type: 'INDIVIDUAL' | 'BUSINESS'; name: string; phone: string; email: string | null; address: string | null; idNumber: string | null;
  contactPerson: string | null; businessRegNo: string | null; tin: string | null; vrn: string | null; billingAddress: string | null; notes: string | null; isActive: boolean;
}

/** A person is not asked for company details, and a company must name a contact. */
export default function CustomerModal({ customer, onClose, onSaved }: { customer?: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
  const [f, setF] = useState({
    type: customer?.type ?? 'INDIVIDUAL', name: customer?.name ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '', address: customer?.address ?? '', idNumber: customer?.idNumber ?? '',
    contactPerson: customer?.contactPerson ?? '', businessRegNo: customer?.businessRegNo ?? '', tin: customer?.tin ?? '', vrn: customer?.vrn ?? '', billingAddress: customer?.billingAddress ?? '', notes: customer?.notes ?? '',
  });
  const { busy, error, run } = useAction();
  const biz = f.type === 'BUSINESS';
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => String(v).trim() !== ''));
    const r = await run(() => opsApi.saveCustomer(clean, customer?.id));
    if (r) onSaved(r.data as Customer);
  };
  return (
    <Modal title={customer ? `Edit ${customer.reference}` : 'Register customer'} subtitle="Search first: check the customer is not already registered." width="620px" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" disabled={busy || !f.name.trim() || !f.phone.trim() || (biz && !f.contactPerson.trim())} onClick={save}>{busy ? 'Saving…' : 'Save customer'}</button></>}>
      <ErrorNote message={error} />
      <div className="seg-control" style={{ marginBottom: 12 }}>
        {(['INDIVIDUAL', 'BUSINESS'] as const).map((t) => <button key={t} type="button" className={`seg-btn ${f.type === t ? 'active' : ''}`} onClick={() => set('type', t)} disabled={!!customer}>{t === 'INDIVIDUAL' ? 'Individual' : 'Business or institution'}</button>)}
      </div>
      <FormGrid>
        <Field label={biz ? 'Registered business name' : 'Full name'}><input className="input-field" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Phone number"><input className="input-field" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="input-field" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label={biz ? 'Business address' : 'Address or location'}><input className="input-field" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        {biz ? (
          <>
            <Field label="Contact person"><input className="input-field" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></Field>
            <Field label="Business registration number"><input className="input-field" value={f.businessRegNo} onChange={(e) => set('businessRegNo', e.target.value)} /></Field>
            <Field label="TIN"><input className="input-field" value={f.tin} onChange={(e) => set('tin', e.target.value)} /></Field>
            <Field label="VRN (VAT)"><input className="input-field" value={f.vrn} onChange={(e) => set('vrn', e.target.value)} /></Field>
            <Field label="Billing address" wide><input className="input-field" value={f.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} /></Field>
          </>
        ) : (
          <Field label="ID number (if required)"><input className="input-field" value={f.idNumber} onChange={(e) => set('idNumber', e.target.value)} /></Field>
        )}
        <Field label="Notes" wide><input className="input-field" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}
