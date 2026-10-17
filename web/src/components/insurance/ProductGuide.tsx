'use client';
import { useEffect, useState } from 'react';
import { insuranceApi } from '@/lib/api';

export interface Product { key: string; name: string; summary: string; paysWhen: string; bestFor: string; sumInsuredBasis: string }

/** The five products in plain language. With `onPick` the cards choose a product. */
export default function ProductGuide({ selected, onPick }: { selected?: string; onPick?: (key: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { insuranceApi.products().then((r) => setProducts(r.data ?? [])).catch(() => setProducts([])); }, []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
      {products.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPick?.(p.key)}
          disabled={!onPick}
          style={{
            textAlign: 'left', padding: 12, borderRadius: 10, background: 'var(--card-bg, transparent)', cursor: onPick ? 'pointer' : 'default',
            border: `2px solid ${selected === p.key ? 'var(--green-500)' : 'var(--border)'}`, color: 'inherit',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
          <div style={{ fontSize: 12, margin: '4px 0' }}>{p.summary}</div>
          <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}><strong>Pays when:</strong> {p.paysWhen}</div>
          <div style={{ fontSize: 11, color: 'var(--neutral-500)' }}><strong>Best for:</strong> {p.bestFor}</div>
        </button>
      ))}
    </div>
  );
}
