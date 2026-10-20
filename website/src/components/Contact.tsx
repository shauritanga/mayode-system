import { company } from '@/content';

export default function Contact() {
  return (
    <section className="contact" id="contact">
      <div className="wrap contact__grid">
        <div>
          <p className="eyebrow eyebrow--gold" data-reveal>Connect with us</p>
          <h2 className="contact__title" data-words-dark>Let us grow something together.</h2>
          <p className="contact__lead" data-reveal>
            Whether you require premium rice, reliable agricultural supplies, innovative farming technologies, or climate-smart agricultural services, we are committed to delivering quality, innovation, productivity, sustainability, and value every step of the way.
          </p>
          <div className="contact__cta" data-reveal>
            <a className="btn btn--gold" href={`mailto:${company.email}`}>Email us</a>
            <a className="btn btn--line" href={company.phoneHref}>Call {company.phone}</a>
          </div>
        </div>
        <dl className="contact__card" data-reveal>
          <div>
            <dt>Telephone</dt>
            <dd><a href={company.phoneHref}>{company.phone}</a></dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd><a href={`mailto:${company.email}`}>{company.email}</a></dd>
          </div>
          <div>
            <dt>Head Office</dt>
            <dd>
              {company.address.map((l) => (<span key={l}>{l}</span>))}
              <a className="contact__map" href={company.mapsHref} target="_blank" rel="noreferrer">Open in maps</a>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
