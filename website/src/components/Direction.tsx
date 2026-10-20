import { direction, values } from '@/content';

export default function Direction() {
  return (
    <>
      <section className="sec sec--dark" id="direction">
        <div className="wrap">
          <header className="sec-head" data-reveal>
            <div>
              <p className="eyebrow">Strategic direction</p>
              <h2 className="h2">Where we are heading, and what we promise on the way.</h2>
            </div>
          </header>
          <div className="glass">
            {direction.map((d, i) => (
              <article className="glass__card" key={d.label} data-reveal>
                <div className="glass__n">0{i + 1}</div>
                <h3>{d.label}</h3>
                <p>{d.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="values">
        <div className="wrap">
          <header className="sec-head" data-reveal>
            <div>
              <p className="eyebrow">Our core values</p>
              <h2 className="h2">What we hold ourselves to.</h2>
            </div>
          </header>
          <div className="cards cards--3">
            {values.map((v, i) => (
              <article className="card" key={v.title} data-reveal>
                <div className="card__head">
                  <span className="card__ico">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{v.title}</h3>
                </div>
                <p>{v.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
