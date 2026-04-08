import type { Metadata } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import '@/app/globals.css';
import ControlShell from '@/components/control-shell';
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
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const staff = await getControlStaffOptional();

  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="font-[var(--font-body)] antialiased">
        {staff ? (
          <ControlShell staff={staff}>{children}</ControlShell>
        ) : children}
      </body>
    </html>
  );
}