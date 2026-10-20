import Image from 'next/image';
import { digital } from '@/content';

export default function Digital() {
  return (
    <section className="digital" id="digital">
      <div className="digital__media" data-band-media>
        <Image src="/images/photos/tablet-in-rice.jpg" alt="A farmer checking a rice crop with a tablet" fill sizes="100vw" className="digital__img" />
        <div className="digital__shade" />
      </div>
      <div className="wrap digital__inner">
        <p className="eyebrow eyebrow--gold" data-reveal>Digital Kilimo</p>
        <h2 className="h2 h2--light digital__title" data-words-dark>Technology-enabled agriculture, built around the farm.</h2>
        <p className="digital__lead" data-reveal>{digital.intro}</p>
        <div className="digital__items">
          {digital.items.map((d) => (
            <article key={d.name} data-reveal>
              <h3>{d.name}</h3>
              <p>{d.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
