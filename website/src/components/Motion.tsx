'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/** Splits a text node into word spans so each word can be revealed on its own as the page is scrolled. */
function splitWords(el: HTMLElement): HTMLElement[] {
  const text = (el.textContent ?? '').trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  return text.split(/\s+/).map((word, i, all) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = word;
    el.appendChild(span);
    if (i < all.length - 1) el.appendChild(document.createTextNode(' '));
    return span;
  });
}

/**
 * All scroll behaviour for the page: smooth scrolling, the opening sequence, word-by-word text, image reveals and
 * parallax, the pinned sideways run of target sectors and the growing stem. Content is plain HTML first; this only
 * adds movement, and does nothing when the visitor has asked for reduced motion.
 */
export default function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.remove('has-motion');
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    root.classList.add('has-motion', 'motion-live');

    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute('href') ?? '';
      const target = id === '#top' ? 0 : document.querySelector<HTMLElement>(id);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target as number | HTMLElement, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      history.replaceState(null, '', id);
    };
    document.addEventListener('click', onClick);

    const q = <T extends HTMLElement = HTMLElement>(sel: string) => gsap.utils.toArray<T>(sel);

    const ctx = gsap.context(() => {
      // ---- Opening sequence -------------------------------------------------
      const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
      intro
        .fromTo('.hero__img', { scale: 1.24 }, { scale: 1, duration: 2.8 }, 0)
        .fromTo('[data-hero-line]', { yPercent: 118, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 1.5, stagger: 0.16 }, 0.25)
        .fromTo('[data-hero-in]', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, stagger: 0.14 }, 0.8)
        .fromTo('[data-nav]', { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 0.5);

      gsap.to('[data-hero-media]', {
        yPercent: 14,
        scale: 1.07,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('[data-hero-copy]', {
        yPercent: -16,
        opacity: 0.05,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: '75% top', scrub: true },
      });

      // ---- Text that fills in word by word ---------------------------------
      q('[data-words], [data-words-dark]').forEach((el) => {
        const words = splitWords(el);
        gsap.fromTo(
          words,
          { opacity: 0.14 },
          {
            opacity: 1,
            ease: 'none',
            stagger: 0.12,
            scrollTrigger: { trigger: el, start: 'top 84%', end: 'bottom 52%', scrub: true },
          },
        );
      });

      // ---- Simple entrances -------------------------------------------------
      ScrollTrigger.batch('[data-reveal]', {
        start: 'top 90%',
        once: true,
        onEnter: (els) =>
          gsap.fromTo(els, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 1.15, ease: 'power3.out', stagger: 0.13, overwrite: true }),
      });

      // ---- Photographs: open up as they arrive, drift as they pass ----------
      q('[data-clip]').forEach((fig) => {
        gsap.fromTo(
          fig,
          { clipPath: 'inset(16% 12% 16% 12% round 28px)' },
          {
            clipPath: 'inset(0% 0% 0% 0% round 6px)',
            ease: 'none',
            scrollTrigger: { trigger: fig, start: 'top 94%', end: 'top 34%', scrub: true },
          },
        );
        const img = fig.querySelector('img');
        if (img) {
          gsap.fromTo(
            img,
            { yPercent: -8, scale: 1.18 },
            { yPercent: 8, scale: 1.18, ease: 'none', scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true } },
          );
        }
      });

      q('[data-band-media]').forEach((media) => {
        gsap.fromTo(
          media,
          { yPercent: -9 },
          { yPercent: 9, ease: 'none', scrollTrigger: { trigger: media.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } },
        );
      });

      // ---- Services: each row draws its rule, then lights up in the middle ---
      q('[data-svc]').forEach((row) => {
        const trigger = { trigger: row, start: 'top 86%', once: true };
        gsap.fromTo(row.querySelector('[data-svc-rule]'), { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 1.6, ease: 'expo.out', scrollTrigger: trigger });
        gsap.fromTo(
          row.querySelectorAll('.svc__n, .svc__title, .svc__text'),
          { y: 38, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.1, stagger: 0.1, ease: 'power3.out', scrollTrigger: trigger },
        );
        gsap.fromTo(
          row.querySelectorAll('[data-svc-pic]'),
          { y: 60, opacity: 0, rotate: (i: number) => (i % 2 ? 4 : -4) },
          { y: 0, opacity: 1, rotate: (i: number) => (i % 2 ? 1.6 : -1.6), duration: 1.2, stagger: 0.14, ease: 'power3.out', scrollTrigger: trigger },
        );
        ScrollTrigger.create({ trigger: row, start: 'top 60%', end: 'bottom 40%', toggleClass: { targets: row, className: 'is-active' } });
      });

      // ---- Measurement, reporting, verification -----------------------------
      q('[data-mrv-step]').forEach((step) => {
        ScrollTrigger.create({ trigger: step, start: 'top 70%', toggleClass: { targets: step, className: 'is-on' } });
      });

      // ---- Drifting line of words ------------------------------------------
      gsap.fromTo(
        '[data-marquee-track]',
        { xPercent: 0 },
        { xPercent: -34, ease: 'none', scrollTrigger: { trigger: '[data-marquee]', start: 'top bottom', end: 'bottom top', scrub: 0.7 } },
      );

      // ---- The growing stem -------------------------------------------------
      const grow = document.querySelector<SVGPathElement>('[data-stem-grow]');
      const leaves = q<HTMLElement>('[data-stem-leaf]') as unknown as SVGElement[];
      if (grow) {
        const len = grow.getTotalLength();
        gsap.set(grow, { strokeDasharray: len, strokeDashoffset: len });
        gsap.set(leaves, { opacity: 0, scale: 0.4, transformOrigin: '20px 200px' });
        ScrollTrigger.create({
          start: 0,
          end: 'max',
          onUpdate: (self) => {
            gsap.set(grow, { strokeDashoffset: len * (1 - self.progress) });
            leaves.forEach((leaf, i) => {
              const on = self.progress > (i + 0.6) / (leaves.length + 0.8);
              gsap.to(leaf, { opacity: on ? 1 : 0, scale: on ? 1 : 0.4, duration: 0.6, overwrite: true });
            });
          },
        });
      }

      // ---- Sideways run of target sectors (wide screens only) ---------------
      const mm = gsap.matchMedia();
      mm.add('(min-width: 900px)', () => {
        const section = document.querySelector<HTMLElement>('[data-markets]');
        const track = document.querySelector<HTMLElement>('[data-markets-track]');
        const bar = document.querySelector<HTMLElement>('[data-markets-bar]');
        if (!section || !track) return;
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 120);
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => bar && gsap.set(bar, { scaleX: self.progress }),
          },
        });
        gsap.utils.toArray<HTMLElement>('.sector__n').forEach((n) => {
          gsap.fromTo(n, { xPercent: 12 }, { xPercent: -12, ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance()}`, scrub: true } });
        });
      });
    });

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);

    return () => {
      window.removeEventListener('load', refresh);
      document.removeEventListener('click', onClick);
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
      root.classList.remove('motion-live');
    };
  }, []);

  return null;
}
