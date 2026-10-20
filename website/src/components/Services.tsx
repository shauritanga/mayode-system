import Image from 'next/image';
import { services } from '@/content';

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
            return (
              <article className="card" key={s.n} data-reveal>
                {pic && (
                  <div className="card__photo">
                    <Image src={pic} alt="" width={560} height={315} sizes="(max-width: 640px) 100vw, 40vw" />
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
