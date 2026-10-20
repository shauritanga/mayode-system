'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { company, nav } from '@/content';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mayodegroup.com';

/** Logo left, floating pill of section links in the centre, sign-in right. Highlights the section being read. */
export default function Nav() {
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

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
    const targets = nav.map((l) => document.querySelector(l.href)).filter(Boolean) as Element[];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(`#${e.target.id}`);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    targets.forEach((t) => io.observe(t));
    const onTop = () => window.scrollY < 200 && setActive('');
    window.addEventListener('scroll', onTop, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onTop);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('menu-open', open);
    return () => document.documentElement.classList.remove('menu-open');
  }, [open]);

  return (
    <header className={`nav${solid ? ' nav--solid' : ''}${hidden ? ' nav--hidden' : ''}${open ? ' nav--open' : ''}`} data-nav>
      <a className="nav__brand" href="#top" aria-label={`${company.name}, back to top`} onClick={() => setOpen(false)}>
        <Image src="/mayode-mark-cream.png" alt="" width={40} height={40} className="nav__logo nav__logo--light" priority unoptimized />
        <Image src="/mayode-mark-green.png" alt="" width={40} height={40} className="nav__logo nav__logo--dark" priority unoptimized />
        <span className="nav__word">
          MAYODE<small>Group Limited</small>
        </span>
      </a>
      <nav className="nav__links" aria-label="Main">
        {nav.map((l) => (
          <a key={l.href} href={l.href} className={active === l.href ? 'is-active' : undefined} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="nav__side">
        <a className="nav__signin" href={`${ADMIN_URL}/login`}>
          Platform sign-in
        </a>
        <button className="nav__toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
