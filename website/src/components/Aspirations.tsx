import Image from 'next/image';
import { aspirations } from '@/content';

export default function Aspirations() {
  return (
    <section className="aspire">
      <div className="aspire__media" data-band-media>
        <Image src="/images/photos/harvester.jpg" alt="A combine harvester working a field of ripe grain" fill sizes="100vw" className="aspire__img" />
        <div className="aspire__shade" />
      </div>
      <div className="wrap aspire__inner">
        <p className="eyebrow eyebrow--gold" data-reveal>{aspirations.title}</p>
        <p className="aspire__lead" data-words-dark>{aspirations.lead}</p>
        <div className="aspire__cols">
          {aspirations.paragraphs.map((p, i) => (<p key={i} data-reveal>{p}</p>))}
        </div>
      </div>
    </section>
  );
}
