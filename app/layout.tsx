import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google';
import { Suspense } from 'react';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import NetworkStatus from '@/components/NetworkStatus';
import ToastProvider from '@/components/ToastProvider';
import KeyboardViewportBridge from '@/components/KeyboardViewportBridge';
import SplashRemover from '@/components/SplashRemover';

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
        <style dangerouslySetInnerHTML={{ __html: `@keyframes tf-phs-slide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}` }} />
        {/* Apple PWA startup images — shown by iOS immediately on cold launch, before the WebView
            loads any HTML. Without these, iOS shows a black screen for 0.5–2s. One image is
            required per physical screen size; media queries select the correct one per device. */}
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1290x2796.png" media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1284x2778.png" media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1179x2556.png" media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1170x2532.png" media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1080x2340.png" media="screen and (device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-750x1334.png"  media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-2048x2732.png" media="screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1668x2388.png" media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1668x2224.png" media="screen and (device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-accent/15 selection:text-accent" style={{ backgroundColor: '#F8FBFF' }}>
        {/* Pre-hydration splash: created before React mounts only for /launch or
            an active launch handoff, so normal in-app navigation does not show
            the full-screen launch splash again. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var path=location.pathname;var launching=sessionStorage.getItem('tillflow:launching')==='1';var seen=sessionStorage.getItem('tillflow:launchSplashSeen')==='1';if(path==='/launch'){sessionStorage.setItem('tillflow:launching','1');sessionStorage.removeItem('tillflow:launchSplashSeen');launching=true;seen=false;}var publicAuth=path==='/login'||path==='/welcome'||path==='/register';if(path!=='/launch'&&(!launching||seen||publicAuth))return;var bn=localStorage.getItem('tillflow:lastBusinessName');var hasName=!!(bn&&bn.trim());var el=document.createElement('div');el.id='tillflow-initial-splash';el.setAttribute('aria-hidden','true');el.style.cssText='position:fixed;inset:0;z-index:9999;background:#F8FBFF;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;animation:tf-phs-slide 0.3s ease both;pointer-events:auto';var img=document.createElement('img');img.src='/brand/tillflow-logo-blue.png';img.alt='';img.style.cssText='width:180px;height:auto;display:block';var copy=document.createElement('div');copy.style.cssText='text-align:center';var p=document.createElement('p');p.style.cssText='font-size:0.875rem;font-weight:600;color:#334155;margin:0;text-align:center';p.textContent=hasName?('Opening '+bn.trim()+'...'):'Opening your business workspace...';var d=document.createElement('p');d.style.cssText='font-size:0.75rem;font-weight:500;color:#64748b;margin:4px 0 0;text-align:center';d.textContent=hasName?('Getting today\\'s sales, stock, and cash ready.'):'Getting sales, stock, and cash ready.';copy.appendChild(p);copy.appendChild(d);el.appendChild(img);el.appendChild(copy);document.body.appendChild(el);}catch(e){}})();` }} />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[26rem] bg-shell-glow opacity-80"
        />
        <div className="relative z-10">
          <SplashRemover />
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

