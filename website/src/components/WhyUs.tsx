import Image from 'next/image';
import { why } from '@/content';

export default function WhyUs() {
  return (
    <section className="sec" id="why">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <div>
            <p className="eyebrow">Why choose us</p>
            <h2 className="h2">Reliable, innovative and sustainable, in that order of importance to our clients.</h2>
          </div>
        </header>
        <div className="cards cards--3">
          {why.items.map(([t, p], i) => (
            <article className="card" key={t} data-reveal>
              <div className="card__head">
                <span className="card__ico">{String(i + 1).padStart(2, '0')}</span>
                <h3>{t}</h3>
              </div>
              <p>{p}</p>
            </article>
          ))}
        </div>
        <div className="split split--flip" style={{ marginTop: '4rem' }}>
          <p className="statement" style={{ marginTop: 0 }} data-reveal>{why.lead}</p>
          <figure className="split__fig" data-reveal>
            <Image src="/images/photos/hand-and-grain.jpg" alt="A hand holding ripe heads of rice" width={1324} height={900} sizes="(max-width: 960px) 100vw, 36vw" />
          </figure>
        </div>
      </div>
    </section>
  );
}
