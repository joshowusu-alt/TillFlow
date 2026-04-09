import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import '@/app/globals.css';
import ControlShell from '@/components/control-shell';
import InstallPrompt from '@/components/InstallPrompt';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import { getControlStaffOptional } from '@/lib/control-auth';
import { listManagedBusinesses } from '@/lib/control-service';
import { getPortfolioSummaryFor, getCollectionQueuesFor } from '@/lib/control-metrics';

export const dynamic = 'force-dynamic';

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

  let navCounts: { urgent: number; collections: number; unreviewed: number } | undefined;
  let searchList: Array<{ id: string; name: string; ownerName: string; ownerPhone: string; plan: string; state: string }> = [];

  if (staff) {
    try {
      const businesses = await listManagedBusinesses();
      const summary = getPortfolioSummaryFor(businesses);
      const queues = getCollectionQueuesFor(businesses);
      navCounts = {
        urgent: summary.grace + summary.fallback + summary.readOnly,
        collections: queues.overdue.length + queues.locked.length,
        unreviewed: businesses.filter((b) => b.needsReview).length,
      };
      searchList = businesses.map((b) => ({
        id: b.id,
        name: b.name,
        ownerName: b.ownerName,
        ownerPhone: b.ownerPhone,
        plan: b.plan,
        state: b.state,
      }));
    } catch {
      // Graceful degradation — nav counts and search not available
    }
  }

  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="font-[var(--font-body)] antialiased">
        <ServiceWorkerRegistration />
        <InstallPrompt />
        {staff ? (
          <ControlShell staff={staff} navCounts={navCounts} businesses={searchList}>{children}</ControlShell>
        ) : children}
      </body>
    </html>
  );
}