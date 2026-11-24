'use client';

import ExportIcons, { saveDownload } from '@/components/ExportIcons';
import { accountingApi } from '@/lib/api';
import { previewBlob, printBlob } from '@/lib/print';

type Format = 'DOCX' | 'XLSX' | 'PDF';
type Res = { data: Blob; headers?: Record<string, unknown> };

/**
 * Word, Excel, PDF, Print and Preview buttons for a list. `get` asks the server for the file in a format; the server builds it from every row
 * that matches the filters, so what is saved or printed is the whole list, not the page on screen.
 */
export function ListExportButtons({ get, name, label }: { get: (format: Format) => Promise<Res>; name: string; label: string }) {
  return <ExportIcons label={label}
    onExport={async (format) => saveDownload(await get(format), `${name}.${format.toLowerCase()}`)}
    onPrint={async (mode) => { const r = await get('PDF'); if (mode === 'print') await printBlob(r.data); else previewBlob(r.data); }} />;
}

/** The same buttons for the accounting lists: say which list and the filters it is showing. */
export default function AccountingExport({ view, params, name, label }: { view: string; params?: Record<string, string | undefined>; name: string; label: string }) {
  return <ListExportButtons label={label} name={name} get={(format) => accountingApi.exportFile({ view, format, ...params }) as Promise<Res>} />;
}

export type ExportColumn = { label: string; align?: 'left' | 'right'; /** false for numbers that are not money (counts, weights) */ money?: boolean };
export type ExportCell = string | number | null;

/**
 * The same buttons for a list that has no export of its own: the screen says what it shows (columns, rows, an optional total row)
 * and the server draws it under the cooperative's official heading. Use it for lists that are loaded in full on the screen.
 */
export function TableExport({ title, subtitle, name, label, columns, rows, totals }: {
  title: string; subtitle?: string; name: string; label?: string; columns: ExportColumn[]; rows: ExportCell[][]; totals?: ExportCell[];
}) {
  return <ListExportButtons label={label ?? `Export ${title.toLowerCase()}`} name={name}
    get={(format) => accountingApi.exportTable({ format, title, subtitle, name, columns, rows, totals }) as Promise<Res>} />;
}
