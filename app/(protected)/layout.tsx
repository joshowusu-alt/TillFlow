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

  // Show onboarding banner when onboarding is not complete
  const needsOnboarding = user.role === 'OWNER' && !business.onboardingCompletedAt;
  const headersList = headers();
  const pathname = headersList.get('x-pathname') || '';

  // Compute lightweight readiness %
  let readinessPct = 0;
  if (needsOnboarding) {
    const [productCount, staffCount, saleCount] = await Promise.all([
      prisma.product.count({ where: { businessId: business.id } }),
      prisma.user.count({ where: { businessId: business.id } }),
      prisma.salesInvoice.count({ where: { businessId: business.id, qaTag: { not: 'DEMO_DAY' } } }),
    ]);
    const hasAddress = !!(business.address || business.phone);
    const checks = [hasAddress, productCount >= 3, staffCount > 1, business.hasDemoData, saleCount > 0];
    readinessPct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  return (
    <div className="min-h-screen">
      <TopNav
        user={{ name: user.name, role: user.role as 'CASHIER' | 'MANAGER' | 'OWNER' }}
        mode={(business?.mode as any) ?? 'SIMPLE'}
        storeMode={((business as any).storeMode as any) ?? 'SINGLE_STORE'}
        storeName={store?.name}
      />

      {/* Setup banner for owners who haven't completed onboarding */}
      {needsOnboarding && !pathname.includes('/onboarding') && (
        <div className="border-b border-accent/20 bg-accentSoft px-6 py-3">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between">
            <div className="flex items-center gap-3 text-accent">
              <div className="flex items-center gap-2">
                <div className="h-2 w-16 overflow-hidden rounded-full bg-accent/10">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${readinessPct}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-accent">{readinessPct}%</span>
              </div>
              <span className="text-sm font-medium">
                {readinessPct === 0
                  ? 'Let\u2019s get your shop set up on TillFlow!'
                  : readinessPct < 100
                  ? 'You\u2019re making progress \u2014 keep going!'
                  : 'Almost there \u2014 just finish up!'}
              </span>
            </div>
            <Link
              href="/onboarding"
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent/80 ml-4 flex-shrink-0"
            >
              {readinessPct > 0 ? 'Continue Setup' : 'Get Started'} &rarr;
            </Link>
          </div>
        </div>
      )}

      <main id="main-content" className="p-6">{children}</main>
    </div>
  );
}
