'use client';

import { useEffect } from 'react';

/** Fades [data-reveal] elements in as they enter the view. Content is plain HTML first; this only adds movement. */
export default function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.remove('has-motion');
      return;
    }
    els.forEach((el) => {
      const siblings = Array.from(el.parentElement?.children ?? []).filter((c) => (c as HTMLElement).dataset.reveal !== undefined);
      el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 5) * 0.08}s`);
    });
    root.classList.add('has-motion', 'motion-live');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
