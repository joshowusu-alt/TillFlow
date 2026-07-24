import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google';
import { Suspense } from 'react';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import NetworkStatus from '@/components/NetworkStatus';
import ToastProvider from '@/components/ToastProvider';
import KeyboardViewportBridge from '@/components/KeyboardViewportBridge';

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
  title: {
    default: 'TillFlow — POS, Stock & Reports for Ghanaian Businesses',
    template: '%s | TillFlow',
  },
  description:
    'Sell faster, track stock, manage payments, follow up debtors, and see reports clearly — built for Ghanaian businesses.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://www.tillflow.app'),
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png', sizes: '128x128' },
      { url: '/icons/tillflow-icon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/tillflow-icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/tillflow-icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
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
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable} scroll-smooth`} style={{ backgroundColor: '#F8FBFF' }}>
      <head>
        {/* Critical background painted before any CSS or React loads — prevents black flash */}
        <style dangerouslySetInnerHTML={{ __html: `html,body{background-color:#F8FBFF}` }} />
        {/* Apple PWA startup images — shown by iOS immediately on cold launch, before the WebView
            loads any HTML. Without these, iOS shows a black screen for 0.5–2s. One image is
            required per physical screen size; media queries select the correct one per device. */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1290x2796.png" media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1284x2778.png" media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1320x2868.png" media="screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1206x2622.png" media="screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1179x2556.png" media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1170x2532.png" media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1080x2340.png" media="screen and (device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-750x1334.png"  media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-2048x2732.png" media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1668x2388.png" media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1668x2224.png" media="screen and (device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-accent/15 selection:text-accent" style={{ backgroundColor: '#F8FBFF' }}>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[26rem] bg-shell-glow opacity-80"
        />
        <div className="relative z-10">
          <ServiceWorkerRegistration />
          <KeyboardViewportBridge />
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

