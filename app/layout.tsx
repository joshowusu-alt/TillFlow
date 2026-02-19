import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Sans } from 'next/font/google';
import { Suspense } from 'react';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import NetworkStatus from '@/components/NetworkStatus';
import ToastProvider from '@/components/ToastProvider';
import InstallPrompt from '@/components/InstallPrompt';

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display'
});

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: 'TillFlow',
  description: 'Sales made simple. Point of Sale, Inventory & Accounting.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/api/icon?size=32', type: 'image/png', sizes: '32x32' },
      { url: '/api/icon?size=192', type: 'image/png', sizes: '192x192' },
    ],
    apple: [
      { url: '/api/icon?size=180', sizes: '180x180' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TillFlow'
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',  // iPhone notch safe-area support
  themeColor: '#1E40AF'  // enterprise primary blue
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="min-h-screen bg-paper text-ink">
        <ServiceWorkerRegistration />
        <Suspense>
          <ToastProvider>
            {children}
          </ToastProvider>
        </Suspense>
        <NetworkStatus />
        <Suspense><InstallPrompt /></Suspense>
      </body>
    </html>
  );
}

