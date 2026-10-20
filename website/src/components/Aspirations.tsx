import Image from 'next/image';
import { aspirations } from '@/content';

export default function Aspirations() {
  return (
    <section className="sec media-band" id="aspirations">
      <Image src="/images/photos/harvester.jpg" alt="A combine harvester working a field of ripe grain" fill sizes="100vw" className="media-band__img" />
      <div className="media-band__shade" />
      <div className="wrap">
        <div data-reveal>
          <p className="eyebrow">{aspirations.title}</p>
          <p className="lead-big">{aspirations.lead}</p>
        </div>
        <div className="cols">
          {aspirations.paragraphs.map((p, i) => (<p key={i} data-reveal>{p}</p>))}
        </div>
      </div>
    </section>
  );
}
