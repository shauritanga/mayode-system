import Image from 'next/image';
import { services } from '@/content';

/** Illustrations that keep their own proportions instead of the standard 16:9 crop. */
const ARTWORK: Record<string, { w: number; h: number; cls: string }> = {
  'dashboard-laptop': { w: 1600, h: 1000, cls: 'card__photo--shot' },
  'carbon-mrv-art': { w: 1600, h: 747, cls: 'card__photo--wide' },
};

export default function Services() {
  return (
    <section className="sec sec--grid" id="services">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <div>
            <p className="eyebrow">What we do</p>
            <h2 className="h2">Six ways we work, from the paddy field to the buyer.</h2>
          </div>
          <div className="sec-head__actions">
            <a className="btn btn--solid" href="#contact">Work with us →</a>
            <a className="btn btn--line" href="#digital">Digital Kilimo</a>
          </div>
        </header>
        <div className="cards">
          {services.map((s) => {
            const pic = s.photo ? `/images/photos/${s.photo}.jpg` : s.images[0] ? `/images/services/${s.images[0]}.jpg` : null;
            const art = ARTWORK[s.images[0]];
            return (
              <article className="card" key={s.n} data-reveal>
                {pic && (
                  <div className={`card__photo${art ? ` ${art.cls}` : ''}`}>
                    <Image src={pic} alt={s.images[0] === 'dashboard-laptop' ? 'The MAYODE dashboard on a laptop, showing farmers, production, yield, tasks and harvest summary' : s.images[0] === 'carbon-mrv-art' ? 'Drone, soil sensor and satellite measuring forest carbon, with a verified credit and carbon stock chart' : ''} width={art ? art.w : 560} height={art ? art.h : 315} sizes="(max-width: 640px) 100vw, 40vw" />
                  </div>
                )}
                <div className="card__head">
                  <span className="card__ico">{s.n}</span>
                  <div>
                    <span className="card__tag">Service {s.n}</span>
                    <h3>{s.title}</h3>
                  </div>
                </div>
                <p>{s.text}</p>
                <a className="link" href="#contact">Talk to us about this →</a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
