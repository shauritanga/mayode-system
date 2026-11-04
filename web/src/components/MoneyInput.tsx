'use client';
import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

/** 1234567.5 → "1,234,567.5". Only the whole part is grouped; what was typed after the point is left as it is. */
export function formatMoney(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const [whole, fraction] = raw.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`;
}

/** What was typed, reduced to a plain number string: digits, at most one point, and a leading minus when allowed. */
export function cleanMoney(text: string, allowNegative: boolean): string {
  let out = '';
  let seenPoint = false;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seenPoint) { out += ch; seenPoint = true; }
    else if (ch === '-' && allowNegative && out === '' && text.trimStart().startsWith('-')) out = '-';
  }
  return out;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'min' | 'max' | 'step'> & {
  value: string | number | null | undefined;
  /** Called with the plain number as text, no commas. The argument looks like an input event, so `e.target.value` works as before. */
  onChange: (event: { target: { value: string }; currentTarget: { value: string } }) => void;
  /** Kept so call sites read like a number input; money fields are validated by the server. A `min` of 0 or more also stops a minus sign. */
  min?: number | string;
  max?: number | string;
  step?: number | string;
};

/**
 * A text box for amounts of money that shows thousands separators while you type (1,250,000) and hands the plain number
 * (1250000) to the form. Use it wherever the screen asks for an amount in shillings.
 */
export default function MoneyInput({ value, onChange, min, max: _max, step: _step, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  const allowNegative = min === undefined || Number(min) < 0;
  const raw = value == null ? '' : String(value);
  const shown = formatMoney(raw);

  // After the text is regrouped, put the cursor back after the same digits it was after.
  useLayoutEffect(() => {
    if (caret.current == null || !ref.current) return;
    let seen = 0;
    let pos = 0;
    for (; pos < shown.length && seen < caret.current; pos++) if (shown[pos] !== ',') seen++;
    ref.current.setSelectionRange(pos, pos);
    caret.current = null;
  }, [shown]);

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const text = e.target.value;
        const cleaned = cleanMoney(text, allowNegative);
        const at = e.target.selectionStart ?? text.length;
        // Only worth restoring when the text will actually change on screen.
        caret.current = cleaned === raw ? null : text.slice(0, at).replace(/[^0-9.-]/g, '').length;
        onChange({ target: { value: cleaned }, currentTarget: { value: cleaned } });
      }}
    />
  );
}
