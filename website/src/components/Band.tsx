import Image from 'next/image';
import { company } from '@/content';

/** A full-width photograph with the company motto laid over it. */
export default function Band() {
  return (
    <section className="band" aria-label={company.motto}>
      <div className="band__media" data-band-media>
        <Image src="/images/photos/terraces.jpg" alt="Rice terraces stepping down a hillside under a bright sky" fill sizes="100vw" className="band__img" />
        <div className="band__shade" />
      </div>
      <p className="band__quote" data-words-dark>{company.motto}</p>
    </section>
  );
}
