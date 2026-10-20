import Image from 'next/image';
import { ceo } from '@/content';

export default function Leadership() {
  return (
    <section className="ceo" id="leadership">
      <div className="wrap ceo__grid">
        <div className="ceo__side">
          <p className="eyebrow" data-reveal>From the C.E.O</p>
          <figure className="ceo__portrait" data-reveal>
            <Image src="/images/photos/ceo.jpg" alt={`${ceo.name}, ${ceo.role}`} width={174} height={188} />
            <figcaption>
              <strong>{ceo.name}</strong>
              <span>{ceo.role}</span>
              <span>MAYODE GROUP LIMITED</span>
            </figcaption>
          </figure>
        </div>
        <div className="ceo__letter">
          <blockquote className="ceo__quote" data-words>{ceo.quote}</blockquote>
          <details className="letter" data-reveal>
            <summary><span>Read the full letter</span><i aria-hidden="true" /></summary>
            <div className="letter__body">
              <p className="letter__hi">{ceo.salutation}</p>
              {ceo.paragraphs.map((p, i) => (<p key={i}>{p}</p>))}
              <p className="letter__sign"><strong>{ceo.name}</strong><br />{ceo.role}<br />MAYODE GROUP LIMITED</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
