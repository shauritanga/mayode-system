import Image from 'next/image';
import { intro, overview } from '@/content';

export default function About() {
  return (
    <section className="about" id="about">
      <div className="wrap">
        <p className="eyebrow" data-reveal>Company overview</p>
        <p className="statement" data-words>{intro.lead}</p>
        <p className="statement statement--small" data-words>{intro.body}</p>
      </div>

      <div className="wrap about__grid">
        <figure className="about__figure" data-clip>
          <Image src="/images/photos/field-path.jpg" alt="A path running between tall rice at sunset" width={1324} height={1871} sizes="(max-width: 900px) 100vw, 40vw" data-parallax />
        </figure>
        <div className="about__text">
          {overview.paragraphs.map((p, i) => (
            <p key={i} data-reveal>{p}</p>
          ))}
          <dl className="facts" data-reveal>
            {overview.facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
