'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const SHOW_AFTER_MS = 250; // quick page changes finish before this, so they never flash
const GIVE_UP_AFTER_MS = 60_000;

/**
 * Dims the page and shows a ring while moving to another page is taking time. Starts when an in-app link to a
 * different page is clicked and stops when the new page's address arrives. Clicks are blocked while it shows.
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
  useEffect(() => { hide(); }, [pathname]);

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
    return () => { document.removeEventListener('click', onClick); hide(); };
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
