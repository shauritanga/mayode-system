import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const TITLE = 'MAYODE GROUP LIMITED | Commercial rice, Digital Kilimo and climate-smart farming';
const DESCRIPTION =
  'MAYODE GROUP LIMITED is an agriculture and technology-driven company in Madibira, Mbarali, Mbeya, specializing in commercial rice farming, rice processing, digital agriculture and sustainable agricultural solutions across Tanzania and East Africa.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3005'),
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'MAYODE GROUP, commercial rice farming, Tanzania rice, Mbarali, Madibira, Digital Kilimo, MAYOData, MAYODE App, Agribongo, climate-smart agriculture, carbon credits, rice processing',
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'MAYODE GROUP LIMITED', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: '#0e2a1a' };

/**
 * Content is visible without script. Before first paint, when motion is allowed, entrance states are armed (`has-motion`);
 * if the animation script never starts, they are lifted again after a few seconds so nothing stays hidden.
 */
const ARM_MOTION = `(function(){try{var d=document.documentElement;if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('has-motion');setTimeout(function(){if(!d.classList.contains('motion-live'))d.classList.remove('has-motion')},4000)}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={body.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ARM_MOTION }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
