import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import TopNav from '@/components/TopNav';
import { headers } from 'next/headers';
import Link from 'next/link';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness();

  // Get store name for the trust panel (no redirect if missing — handled per-page)
  const store = await prisma.store.findFirst({
    where: { businessId: business.id },
    select: { id: true, name: true }
  });

  // Check if this is a new business that may need onboarding guidance
  const needsOnboarding = business?.createdAt && (Date.now() - new Date(business.createdAt).getTime() < 1000 * 60 * 60 * 24);
  const headersList = headers();
  const pathname = headersList.get('x-pathname') || '';

  return (
    <div className="min-h-screen">
      <TopNav
        user={{ name: user.name, role: user.role as 'CASHIER' | 'MANAGER' | 'OWNER' }}
        mode={(business?.mode as any) ?? 'SIMPLE'}
        storeName={store?.name}
      />

      {/* Setup banner for new businesses */}
      {needsOnboarding && user.role === 'OWNER' && !pathname.includes('/onboarding') && (
        <div className="border-b border-blue-200 bg-blue-50 px-6 py-3">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between">
            <div className="flex items-center gap-3 text-blue-900">
              <svg className="h-5 w-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <span className="text-sm font-medium">
                Welcome to TillFlow! Complete your setup to get started selling.
              </span>
            </div>
            <Link
              href="/onboarding"
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-900 ml-4 flex-shrink-0"
            >
              Complete Setup &rarr;
            </Link>
          </div>
        </div>
      )}

      <main id="main-content" className="p-6">{children}</main>
    </div>
  );
}
