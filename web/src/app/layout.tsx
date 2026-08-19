import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MAYODE GROUP — Integrated Management Platform',
  description: 'MAYOData Platform & M-LAX Marketplace — Integrated management system for MAYODE GROUP cooperative farmers, field officers, and administrators in Mbarali, Tanzania.',
  keywords: 'MAYODE GROUP, MAYOData, M-LAX Marketplace, Tanzania rice farming, Mbarali, cooperative management, Fairtrade',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        {/* Set the theme before first paint to avoid a dark→light flash for light-theme users. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('mayode-theme');if(s){var t=JSON.parse(s).state.theme;if(t==='light')document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
