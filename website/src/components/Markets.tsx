import { sectors } from '@/content';

/** Seven kinds of customer and partner, read left to right as the page is scrolled. */
export default function Markets() {
  return (
    <section className="markets" id="markets" data-markets>
      <div className="markets__pin" data-markets-pin>
        <header className="markets__head">
          <p className="eyebrow" >Our target sectors</p>
          <h2 className="h2">Who we work with.</h2>
          <div className="markets__bar" aria-hidden="true"><i data-markets-bar /></div>
        </header>
        <div className="markets__track" data-markets-track>
          {sectors.map((s, i) => (
            <article className="sector" key={s.title}>
              <span className="sector__n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
