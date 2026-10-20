import Image from 'next/image';
import { company, nav } from '@/content';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mayodegroup.com';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__grid">
        <div>
          <div className="footer__brand">
            <Image src="/mayode-mark-cream.png" alt="" width={44} height={44} unoptimized />
            <strong>{company.name}</strong>
          </div>
          <p>{company.tagline} {company.motto}</p>
        </div>
        <div>
          <h4>Quick links</h4>
          <ul>
            {nav.map((l) => (<li key={l.href}><a href={l.href}>{l.label}</a></li>))}
          </ul>
        </div>
        <div>
          <h4>Platform</h4>
          <ul>
            <li><a href={`${ADMIN_URL}/login`}>Platform sign-in</a></li>
            <li><a href="#digital">MAYOData, MAYODE App &amp; Agribongo</a></li>
            <li><a href="#compliance">Compliance</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact us</h4>
          <address>
            <a href={company.phoneHref}>{company.phone}</a>
            <a href={`mailto:${company.email}`}>{company.email}</a>
            {company.address.map((l) => (<span key={l}>{l}</span>))}
          </address>
        </div>
      </div>
      <div className="wrap footer__base">
        <span>© {new Date().getFullYear()} {company.name}. All rights reserved.</span>
        <span>{company.address.slice(1, 4).join(', ')}</span>
      </div>
    </footer>
  );
}
