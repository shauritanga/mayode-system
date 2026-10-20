import { company } from '@/content';

export default function Contact() {
  return (
    <section className="sec sec--dark" id="contact">
      <div className="wrap cta">
        <div data-reveal>
          <p className="eyebrow">Connect with us</p>
          <h2 className="cta__title">Let us grow something together.</h2>
          <p className="lede">
            Whether you require premium rice, reliable agricultural supplies, innovative farming technologies, or climate-smart agricultural services, we are committed to delivering quality, innovation, productivity, sustainability, and value every step of the way.
          </p>
          <div className="cta__btns">
            <a className="btn btn--white" href={`mailto:${company.email}`}>Email us →</a>
            <a className="btn btn--ghost" href={company.phoneHref}>Call {company.phone}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
