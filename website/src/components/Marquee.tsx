import { company } from '@/content';

/** The four things the company does, set large and drifting with the scroll. */
export default function Marquee() {
  const row = [...company.focus, ...company.focus];
  return (
    <section className="marquee" aria-label={company.focus.join(', ')} data-marquee>
      <div className="marquee__track" data-marquee-track aria-hidden="true">
        {[0, 1].map((k) => (
          <div className="marquee__row" key={k}>
            {row.map((w, i) => (
              <span key={`${k}-${i}`}>{w}<b>·</b></span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
