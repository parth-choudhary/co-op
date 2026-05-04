import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import Providers from '@/components/Providers';

// M1 Phase 1 / Plan 01-04.1 — viewport meta + PWA manifest + theme color.
// `viewportFit: 'cover'` extends content under the iOS notch / Android nav
// bar; pages must use `env(safe-area-inset-*)` from tokens.css to keep
// content out of the unsafe zones.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050507',
};

export const metadata: Metadata = {
  title: 'Co-Op — Build Companies with AI',
  description: 'A cooperative company-running platform where humans and AI agents work together.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Co-Op',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

const themeInitScript = `
(function(){try{
  var p=localStorage.getItem('coop-theme')||'system';
  var t=p==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;
  document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
