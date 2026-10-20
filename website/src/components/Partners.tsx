import Image from 'next/image';
import { partners } from '@/content';

export default function Partners() {
  return (
    <section className="partners" id="partners">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow" data-reveal>Some of our partners</p>
          <h2 className="h2" data-reveal>People and institutions we build with.</h2>
        </header>
        <ul className="logos" data-reveal>
          {partners.logos.map(([name, file]) => (
            <li key={file}>
              <Image src={`/images/partners/${file}.png`} alt={name} width={230} height={204} />
            </li>
          ))}
        </ul>
        <div className="partners__text">
          {partners.paragraphs.map((p, i) => (<p key={i} data-reveal>{p}</p>))}
        </div>
        <div className="growth">
          {partners.growth.map(([t, p]) => (
            <article key={t} data-reveal>
              <h3>{t}</h3>
              <p>{p}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
