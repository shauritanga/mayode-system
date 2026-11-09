'use client';
import { farmId } from '@/lib/farm-id';
/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped JSON, as in the other dashboard screens */

import { useEffect, useRef, useState } from 'react';
import { irrigationApi } from '@/lib/api';
import { Field, useApi, useDebounced } from '../irrigation/ui';
import { useSchemeScope } from '../irrigation/useSchemeScope';

/** Searchable dropdown of the hectares nobody holds yet. A hectare's code already says which canal and block it is in. */
/** `up` opens the list above the field, for a field near the bottom of a form or modal. */
export default function HectarePicker({ value, onChange, error, up = false }: { value: { id: string; code: string } | null; onChange: (h: { id: string; code: string } | null) => void; error?: string; up?: boolean }) {
  const { schemeId, schemes } = useSchemeScope();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const term = useDebounced(q.trim(), 250);
  const found = useApi<any>(open && schemeId ? () => irrigationApi.hectares({ schemeId, status: 'AVAILABLE', q: term || undefined, page: 1, pageSize: 20 }) : null, [schemeId, term, open]);
  const list: any[] = found.data?.data ?? [];
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const pick = (h: any) => { onChange({ id: h.id, code: farmId(h.code) }); setOpen(false); setQ(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const empty = !schemes.loading && !schemeId ? 'Register the irrigation scheme first.' : term ? 'No free hectare matches.' : 'No free hectares left.';
  return (
    <Field label="Hectare *" error={error} hint="Its code becomes the farmer's ID">
      <div ref={box} style={{ position: 'relative' }}>
        <input className="input-field" role="combobox" aria-controls="hectare-picker-list" aria-expanded={open} aria-autocomplete="list" autoComplete="off"
          value={open ? q : value?.code ?? ''} placeholder={value ? value.code : 'Select or search a hectare'}
          onFocus={() => { setOpen(true); setActive(0); }} onClick={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey}
          style={{ cursor: 'pointer', paddingRight: 34 }} />
        <span aria-hidden style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.6, fontSize: 11 }}>▾</span>
        {open && (
          <div id="hectare-picker-list" role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, ...(up ? { bottom: 'calc(100% + 4px)' } : { top: 'calc(100% + 4px)' }), maxHeight: 200, overflowY: 'auto', background: 'var(--surface-1, #111613)', border: '1px solid var(--border-subtle, #2a2f2c)', borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,.35)' }}>
            {found.loading && !list.length ? <div className="muted" style={{ padding: 12, fontSize: 13 }}>Loading hectares…</div>
              : !list.length ? <div className="muted" style={{ padding: 12, fontSize: 13 }}>{empty}</div>
              : list.map((h, i) => (
                <button key={h.id} type="button" role="option" aria-selected={value?.id === h.id} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, borderBottom: '1px solid var(--border-subtle, #2a2f2c)', color: 'inherit', cursor: 'pointer', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5, fontWeight: 600, background: i === active ? 'rgba(127,127,127,.14)' : 'none' }}>
                  {farmId(h.code)}
                </button>
              ))}
            {list.length >= 20 && <div className="muted" style={{ padding: '8px 12px', fontSize: 12 }}>Type to narrow the list…</div>}
          </div>
        )}
      </div>
    </Field>
  );
}
