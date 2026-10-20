import Image from 'next/image';
import { climate } from '@/content';

export default function Climate() {
  return (
    <section className="climate" id="sustainability" data-climate>
      <div className="wrap climate__grid">
        <div className="climate__intro">
          <p className="eyebrow eyebrow--gold" data-reveal>Climate-smart agriculture and carbon credit development</p>
          <h2 className="h2 h2--light" data-reveal>Less water, less methane, and records that can be checked.</h2>
          <p className="climate__lead" data-reveal>{climate.lead}</p>
          <p className="climate__awd" data-reveal>{climate.awd}</p>
        </div>
        <figure className="climate__photo" data-clip>
          <Image src="/images/photos/terraces-tall.jpg" alt="Terraced rice fields in soft morning light" width={1001} height={1500} sizes="(max-width: 900px) 100vw, 34vw" data-parallax />
        </figure>
      </div>

      <div className="wrap mrv" data-mrv>
        <p className="eyebrow eyebrow--gold mrv__label" data-reveal>Measurement, reporting and verification</p>
        <ol className="mrv__steps">
          {climate.steps.map(([name, text], i) => (
            <li key={name} data-mrv-step>
              <span className="mrv__n">0{i + 1}</span>
              <h3>{name}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="wrap climate__inst" data-reveal>
        <h3>{climate.institutions.title}</h3>
        <p>{climate.institutions.text}</p>
      </div>
    </section>
  );
}
