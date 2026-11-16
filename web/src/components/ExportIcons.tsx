'use client';

import { useState } from 'react';
import { Eye, FileSpreadsheet, FileText, FileType2, Printer } from 'lucide-react';

type Format = 'DOCX' | 'XLSX' | 'PDF';

/** Small Word, Excel and PDF buttons: click one to download what the list shows, everything that matches, not just the page. */
export default function ExportIcons({ onExport, onPrint, label = 'Export' }: { onExport: (format: Format) => Promise<unknown>; /** Print or preview the PDF: gives the Print and Preview buttons. */ onPrint?: (mode: 'print' | 'preview') => Promise<unknown>; label?: string }) {
  const [busy, setBusy] = useState<Format | 'PRINT' | 'PREVIEW' | ''>('');
  const [error, setError] = useState('');
  const go = async (f: Format | 'PRINT' | 'PREVIEW') => {
    if (busy) return;
    setBusy(f); setError('');
    try { if (f === 'PRINT' || f === 'PREVIEW') await onPrint?.(f === 'PRINT' ? 'print' : 'preview'); else await onExport(f); } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- axios error with an optional blob body
      let msg = e?.message || 'Could not export.';
      try { const t = await e?.response?.data?.text?.(); if (t) msg = JSON.parse(t).message ?? msg; } catch { /* keep msg */ }
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally { setBusy(''); }
  };
  const btn = (f: Format | 'PRINT' | 'PREVIEW', title: string, color: string, Icon: typeof FileText) => (
    <button key={f} type="button" title={title} aria-label={title} disabled={!!busy} onClick={() => void go(f)}
      style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, border: `1px solid ${color}55`, background: `${color}1f`, color, cursor: busy ? 'wait' : 'pointer', opacity: busy && busy !== f ? 0.5 : 1 }}>
      {busy === f ? <span style={{ fontSize: 11 }}>…</span> : <Icon size={16} strokeWidth={2} />}
    </button>
  );
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} role="group" aria-label={label}>
      {btn('DOCX', 'Export to Word', '#2b6cd9', FileText)}
      {btn('XLSX', 'Export to Excel', '#1f9d55', FileSpreadsheet)}
      {btn('PDF', 'Download PDF', '#d64545', FileType2)}
      {onPrint && btn('PRINT', 'Print', '#475569', Printer)}
      {onPrint && btn('PREVIEW', 'Print preview', '#7c3aed', Eye)}
      {error && <span role="alert" style={{ color: 'var(--red-400)', fontSize: 12, marginLeft: 4 }}>{error}</span>}
    </span>
  );
}

/** Saves a blob the browser received as a file, using the name the server suggested. */
export function saveDownload(res: { data: Blob; headers?: Record<string, unknown> }, fallbackName: string) {
  const header = String(res.headers?.['content-disposition'] ?? '');
  const name = /filename="?([^";]+)"?/i.exec(header)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
