import Image from 'next/image';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight02Icon,
  Route01Icon,
  UserGroupIcon,
  Leaf01Icon,
  Shield01Icon,
  Wallet01Icon,
  ShoppingCart02Icon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mayodegroup.com';
const LOGIN_URL = `${ADMIN_URL}/login`;

const FEATURES = [
  {
    icon: Route01Icon,
    title: 'Traceability',
    copy: 'Follow every kilo from a mapped farm boundary, through the crop cycle, to the buyer it was sold to.',
    tint: 'var(--green-500)',
  },
  {
    icon: UserGroupIcon,
    title: 'Farmer records',
    copy: 'A single control-numbered profile per farmer — household, documents, verification and history in one place.',
    tint: 'var(--gold-400)',
  },
  {
    icon: Leaf01Icon,
    title: 'Crop cycles',
    copy: 'Plan seasons, log field activity and input costs, and track yield from planting through harvest.',
    tint: 'var(--green-500)',
  },
  {
    icon: Shield01Icon,
    title: 'Insurance',
    copy: 'Enrol farmers with participating providers and track policy coverage against their registered farms.',
    tint: 'var(--gold-400)',
  },
  {
    icon: Wallet01Icon,
    title: 'Credit & loans',
    copy: 'Third-party lender balances, automatic deduction at sale settlement, and an SMS breakdown for every farmer.',
    tint: 'var(--green-500)',
  },
  {
    icon: ShoppingCart02Icon,
    title: 'M-LAX Marketplace',
    copy: 'List, lease and trade land and produce directly between cooperatives, farmers and buyers.',
    tint: 'var(--gold-400)',
  },
];

const STEPS = [
  { title: 'Register & map', copy: 'Onboard farmers and walk each farm boundary by GPS for a verified digital record.' },
  { title: 'Grow & track', copy: 'Log crop cycles, input costs and field activity as the season progresses.' },
  { title: 'Sell & trade', copy: 'Move produce through M-LAX or direct sales, with every transaction on the ledger.' },
  { title: 'Get settled', copy: 'Loan deductions, premiums and payouts are calculated and sent automatically.' },
];

