import Image from 'next/image';
import { digital } from '@/content';

export default function Digital() {
  return (
    <section className="sec media-band" id="digital">
      <Image src="/images/photos/tablet-in-rice.jpg" alt="A farmer checking a rice crop with a tablet" fill sizes="100vw" className="media-band__img" />
      <div className="media-band__shade" />
      <div className="wrap">
        <div data-reveal>
          <p className="eyebrow">Digital Kilimo</p>
          <h2 className="h2">Technology-enabled agriculture, built around the farm.</h2>
          <p className="lede" style={{ color: 'rgba(255,255,255,0.8)' }}>{digital.intro}</p>
        </div>
        <div className="tiles">
          {digital.items.map((d) => (
            <article className="tile" key={d.name} data-reveal>
              <h3>{d.name}</h3>
              <p>{d.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
