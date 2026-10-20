import Image from 'next/image';
import { compliance } from '@/content';

export default function Compliance() {
  return (
    <section className="sec sec--grid" id="compliance">
      <div className="wrap">
        <header className="sec-head" data-reveal>
          <div>
            <p className="eyebrow">Our compliances and legal standing</p>
            <h2 className="h2">Doing business in the open.</h2>
          </div>
        </header>
        <div className="split split--flip">
          <div className="copy" data-reveal>
            {compliance.paragraphs.map((p, i) => (<p key={i}>{p}</p>))}
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
        <div className="cards" style={{ marginTop: '3rem' }}>
          {compliance.policies.map((p) => (
            <article className="card" key={p.title} data-reveal>
              <h3 style={{ marginBottom: 10 }}>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
