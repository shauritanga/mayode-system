import Image from 'next/image';
import { ceo } from '@/content';

export default function Leadership() {
  return (
    <section className="sec sec--grid" id="leadership">
      <div className="wrap ceo">
        <figure className="ceo__card" data-reveal>
          <Image src="/images/photos/ceo.jpg" alt={`${ceo.name}, ${ceo.role}`} width={174} height={188} />
          <figcaption>
            <strong>{ceo.name}</strong>
            <span>{ceo.role}</span>
            <span>MAYODE GROUP LIMITED</span>
          </figcaption>
        </figure>
        <div data-reveal>
          <p className="eyebrow">From the C.E.O</p>
          <blockquote className="quote">{ceo.quote}</blockquote>
          <details className="letter">
            <summary className="btn btn--line">Read the full letter →</summary>
            <div className="letter__body">
              <p>{ceo.salutation}</p>
              {ceo.paragraphs.map((p, i) => (<p key={i}>{p}</p>))}
              <p className="letter__sign"><strong>{ceo.name}</strong><br />{ceo.role}<br />MAYODE GROUP LIMITED</p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
