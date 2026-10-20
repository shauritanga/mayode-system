import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import Marquee from '@/components/Marquee';
import About from '@/components/About';
import Services from '@/components/Services';
import Band from '@/components/Band';
import Leadership from '@/components/Leadership';
import Direction from '@/components/Direction';
import Markets from '@/components/Markets';
import Digital from '@/components/Digital';
import Climate from '@/components/Climate';
import WhyUs from '@/components/WhyUs';
import Aspirations from '@/components/Aspirations';
import Compliance from '@/components/Compliance';
import Partners from '@/components/Partners';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';
import Stem from '@/components/Stem';
import Motion from '@/components/Motion';

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <About />
        <Services />
        <Band />
        <Leadership />
        <Direction />
        <Markets />
        <Digital />
        <Climate />
        <WhyUs />
        <Aspirations />
        <Compliance />
        <Partners />
        <Contact />
      </main>
      <Footer />
      <Stem />
      <Motion />
    </>
  );
}