export default function HomePage() {
  return (
    <div className="mkt">
      <nav className="mkt-nav">
        <div className="mkt-shell mkt-nav-inner">
          <a href="/" className="mkt-nav-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" />
            <span>MAYODE GROUP</span>
          </a>
          <div className="mkt-nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#platform">Platform</a>
          </div>
          <a href={LOGIN_URL} className="mkt-nav-cta">
            Sign in
            <HugeiconsIcon icon={ArrowRight02Icon} size={14} strokeWidth={2.5} />
          </a>
        </div>
      </nav>

      <header className="mkt-hero">
        <div className="mkt-shell mkt-hero-grid">
          <div>
            <span className="mkt-eyebrow">
              <span className="mkt-eyebrow-dot" />
              MAYOData Platform · Mbarali, Tanzania
            </span>
            <h1 className="mkt-h1">
              The integrated platform for <em>AMCOS and Cooperatives</em> in Tanzania.
            </h1>
            <p className="mkt-lede">
              Traceability, farmer records, crop cycles, insurance, credit and the M-LAX Marketplace — all in one place.
            </p>
            <div className="mkt-hero-actions">
              <a href={LOGIN_URL} className="mkt-btn-primary">
                Sign in to your workspace
                <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={2.5} />
              </a>
              <a href="#features" className="mkt-btn-ghost">See what&apos;s inside</a>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div className="mkt-hero-ring" aria-hidden="true" />
            <div className="mkt-hero-visual">
              <Image
                src="/login-rice-field.png"
                alt="Rice paddies in Mbarali, Tanzania"
                fill
                priority
                sizes="(max-width: 1080px) 90vw, 45vw"
                style={{ objectFit: 'cover' }}
              />
              <div className="mkt-hero-visual-scrim" />
              <div className="mkt-hero-visual-badge">
                <span className="mkt-hero-visual-badge-ring">M</span>
                <div>
                  <strong>Every farm, mapped</strong>
                  <span>GPS-verified boundaries across Mbarali&apos;s cooperatives</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mkt-stats">
        <div className="mkt-shell mkt-stats-grid">
          <div className="mkt-stat"><strong>31</strong><span>Regions of Tanzania covered</span></div>
          <div className="mkt-stat"><strong>6</strong><span>Integrated modules</span></div>
          <div className="mkt-stat"><strong>8</strong><span>Farmer &amp; staff role types</span></div>
          <div className="mkt-stat"><strong>100%</strong><span>Digital record-keeping</span></div>
        </div>
      </div>

      <section id="features" className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <div>
              <div className="mkt-kicker">What&apos;s inside</div>
              <h2 className="mkt-h2">One workspace for the whole cooperative.</h2>
            </div>
            <p className="mkt-section-sub">
              Built around the real workflow of an AMCOS — from registering a farmer to settling their payment.
            </p>
          </div>
          <div className="mkt-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="mkt-feature">
                <div className="mkt-feature-icon" style={{ background: `color-mix(in srgb, ${f.tint} 16%, transparent)`, color: f.tint }}>
                  <HugeiconsIcon icon={f.icon} size={22} strokeWidth={1.8} />
                </div>
                <h3 className="mkt-feature-title">{f.title}</h3>
                <p className="mkt-feature-copy">{f.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mkt-section-tight">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <div>
              <div className="mkt-kicker">How it works</div>
              <h2 className="mkt-h2">From the field to the final payment.</h2>
            </div>
          </div>
          <div className="mkt-steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className="mkt-step">
                <div className="mkt-step-num">{String(i + 1).padStart(2, '0')}</div>
                <h3 className="mkt-step-title">{s.title}</h3>
                <p className="mkt-step-copy">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-split">
            <div>
              <div className="mkt-kicker">Built for many cooperatives</div>
              <h2 className="mkt-h2">Every AMCOS gets its own workspace.</h2>
              <div className="mkt-check-list">
                <div className="mkt-check-item">
                  <span className="mkt-check-icon"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2.5} /></span>
                  <div>
                    <strong>Data isolation by cooperative</strong>
                    <p>Staff only ever see their own AMCOS&apos;s farmers, farms and finances — never another cooperative&apos;s.</p>
                  </div>
                </div>
                <div className="mkt-check-item">
                  <span className="mkt-check-icon"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2.5} /></span>
                  <div>
                    <strong>Custom roles &amp; permissions</strong>
                    <p>Define exactly what each role can view, create, edit or delete — per resource.</p>
                  </div>
                </div>
                <div className="mkt-check-item">
                  <span className="mkt-check-icon"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2.5} /></span>
                  <div>
                    <strong>Real double-entry accounting</strong>
                    <p>A general ledger, budgets, receivables and payables behind every financial statement.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mkt-split-visual">
              <div className="mkt-tenant-card">
                <div><strong>Madibira AMCOS</strong><span>412 farmers · 6 staff roles</span></div>
                <span className="mkt-tenant-badge">Isolated</span>
              </div>
              <div className="mkt-tenant-card">
                <div><strong>Mbuyuni AMCOS</strong><span>287 farmers · 4 staff roles</span></div>
                <span className="mkt-tenant-badge">Isolated</span>
              </div>
              <div className="mkt-tenant-card">
                <div><strong>Ubaruku AMCOS</strong><span>355 farmers · 5 staff roles</span></div>
                <span className="mkt-tenant-badge">Isolated</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section-tight">
        <div className="mkt-shell">
          <div className="mkt-cta-band">
            <div>
              <h2>Ready to bring your cooperative online?</h2>
              <p>Sign in to your MAYODE GROUP workspace and pick up where you left off.</p>
            </div>
            <div className="mkt-cta-band-actions">
              <a href={LOGIN_URL} className="mkt-btn-light">
                Sign in
                <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={2.5} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="mkt-footer">
        <div className="mkt-shell">
          <div className="mkt-footer-top">
            <div>
              <div className="mkt-footer-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-mark.png" alt="" />
                <span>MAYODE GROUP</span>
              </div>
              <p className="mkt-footer-tagline">
                The integrated platform for AMCOS and Cooperatives in Tanzania.
              </p>
            </div>
            <div className="mkt-footer-links">
              <div className="mkt-footer-col">
                <strong>Platform</strong>
                <a href="#features">Features</a>
                <a href="#how-it-works">How it works</a>
                <a href="#platform">Multi-cooperative</a>
              </div>
              <div className="mkt-footer-col">
                <strong>Workspace</strong>
                <a href={LOGIN_URL}>Sign in</a>
              </div>
            </div>
          </div>
          <div className="mkt-footer-bottom">
            <span>© {new Date().getFullYear()} MAYODE GROUP. All rights reserved.</span>
            <span>Mbarali, Tanzania</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
