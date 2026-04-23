import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google';
import { Suspense } from 'react';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import NetworkStatus from '@/components/NetworkStatus';
import ToastProvider from '@/components/ToastProvider';

const displayFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display'
});

const bodyFont = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-sans'
});

export const metadata: Metadata = {
  title: 'TillFlow',
  description: 'Sales made simple. Point of Sale, Inventory & Accounting.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon', type: 'image/png', sizes: '512x512' },
      { url: '/api/icon?size=192', type: 'image/png', sizes: '192x192' },
      { url: '/api/icon?size=32', type: 'image/png', sizes: '32x32' },
    ],
    apple: [
      { url: '/apple-icon', type: 'image/png', sizes: '180x180' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
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
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} scroll-smooth`} style={{ backgroundColor: '#f8fafc' }}>
      <head>
        {/* Inline critical background to prevent black flash during PWA cold start */}
        <style dangerouslySetInnerHTML={{ __html: `html,body{background-color:#f8fafc}` }} />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-accent/15 selection:text-accent" style={{ backgroundColor: '#f8fafc' }}>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[26rem] bg-shell-glow opacity-80"
        />
        <div className="relative z-10">
          <ServiceWorkerRegistration />
          <Suspense>
            <ToastProvider>
              {children}
            </ToastProvider>
          </Suspense>
          <NetworkStatus />
        </div>
      </body>
    </html>
  );
}

