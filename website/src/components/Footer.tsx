import Image from 'next/image';
import { company, nav } from '@/content';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mayodegroup.com';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__row">
        <div className="footer__brand">
          <Image src="/mayode-mark-cream.png" alt="" width={56} height={56} unoptimized />
          <div>
            <strong>{company.name}</strong>
            <span>{company.tagline}</span>
          </div>
        </div>
        <nav aria-label="Footer">
          {nav.map((l) => (<a key={l.href} href={l.href}>{l.label}</a>))}
          <a href={`${ADMIN_URL}/login`}>Platform sign-in</a>
        </nav>
      </div>
      <div className="wrap footer__base">
        <span>© {new Date().getFullYear()} {company.name}. All rights reserved.</span>
        <span>{company.address.slice(1, 4).join(', ')}</span>
      </div>
    </footer>
  );
}
