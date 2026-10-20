'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { company, nav } from '@/content';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mayodegroup.com';

/** Fixed header: clear over the photograph, solid once the page is scrolled, and out of the way while reading downwards. */
export default function Nav() {
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setSolid(y > 60);
      setHidden(y > 500 && y > last + 4 && !open);
      if (y < last - 4) setHidden(false);
      last = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [open]);

  useEffect(() => {
    document.documentElement.classList.toggle('menu-open', open);
    return () => document.documentElement.classList.remove('menu-open');
  }, [open]);

  return (
    <header className={`nav${solid ? ' nav--solid' : ''}${hidden ? ' nav--hidden' : ''}${open ? ' nav--open' : ''}`} data-nav>
      <a className="nav__brand" href="#top" aria-label={`${company.name}, back to top`} onClick={() => setOpen(false)}>
        <Image src="/mayode-mark-cream.png" alt="" width={44} height={44} className="nav__logo nav__logo--light" priority unoptimized />
        <Image src="/mayode-mark-green.png" alt="" width={44} height={44} className="nav__logo nav__logo--dark" priority unoptimized />
        <span className="nav__word">
          MAYODE<small>Group Limited</small>
        </span>
      </a>
      <nav className="nav__links" aria-label="Main">
        {nav.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
      </nav>
      <a className="nav__signin" href={`${ADMIN_URL}/login`}>
        Platform sign-in
      </a>
      <button className="nav__toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
        <span />
        <span />
      </button>
    </header>
  );
}
