import { APP_MODE, APP_MODE_LABEL, APP_MODE_LOGIN_COPY } from '@/lib/app-mode';
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

const DESCRIPTION = APP_MODE_LOGIN_COPY[APP_MODE].description;
const TITLE = `MAYODE GROUP — ${APP_MODE_LABEL[APP_MODE]}`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://admin.mayodegroup.com'),
  title: TITLE,
  description: DESCRIPTION,
  keywords: 'MAYODE GROUP, MAYOData, M-LAX Marketplace, Tanzania rice farming, Mbarali, cooperative management, Fairtrade',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'MAYODE GROUP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
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
