'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight02Icon, Cancel01Icon, FileSpreadsheetIcon, Leaf01Icon, Location01Icon, Menu01Icon, Shield01Icon, SmartPhone01Icon, TractorIcon, UserGroupIcon, Wallet01Icon, WifiDisconnected01Icon } from '@hugeicons/core-free-icons';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mayodegroup.com';
const LOGIN_URL = `${ADMIN_URL}/login`;
const CONTACT_URL = 'mailto:support@mayodegroup.com?subject=MAYOData%20cooperative%20enquiry';
const pathways: [string, string, string, typeof Location01Icon][] = [
  ['', 'Start with the farm that already exists', 'AMCOS officers can pre-register plots and owners. Farmers review, confirm, and add only what is missing.', Location01Icon],
  ['', 'Keep the season moving', 'Record activities, crop cycles, field visits, and the work that needs attention — even when a connection drops.', Leaf01Icon],
  ['', 'Turn records into fairer decisions', 'Verified information supports cooperative services, seasonal membership, reports, and accountable follow-through.', Wallet01Icon],
];
const capabilities: [string, string, typeof Location01Icon][] = [
  ['The farmer record, without the forms', 'A mobile-first path from pre-registered farm to confirmed profile, built around the reality of owners, renters, and assisted registration.', SmartPhone01Icon],
  ['A cooperative view that stays grounded', 'Bring together farmers, farms, crop cycles, surveys, memberships, and reports without losing the local AMCOS context.', UserGroupIcon],
  ['Fieldwork that does not wait for signal', 'Supported mobile workflows can be saved offline and synchronized when field teams reconnect.', WifiDisconnected01Icon],
  ['Traceable support, not hidden assumptions', 'Keep confirmations, field verification, disputes, and role-specific actions explicit at every stage.', Shield01Icon],
];
const questions: [string, string][] = [
  ['Who is MAYOData for?', 'MAYOData is designed first for farmers in Tanzanian rice-farming cooperatives, with connected workflows for farm owners, renters, AMCOS officers, MAYODE field teams, and authorized partners.'],
  ['Can an AMCOS import existing farm records?', 'The platform supports AMCOS-first registration: cooperative records can be used to pre-register farms and owners so farmers can review and confirm rather than begin from a blank form.'],
  ['What happens when a field team has no connection?', 'Supported mobile field workflows are designed to retain work offline and synchronize when a connection becomes available.'],
  ['Which work stays free?', 'Basic farmer, farm, plot, profile, activity, crop-cycle, expense, labor, input, and document workflows remain accessible. Advanced services can be made available through active seasonal membership.'],
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<number | null>(0);
  const motionRoot = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      gsap.from('.hero-copy > *', { y: 28, opacity: 0, duration: 1, stagger: 0.08, ease: 'power3.out' });
      gsap.from('.hero-image img', { scale: 1.08, opacity: 0.8, duration: 1.6, ease: 'power2.out' });
      gsap.utils.toArray<HTMLElement>('.motion-card').forEach((card) => {
        gsap.fromTo(card, { y: 55, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: card, start: 'top 82%', once: true } });
      });
      gsap.utils.toArray<HTMLElement>('.motion-image').forEach((image) => {
        gsap.fromTo(image, { scale: 0.86, opacity: 0.5 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: image, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
      gsap.to('.products-heading', { y: 60, scrollTrigger: { trigger: '.products', start: 'top 18%', end: 'bottom 70%', scrub: true } });
    }, motionRoot);
    return () => context.revert();
  }, []);
  return <main className="site" ref={motionRoot}>
    <nav className="nav" aria-label="Main navigation">
      <a className="brand" href="#top" aria-label="MAYODE GROUP home"><span className="brand-mark" style={{ width: 50, height: 50, padding: 0, background: 'transparent', borderRadius: 0 }}><Image src="/logo-mark.png" alt="MAYODE logo" width={50} height={50} priority /></span><span><strong>MAYODE</strong><small>GROUP · MAYODATA</small></span></a>
      <div className="nav-links"><a href="#about">About MAYODE</a><a href="#products">Products</a><a href="#platform">Platform</a><a href="#cooperatives">For cooperatives</a></div>
      <div className="nav-actions"><a className="text-link" href={LOGIN_URL}>Sign in</a><a className="button button-dark" href={CONTACT_URL}>Talk to MAYODE <HugeiconsIcon icon={ArrowRight02Icon} size={16} /></a><button className="menu" type="button" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><HugeiconsIcon icon={menuOpen ? Cancel01Icon : Menu01Icon} size={23} /></button></div>
      {menuOpen && <div className="mobile-links"><a href="#about" onClick={() => setMenuOpen(false)}>About MAYODE</a><a href="#products" onClick={() => setMenuOpen(false)}>Products</a><a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a><a href="#cooperatives" onClick={() => setMenuOpen(false)}>For cooperatives</a><a href={LOGIN_URL}>Sign in</a></div>}
    </nav>
    <header className="hero" id="top">
      <div className="hero-image">
        <Image src="/login-rice-field.png" fill priority sizes="100vw" alt="Rice fields in Tanzania" />
      </div>
      <div className="hero-copy">
        <h1>Integrated operations for Tanzanian <em>cooperatives.</em></h1>
        <p className="hero-intro">MAYOData connects farmer records, farm registration, crop cycles, field activity, verification, and seasonal support for AMCOS and the communities they serve.</p>
        <div className="hero-actions">
          <a className="button button-sun" href="#platform">Explore MAYOData <HugeiconsIcon icon={ArrowRight02Icon} size={17} /></a>
          <a className="play-link" href="#cooperatives"><span>↓</span> For AMCOS teams</a>
        </div>
        <div className="hero-note">
          <p>Basic farmer and farm registration stays free. Advanced analytics and recommendations are available through active membership.</p>
        </div>
      </div>
      <div className="hero-rule"><span>FARM REGISTRY · FIELD OPERATIONS · COOPERATIVE WORKSPACE</span></div>
    </header>
    <section className="company-intro" id="about"><div><p className="section-label">About MAYODE GROUP</p><h2>Practical systems for the people who grow, move, and steward food.</h2></div><div><p>MAYODE GROUP builds connected tools for Tanzanian farming communities and the cooperatives that support them. Our work brings trusted records, field operations, and market services closer to the people who use them.</p><a className="text-link" href={CONTACT_URL}>Talk with our team <HugeiconsIcon icon={ArrowRight02Icon} size={15} /></a></div></section>
    <section className="products" id="products"><div className="products-heading"><p className="section-label">The MAYODE product family</p><h2>One company.<br /><i>Connected tools.</i></h2></div><div className="product-list"><article className="motion-card"><HugeiconsIcon icon={Leaf01Icon} size={25} /><h3>MAYOData</h3><p>The integrated platform for AMCOS and cooperatives: farmer records, farm registration, field activity, crop cycles, verification, and seasonal support.</p><a href="#platform">Explore MAYOData <HugeiconsIcon icon={ArrowRight02Icon} size={15} /></a></article><article className="motion-card"><HugeiconsIcon icon={TractorIcon} size={25} /><h3>M-LAX Marketplace</h3><p>A farmer-first marketplace connecting land, tractor services, seasonal activity, and practical support around the farm.</p><a href={LOGIN_URL}>Open the workspace <HugeiconsIcon icon={ArrowRight02Icon} size={15} /></a></article></div></section>
    <section className="statement" id="how" style={{ display: 'block' }}><div className="section-heading"><h2>Start with the record<br />your AMCOS already <i>holds.</i></h2><p>Farmers should not have to recreate a farm record that a responsible AMCOS officer already holds. MAYOData lets the right person review, confirm, correct, and complete it.</p></div></section>
    <section className="journey">{pathways.map(([, title, body, Icon]) => <article className="journey-step" key={title as string}><div className="step-top"><HugeiconsIcon icon={Icon as typeof Location01Icon} size={24} /></div><h3>{title}</h3><p>{body}</p><div className="step-line" /></article>)}</section>
    <section className="platform" id="platform"><div className="platform-intro" style={{ display: 'block', maxWidth: 820, margin: '0 auto 62px' }}><p className="section-label">MAYOData platform</p><h2>Everything your season needs.</h2><p>Farm records, field activity, and cooperative support — connected in one place.</p></div><div className="platform-list"><div><HugeiconsIcon icon={Location01Icon} size={22} /><h3>Farm registry</h3><p>Pre-register farms through the responsible AMCOS. Owners and renters review what is there and complete what is missing.</p></div><div><HugeiconsIcon icon={Leaf01Icon} size={22} /><h3>Field activity</h3><p>Keep crop cycles, observations, inputs, labor, and documents together throughout the season.</p></div><div><HugeiconsIcon icon={Shield01Icon} size={22} /><h3>Verification</h3><p>Make confirmations, disputes, reports, and follow-up visible to the people responsible for them.</p></div></div></section>
    <section className="capabilities">{capabilities.map(([title, body, Icon], index) => <article className={index === 0 ? 'capability featured' : 'capability'} key={title as string}><HugeiconsIcon icon={Icon as typeof Location01Icon} size={26} /><h3>{title}</h3><p>{body}</p></article>)}</section>
    <section className="carbon-note" id="carbon"><div><p className="section-label">Carbon credits</p><h2>Not a MAYODE product today.</h2></div><div><p>We do not currently issue or sell carbon credits. MAYOData records farm boundaries, soil observations, and field activity for its core agricultural workflows. Any future carbon programme would require separate verification and an eligible programme partner.</p><a className="text-link" href={CONTACT_URL}>Ask about future partnerships <HugeiconsIcon icon={ArrowRight02Icon} size={15} /></a></div></section>
    <section className="cooperative" id="cooperatives"><div className="cooperative-photo motion-image"><Image src="/login-rice-field.png" fill sizes="(max-width: 900px) 100vw, 50vw" alt="A rice field at the start of a growing season" /></div><div className="cooperative-copy"><p className="section-label">For AMCOS and cooperatives</p><h2>Make the local record work harder for every farmer.</h2><p>Manage farm registry, member information, field activity, and season-level work with one shared source of truth — while keeping each role focused on its own responsibility.</p><ul><li><HugeiconsIcon icon={FileSpreadsheetIcon} size={18} /> Bring existing registry information forward</li><li><HugeiconsIcon icon={TractorIcon} size={18} /> Connect seasonal activity to cooperative support</li><li><HugeiconsIcon icon={SmartPhone01Icon} size={18} /> Keep confirmations and follow-up within reach</li></ul><a className="button button-cream" href={LOGIN_URL}>Enter cooperative workspace <HugeiconsIcon icon={ArrowRight02Icon} size={16} /></a></div></section>
    <section className="questions"><div className="questions-title"><p className="section-label">The useful questions</p><h2>Start with what the field needs.</h2><p>Clear records create better conversations between farmers, cooperatives, and field teams.</p></div><div className="faq-list">{questions.map(([question, answer], index) => <div className="faq" key={question as string}><button type="button" aria-expanded={openQuestion === index} onClick={() => setOpenQuestion(openQuestion === index ? null : index)}><span>{question}</span><b>{openQuestion === index ? '−' : '+'}</b></button>{openQuestion === index && <p>{answer}</p>}</div>)}</div></section>
    <section className="closing"><p>Build the next season on a record everyone can trust.</p><h2>One farm at a time.<br /><em>All moving forward.</em></h2><div><a className="button button-sun" href={LOGIN_URL}>Sign in to MAYOData <HugeiconsIcon icon={ArrowRight02Icon} size={17} /></a><a href="#top">Back to top ↑</a></div></section>
    <footer><a className="brand" href="#top"><span className="brand-mark" style={{ width: 43, height: 43, padding: 0, background: 'transparent', borderRadius: 0 }}><Image src="/logo-mark.png" alt="MAYODE logo" width={43} height={43} /></span><span><strong>MAYODE</strong><small>GROUP · MAYODATA</small></span></a><p>Integrated platform for AMCOS and cooperatives in Tanzania.</p><span>© {new Date().getFullYear()} MAYODE GROUP</span></footer>
  </main>;
}
