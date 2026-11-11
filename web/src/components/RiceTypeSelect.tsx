'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as elsewhere */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { riceVarietiesApi } from '@/lib/api';

// One shared fetch (a minute's memory) so a screen with several rice type fields asks the server once.
let cache: { at: number; names: Promise<string[]> } | null = null;
function loadNames(): Promise<string[]> {
  if (!cache || Date.now() - cache.at > 60_000) {
    cache = { at: Date.now(), names: riceVarietiesApi.list().then((r) => (Array.isArray(r.data) ? r.data : r.data?.data ?? []).filter((v: any) => v.isActive !== false).map((v: any) => String(v.name))).catch(() => { cache = null; return []; }) };
  }
  return cache.names;
}
/** Forget the list, for after rice types were added or switched off in Settings. */
export const refreshRiceTypes = () => { cache = null; };

/**
 * The rice type, chosen from the list kept in Settings → Rice types (never typed in). The value is the type's name, which is what the
 * records store. A value that is no longer on the list (an older record) stays selectable so it is not lost.
 */
export default function RiceTypeSelect({ value, onChange, id, required, disabled, placeholder = 'Choose the rice type…', className = 'input-field', style }: {
  value: string; onChange: (name: string) => void; id?: string; required?: boolean; disabled?: boolean; placeholder?: string; className?: string; style?: React.CSSProperties;
}) {
  const [names, setNames] = useState<string[] | null>(null);
  useEffect(() => { let live = true; void loadNames().then((n) => { if (live) setNames(n); }); return () => { live = false; }; }, []);
  const list = names ?? [];
  const extra = value && !list.some((n) => n.toLowerCase() === value.toLowerCase()) ? value : null;
  const empty = names !== null && list.length === 0 && !value;
  return (
    <>
      <select id={id} className={className} style={style} value={value} required={required} disabled={disabled || names === null || empty} onChange={(e) => onChange(e.target.value)}>
        <option value="">{names === null ? 'Loading…' : empty ? 'No rice types set up' : placeholder}</option>
        {extra && <option value={extra}>{extra} (not on your list)</option>}
        {list.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      {empty && <span className="muted" style={{ fontSize: 11 }}>Add them in <Link href="/dashboard/amcos-settings/rice-types">Settings → Rice types</Link>.</span>}
    </>
  );
}
