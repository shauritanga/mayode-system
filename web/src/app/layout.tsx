import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet" />
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
