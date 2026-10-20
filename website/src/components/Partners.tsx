import Image from 'next/image';
import { partners } from '@/content';

export default function Partners() {
  return (
    <section className="sec" id="partners">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <div>
            <p className="eyebrow">Some of our partners</p>
            <h2 className="h2">People and institutions we build with.</h2>
          </div>
        </header>
        <ul className="logos" data-reveal>
          {partners.logos.map(([name, file]) => (
            <li key={file}>
              <Image src={`/images/partners/${file}.png`} alt={name} width={230} height={204} />
            </li>
          ))}
        </ul>
        <div className="two">
          {partners.paragraphs.map((p, i) => (<p key={i} data-reveal>{p}</p>))}
        </div>
        <div className="cards cards--3">
          {partners.growth.map(([t, p], i) => (
            <article className="card" key={t} data-reveal>
              <div className="card__head">
                <span className="card__ico">0{i + 1}</span>
                <h3>{t}</h3>
              </div>
              <p>{p}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
