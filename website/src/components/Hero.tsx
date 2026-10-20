import Image from 'next/image';
import { company } from '@/content';

export default function Hero() {
  return (
    <section className="hero" id="top" data-hero>
      <div className="hero__media" data-hero-media>
        <Image src="/images/photos/sunrise-field.jpg" alt="Rice ready for harvest in the early morning light" fill priority sizes="100vw" className="hero__img" />
        <div className="hero__shade" />
      </div>
      <div className="hero__copy" data-hero-copy>
        <p className="eyebrow hero__eyebrow" data-hero-in>
          {company.pillars}
        </p>
        <h1 className="hero__title" aria-label={company.tagline}>
          <span className="line"><span data-hero-line>Growing Innovation,</span></span>
          <span className="line"><span data-hero-line>Sustaining <em>Tomorrow.</em></span></span>
        </h1>
        <div className="hero__foot" data-hero-in>
          <p className="hero__focus">{company.focus.join('  |  ')}</p>
          <div className="hero__cta">
            <a className="btn btn--gold" href="#about">Our story</a>
            <a className="btn btn--line" href="#contact">Contact us</a>
          </div>
        </div>
      </div>
      <div className="hero__scroll" aria-hidden="true" data-hero-in>
        <span>Scroll</span>
        <i />
      </div>
    </section>
  );
}
