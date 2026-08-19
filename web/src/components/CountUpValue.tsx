'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

/**
 * Splits "TZS 1,234,500 kg" into prefix / numeric core / suffix so the
 * number can count up on load while units and currency stay put.
 * Returns null for non-numeric values like "—".
 */
function parseNumericValue(value: string | number): { prefix: string; num: number; suffix: string; decimals: number } | null {
  if (typeof value === 'number') {
    return { prefix: '', num: value, suffix: '', decimals: Number.isInteger(value) ? 0 : 2 };
  }
  const match = String(value).match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const decimals = match[2].includes('.') ? match[2].split('.')[1].length : 0;
  return { prefix: match[1], num: parseFloat(match[2].replace(/,/g, '')), suffix: match[3], decimals };
}

function format(num: number, decimals: number) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function AnimatedNumber({ num, decimals }: { num: number; decimals: number }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? num : 0);
  const prevNum = useRef(reduce ? num : 0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(prevNum.current, num, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prevNum.current = num;
    return () => controls.stop();
  }, [num, reduce]);

  return <>{format(reduce ? num : display, decimals)}</>;
}

export function CountUpValue({ value }: { value: string | number }) {
  const parsed = useMemo(() => parseNumericValue(value), [value]);

  if (!parsed) return <>{value}</>;
  return (
    <>
      {parsed.prefix}
      <AnimatedNumber num={parsed.num} decimals={parsed.decimals} />
      {parsed.suffix}
    </>
  );
}

export default CountUpValue;
