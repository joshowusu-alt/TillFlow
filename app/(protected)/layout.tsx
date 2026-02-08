import { requireUser } from '@/lib/auth';
import TopNav from '@/components/TopNav';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const business = await prisma.business.findFirst();

  // Check if this is a new business that needs onboarding
  const needsOnboarding = business?.name === 'Supermarket Demo';
  const headersList = headers();
  const pathname = headersList.get('x-pathname') || '';

  // Auto-redirect to onboarding on first login (except if already on onboarding)
  if (needsOnboarding && !pathname.includes('/onboarding') && user.role === 'OWNER') {
    // Only redirect owners, let cashiers/managers proceed
    const referer = headersList.get('referer') || '';
    if (referer.includes('/login') || referer === '') {
      redirect('/onboarding');
    }
  }

  return (
    <div className="min-h-screen">
      <TopNav user={{ name: user.name, role: user.role as 'CASHIER' | 'MANAGER' | 'OWNER' }} mode={(business?.mode as any) ?? 'SIMPLE'} />

      {/* Setup banner for incomplete setup */}
      {needsOnboarding && user.role === 'OWNER' && !pathname.includes('/onboarding') && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between">
            <div className="flex items-center gap-3 text-white">
              <span className="text-lg">👋</span>
              <span className="font-medium">Welcome to TillFlow! Complete your setup to get started.</span>
            </div>
            <Link
              href="/onboarding"
              className="rounded-lg bg-white/20 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30"
            >
              Complete Setup →
            </Link>
          </div>
        </div>
      )}

      <main className="p-6">{children}</main>
    </div>
  );
}
