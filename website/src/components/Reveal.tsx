'use client';

import { useEffect, useRef } from 'react';

/**
 * Scroll behaviour for the page: [data-reveal] elements fade up as they enter the view, the photographs drift against the
 * scroll (parallax) and a thin bar along the top shows how far down the page you are. Content is plain HTML first; this
 * only adds movement, and does nothing when the visitor has asked for reduced motion.
 */
export default function Reveal() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.remove('has-motion');
      return;
    }

    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    els.forEach((el) => {
      const siblings = Array.from(el.parentElement?.children ?? []).filter((c) => (c as HTMLElement).dataset.reveal !== undefined);
      el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 5) * 0.09}s`);
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

    // Parallax: each backdrop photo slides slower than the page around it.
    const layers = Array.from(document.querySelectorAll<HTMLElement>('.hero__img, .media-band__img'));
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      const max = document.documentElement.scrollHeight - vh;
      bar.current?.style.setProperty('--p', String(max > 0 ? Math.min(window.scrollY / max, 1) : 0));
      layers.forEach((img) => {
        const box = (img.parentElement?.closest('section') ?? img.parentElement)?.getBoundingClientRect();
        if (!box || box.bottom < -100 || box.top > vh + 100) return;
        const shift = (box.top + box.height / 2 - vh / 2) * -0.14;
        img.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0) scale(1.18)`;
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div className="progress" ref={bar} aria-hidden="true" />;
}
