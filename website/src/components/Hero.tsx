import Image from 'next/image';
import { company, intro, services, sectors, digital, values } from '@/content';
import Stats from './Stats';

export default function Hero() {
  return (
    <>
      <section className="hero" id="top">
        <div className="hero__media">
          <Image src="/images/photos/sunrise-field.jpg" alt="Rice ready for harvest in the early morning light" fill priority sizes="100vw" className="hero__img" />
          <div className="hero__shade" />
        </div>
        <div className="wrap">
          <div className="hero__copy">
            <p className="pill">{company.pillars}</p>
            <h1 className="hero__title" aria-label={company.tagline}>
              Growing Innovation, <em>Sustaining Tomorrow.</em>
            </h1>
            <p className="hero__sub">{intro.lead}</p>
            <div className="hero__cta">
              <a className="btn btn--solid" href="#about">Our story →</a>
              <a className="btn btn--ghost" href="#contact">Contact us</a>
            </div>
          </div>
        </div>
      </section>
      <Stats
        items={[
          { value: services.length, label: 'Core services' },
          { value: digital.items.length, label: 'Digital platforms' },
          { value: values.length, label: 'Core values' },
          { value: sectors.length, label: 'Sectors served' },
        ]}
      />
    </>
  );
}
