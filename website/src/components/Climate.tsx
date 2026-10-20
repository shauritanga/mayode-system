import Image from 'next/image';
import { climate } from '@/content';

export default function Climate() {
  return (
    <section className="sec sec--grid" id="sustainability">
      <div className="wrap">
        <div className="split split--flip">
          <div className="copy" data-reveal>
            <p className="eyebrow">Climate-smart agriculture and carbon credit development</p>
            <h2 className="h2">Less water, less methane, and records that can be checked.</h2>
            <p>{climate.lead}</p>
            <p>{climate.awd}</p>
          </div>
          <figure className="split__fig" data-reveal>
            <Image src="/images/photos/terraces-tall.jpg" alt="Terraced rice fields in soft morning light" width={1001} height={1500} sizes="(max-width: 960px) 100vw, 36vw" />
          </figure>
        </div>
        <p className="eyebrow" style={{ marginTop: '4rem' }} data-reveal>Measurement, reporting and verification</p>
        <div className="cards cards--3">
          {climate.steps.map(([name, text], i) => (
            <article className="card" key={name} data-reveal>
              <div className="card__head">
                <span className="card__ico">0{i + 1}</span>
                <h3>{name}</h3>
              </div>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div className="callout" data-reveal>
          <h3>{climate.institutions.title}</h3>
          <p>{climate.institutions.text}</p>
        </div>
      </div>
    </section>
  );
}
