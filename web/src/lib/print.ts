/**
 * Printing, everywhere. A document that comes from the server as a PDF is printed (or previewed) straight from the PDF the user would download,
 * so what is printed is exactly what is saved. A screen is printed as it stands, with its own print layout (see globals.css, "Printing").
 */

/** Opens the browser's print dialog for a PDF. The dialog shows the preview and lets the user choose a printer or "Save as PDF". */
export function printBlob(data: BlobPart, type = 'application/pdf'): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    let fell = false;
    const fallback = () => { if (!fell) { fell = true; window.open(url, '_blank', 'noopener'); } }; // some browsers will not print an embedded PDF: open it instead, where its own print button works
    frame.onload = () => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { fallback(); }
      resolve();
    };
    frame.onerror = () => { fallback(); resolve(); };
    frame.src = url;
    document.body.appendChild(frame);
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 120_000);
  });
}

/** Opens a PDF in a new tab to look it over before printing or saving. */
export function previewBlob(data: BlobPart, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** Prints the screen the user is on. */
export function printPage() {
  window.print();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Prints one part of the screen (a receipt, a statement, a detail window) on its own page, with the system's styles,
 * a title and the date. Buttons and fields are left out, so only the document is printed.
 */
export function printElement(el: HTMLElement, title: string, by?: string) {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button, [data-no-print], .no-print, [role="tablist"]').forEach((n) => n.remove());
  clone.querySelectorAll('input, select, textarea').forEach((n) => {
    const f = n as HTMLInputElement; const span = document.createElement('span');
    span.textContent = f.tagName === 'SELECT' ? (f as unknown as HTMLSelectElement).selectedOptions[0]?.text ?? '' : f.value; n.replaceWith(span);
  });
  const head = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('');
  const when = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${head}<style>
    @page { margin: 14mm; } html, body { background:#fff !important; color:#111 !important; height:auto !important; overflow:visible !important; }
    body { padding: 0; font-family: system-ui, sans-serif; } * { color:#111 !important; box-shadow:none !important; backdrop-filter:none !important; }
    .print-doc-head { border-bottom: 2px solid #111; margin-bottom: 14px; padding-bottom: 8px; } .print-doc-head h1 { font-size: 20px; margin: 0; } .print-doc-head p { margin: 2px 0 0; font-size: 12px; color:#555 !important; }
    .glass-card, [role="dialog"] { background:none !important; border:none !important; max-height:none !important; width:100% !important; overflow:visible !important; }
    div[style*="overflow"] { overflow: visible !important; max-height: none !important; } table { width:100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #ccc; }
  </style></head><body><div class="print-doc-head"><h1>${esc(title)}</h1><p>Printed ${esc(when)}${by ? ` by ${esc(by)}` : ''}</p></div>${clone.outerHTML}</body></html>`);
  doc.close();
  const go = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } finally { setTimeout(() => frame.remove(), 60_000); } };
  setTimeout(go, 500); // let the styles load
}
