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

  if (staff) {
    try {
      // Layout only needs aggregate counts; the search input fetches matches
      // from /api/search on demand so we no longer ship the full portfolio
      // to every page.
      const businesses = await getCachedNavCounts();
      const summary = getPortfolioSummaryFor(businesses);
      const queues = getCollectionQueuesFor(businesses);
      navCounts = {
        urgent: summary.grace + summary.fallback + summary.readOnly,
        collections: queues.overdue.length + queues.locked.length,
        unreviewed: businesses.filter((b) => b.needsReview).length,
      };
    } catch {
      // Graceful degradation — nav counts not available
    }
  }

  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="font-[var(--font-body)] antialiased">
        <ServiceWorkerRegistration />
        <InstallPrompt />
        {staff ? (
          <ControlShell staff={staff} navCounts={navCounts}>{children}</ControlShell>
        ) : children}
      </body>
    </html>
  );
}

import { unstable_cache } from 'next/cache';
// 60-second TTL on portfolio nav counts. Mutations call revalidatePath
// on `/`, `/businesses`, `/collections`, etc., which wipes this cache
// because the layout consumes it via Next's data cache wrapper.
const getCachedNavCounts = unstable_cache(
  () => listManagedBusinesses(),
  ['control-nav-counts'],
  { revalidate: 60, tags: ['control-portfolio'] }
);