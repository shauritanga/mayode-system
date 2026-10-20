import Image from 'next/image';
import { services } from '@/content';

export default function Services() {
  return (
    <section className="services" id="services">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow eyebrow--gold" data-reveal>Our services</p>
          <h2 className="h2" data-reveal>Six ways we work, from the paddy field to the buyer.</h2>
        </header>
        <ol className="svc-list">
          {services.map((s) => (
            <li className="svc" key={s.n} data-svc>
              <span className="svc__rule" data-svc-rule />
              <span className="svc__n">{s.n}</span>
              <div className="svc__body">
                <h3 className="svc__title">{s.title}</h3>
                <p className="svc__text">{s.text}</p>
              </div>
              <div className="svc__pics" aria-hidden="true">
                {s.images.map((img) => (
                  <span className="svc__pic" key={img} data-svc-pic>
                    <Image src={`/images/services/${img}.jpg`} alt="" width={330} height={235} sizes="200px" />
                  </span>
                ))}
                {s.photo && (
                  <span className="svc__pic svc__pic--wide" data-svc-pic>
                    <Image src={`/images/photos/${s.photo}.jpg`} alt="" width={420} height={280} sizes="240px" />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
