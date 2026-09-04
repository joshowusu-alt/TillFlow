import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import { Suspense } from 'react';
import '@/app/globals.css';
import ControlShell from '@/components/control-shell';
import InstallPrompt from '@/components/InstallPrompt';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import Toast from '@/components/toast';
import { getControlStaffOptional } from '@/lib/control-auth';
import { isControlMaintenanceMode } from '@/lib/control-maintenance';
import { listManagedPortfolio } from '@/lib/control-service';
import { getPortfolioSummaryFor, getCollectionQueuesFor } from '@/lib/control-metrics';
import { portfolioAvailabilityMessage } from '@/lib/control-data';

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
  const maintenance = isControlMaintenanceMode();

  let navCounts: { urgent: number; collections: number; unreviewed: number } | undefined;
  let portfolioError: string | null = null;

  if (staff) {
    try {
      // Layout only needs aggregate counts; the search input fetches matches
      // from /api/search on demand so we no longer ship the full portfolio
      // to every page. Unavailable queries must not invent mock counts.
      const snapshot = await listManagedPortfolio();
      portfolioError = snapshot.availability === 'unavailable'
        ? portfolioAvailabilityMessage(snapshot)
        : null;
      if (snapshot.availability !== 'unavailable') {
        const businesses = snapshot.businesses;
        const summary = getPortfolioSummaryFor(businesses);
        const queues = getCollectionQueuesFor(businesses);
        navCounts = {
          urgent: summary.grace + summary.fallback + summary.readOnly,
          collections: queues.overdue.length + queues.locked.length,
          unreviewed: businesses.filter((b) => b.needsReview).length,
        };
      }
    } catch {
      portfolioError = 'Live portfolio data is unavailable. This is not an empty book — the query failed.';
    }
  }

  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="font-[var(--font-body)] antialiased">
        <ServiceWorkerRegistration />
        <InstallPrompt />
        <Suspense fallback={null}><Toast /></Suspense>
        {maintenance ? (
          <div role="status" className="border-b border-amber-300/80 bg-amber-50 px-4 py-3 text-center text-sm text-control-ink">
            Changes are temporarily disabled. You can still sign in with a personal password. Commercial, staff, support, payment, and subscription updates are blocked.
          </div>
        ) : null}
        {staff ? (
          <ControlShell staff={staff} navCounts={navCounts} maintenance={maintenance}>
            {portfolioError ? (
              <div className="mb-4 rounded-2xl border border-control-ember/20 bg-control-ember/8 px-4 py-3 text-sm text-control-ink">
                {portfolioError}
              </div>
            ) : null}
            {children}
          </ControlShell>
        ) : children}
      </body>
    </html>
  );
}