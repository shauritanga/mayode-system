'use client';

import { useEffect, useRef, useState } from 'react';

type Stat = { value: number; label: string };

function Count({ to }: { to: number }) {
  const ref = useRef<HTMLElement>(null);
  const [n, setN] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setN(0);
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - start) / 1100, 1);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <strong ref={ref}>{n}</strong>;
}

/** Overlapping card under the hero. Every figure is a count of what the page itself lists. */
export default function Stats({ items }: { items: Stat[] }) {
  return (
    <div className="stats-wrap">
      <div className="wrap">
        <div className="stats">
          {items.map((s) => (
            <div className="stat" key={s.label}>
              <Count to={s.value} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
