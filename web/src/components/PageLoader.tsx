'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const SHOW_AFTER_MS = 250; // quick page changes finish before this, so they never flash
const GIVE_UP_AFTER_MS = 60_000;

/** Anything a screen draws while it waits for its data. The loader stands in for all of it, so these are hidden (see globals.css). */
const WAITING = '.skeleton, .ua-skel, .farmers-skeleton';

/**
 * Dims the page and shows a ring while a page is taking time: after an in-app link is clicked until the new page
 * arrives, and whenever a screen is still waiting for its data. Clicks are blocked while it shows.
 */
export default function PageLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<number | null>(null);
  const giveUpTimer = useRef<number | null>(null);

  const hide = () => {
    if (showTimer.current) window.clearTimeout(showTimer.current);
    if (giveUpTimer.current) window.clearTimeout(giveUpTimer.current);
    showTimer.current = giveUpTimer.current = null;
    setVisible(false);
  };

  // The new page has arrived.
  useEffect(() => {
    hide();
    // ...but if that page is itself still waiting for data, keep covering it.
    const t = window.setTimeout(() => { if (document.querySelector(WAITING)) setVisible(true); }, SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (showTimer.current) return;
      showTimer.current = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      giveUpTimer.current = window.setTimeout(hide, GIVE_UP_AFTER_MS);
    };
    document.addEventListener('click', onClick);

    // A screen that is still waiting for its data counts too; shown only if the wait outlasts SHOW_AFTER_MS.
    let waitTimer: number | null = null;
    let waiting = false;
    const check = () => {
      const now = !!document.querySelector(WAITING);
      if (now === waiting) return;
      waiting = now;
      if (waitTimer) { window.clearTimeout(waitTimer); waitTimer = null; }
      if (now) waitTimer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      else if (!showTimer.current) setVisible(false);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => { document.removeEventListener('click', onClick); observer.disconnect(); if (waitTimer) window.clearTimeout(waitTimer); hide(); };
  }, []);

  if (!visible) return null;
  return (
    <div className="page-loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="page-loader-spinner" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
      </div>
    </div>
  );
}
