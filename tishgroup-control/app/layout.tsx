import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import '@/app/globals.css';
import ControlShell from '@/components/control-shell';
import InstallPrompt from '@/components/InstallPrompt';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import { getControlStaffOptional } from '@/lib/control-auth';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const displayFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Tish Group Control',
  description: 'Internal portfolio and commercial control plane for Tillflow businesses.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Tish Group Control',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tish Group Control',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/api/icon?size=192', sizes: '192x192', type: 'image/png' },
      { url: '/api/icon?size=512', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/api/icon?size=180', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#122126',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const staff = await getControlStaffOptional();

  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="font-[var(--font-body)] antialiased">
        <ServiceWorkerRegistration />
        <InstallPrompt />
        {staff ? (
          <ControlShell staff={staff}>{children}</ControlShell>
        ) : children}
      </body>
    </html>
  );
}