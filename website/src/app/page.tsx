import Nav from '@/components/Nav';
import Hero from '@/components/Hero';
import About from '@/components/About';
import Services from '@/components/Services';
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
import Reveal from '@/components/Reveal';

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <About />
        <Services />
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
      <Reveal />
    </>
  );
}
