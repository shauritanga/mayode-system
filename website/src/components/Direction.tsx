import Image from 'next/image';
import { direction, values } from '@/content';

export default function Direction() {
  return (
    <section className="direction" id="direction">
      <div className="wrap direction__grid">
        <div className="direction__sticky">
          <p className="eyebrow eyebrow--gold" data-reveal>Strategic direction</p>
          <h2 className="h2 h2--light" data-reveal>Where we are heading, and what we promise on the way.</h2>
          <figure className="direction__photo" data-clip>
            <Image src="/images/photos/rice-bowl.jpg" alt="Polished white rice heaped in a bowl" width={1327} height={1871} sizes="(max-width: 900px) 100vw, 36vw" data-parallax />
          </figure>
        </div>
        <ol className="direction__list">
          {direction.map((d, i) => (
            <li key={d.label} data-reveal>
              <span className="direction__n">0{i + 1}</span>
              <h3>{d.label}</h3>
              <p>{d.text}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="wrap values" id="values">
        <header className="values__head">
          <p className="eyebrow eyebrow--gold" data-reveal>Our core values</p>
          <h2 className="h2 h2--light" data-reveal>What we hold ourselves to.</h2>
        </header>
        <div className="values__grid">
          {values.map((v, i) => (
            <article className="value" key={v.title} data-reveal>
              <span className="value__n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{v.title}</h3>
              <p>{v.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
