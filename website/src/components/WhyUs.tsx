import Image from 'next/image';
import { why } from '@/content';

export default function WhyUs() {
  return (
    <section className="why" id="why">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow" data-reveal>Why choose us</p>
          <h2 className="h2" data-reveal>Reliable, innovative and sustainable, in that order of importance to our clients.</h2>
        </header>
        <div className="why__grid">
          <ul className="why__list">
            {why.items.map(([t, p], i) => (
              <li key={t} data-reveal>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </div>
              </li>
            ))}
          </ul>
          <figure className="why__photo" data-clip>
            <Image src="/images/photos/hand-and-grain.jpg" alt="A hand holding ripe heads of rice" width={1324} height={900} sizes="(max-width: 900px) 100vw, 36vw" data-parallax />
          </figure>
        </div>
        <p className="why__lead" data-words>{why.lead}</p>
      </div>
    </section>
  );
}
