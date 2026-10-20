import { sectors } from '@/content';

export default function Markets() {
  return (
    <section className="sec" id="markets">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <div>
            <p className="eyebrow">Our target sectors</p>
            <h2 className="h2">Who we work with.</h2>
          </div>
          <a className="link" href="#contact">Become a partner →</a>
        </header>
        <div className="cards cards--3">
          {sectors.map((s, i) => (
            <article className="card" key={s.title} data-reveal>
              <div className="card__head">
                <span className="card__ico">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
              </div>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
