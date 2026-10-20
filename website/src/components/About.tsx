import Image from 'next/image';
import { intro, overview } from '@/content';

export default function About() {
  const [first, ...rest] = overview.paragraphs;
  return (
    <section className="sec" id="about">
      <div className="wrap split">
        <figure className="split__fig" data-reveal>
          <Image src="/images/photos/field-path.jpg" alt="A path running between tall rice at sunset" width={1324} height={1871} sizes="(max-width: 960px) 100vw, 40vw" />
          <figcaption className="badge">
            <strong>SARO 5 &amp; Supa</strong>
            <span>Rice varieties</span>
          </figcaption>
        </figure>
        <div className="copy" data-reveal>
          <p className="eyebrow">Company overview</p>
          <h2 className="h2">{intro.lead}</h2>
          <p>{intro.body}</p>
          <p>{first}</p>
          <div className="feats">
            {overview.facts.map(([k, v], i) => (
              <div className="feat" key={k}>
                <span className="feat__ico">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{k}</h3>
                  <p>{v}</p>
                </div>
              </div>
            ))}
          </div>
          <details className="more">
            <summary className="btn btn--line">Read more about us →</summary>
            {rest.map((p, i) => (<p key={i}>{p}</p>))}
          </details>
        </div>
      </div>
    </section>
  );
}
