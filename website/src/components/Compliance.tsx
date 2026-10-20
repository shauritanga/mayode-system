import Image from 'next/image';
import { compliance } from '@/content';

export default function Compliance() {
  return (
    <section className="compliance" id="compliance">
      <div className="wrap">
        <header className="sec-head">
          <p className="eyebrow" data-reveal>Our compliances and legal standing</p>
          <h2 className="h2" data-reveal>Doing business in the open.</h2>
        </header>
        <div className="compliance__grid">
          <div className="compliance__text">
            {compliance.paragraphs.map((p, i) => (<p key={i} data-reveal>{p}</p>))}
          </div>
          <div className="docs" data-reveal>
            {compliance.documents.map(([label, file]) => (
              <figure key={file}>
                <Image src={`/images/documents/${file}.jpg`} alt={label} width={file === 'registration' ? 363 : 221} height={file === 'registration' ? 237 : 297} />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
        <div className="policies">
          {compliance.policies.map((p) => (
            <article key={p.title} data-reveal>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
