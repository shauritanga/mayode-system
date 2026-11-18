/** Numbers and money always use thousands commas (1,250,000), whatever language the phone is set to. */
export const formatNumber = (n?: number | null, maxDecimals = 2): string =>
  n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: maxDecimals });

export const tzs = (n?: number | null): string => (n == null ? '—' : `TZS ${formatNumber(Math.round(Number(n)))}`);

/** "1250000.5" → "1,250,000.5". Only the whole part is grouped; what was typed after the point is left alone. */
export function groupDigits(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const [whole, fraction] = raw.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`;
}

/** What was typed, reduced to a plain number string: digits and at most one point. */
export function plainDigits(text: string): string {
  let out = '';
  let seenPoint = false;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seenPoint) { out += ch; seenPoint = true; }
  }
  return out;
}
