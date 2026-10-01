/** Prevent spreadsheet formulas from executing when user-supplied values are exported. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.map(csvCell).join(','), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function apiError(error: unknown, fallback = 'Unable to complete this request.') {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : message || fallback;
}
