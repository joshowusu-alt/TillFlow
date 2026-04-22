import { requireBusiness, getFirstStore } from '@/lib/auth';
import { getBusinessPlan } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import TopNav from '@/components/TopNav';
import ProtectedBusinessScope from '@/components/ProtectedBusinessScope';
import { headers } from 'next/headers';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';

function formatDateLabel(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-GB');
}

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness();

  const [store, kpisResult] = await Promise.all([
    getFirstStore(business.id),
    getTodayKPIs(business.id).catch((error) => {
      console.error('[protected-layout] Failed to load today KPIs', {
        businessId: business.id,
        userId: user.id,
        error,
      });

      return {
        totalSalesPence: 0,
        grossMarginPence: 0,
        gpPercent: 0,
        txCount: 0,
        outstandingARPence: 0,
        outstandingAPPence: 0,
        arOver60Pence: 0,
        arOver90Pence: 0,
        cashVarianceTotalPence: 0,
        openHighAlerts: 0,
        totalTrackedProducts: 0,
        productsAboveReorderPoint: 0,
        paymentSplit: {},
        avgDailyExpensesPence: 0,
        cashOnHandEstimatePence: 0,
        negativeMarginProductCount: 0,
        momoPendingCount: 0,
        stockoutImminentCount: 0,
        urgentReorderCount: 0,
        thisWeekExpensesPence: 0,
        fourWeekAvgExpensesPence: 0,
        discountOverrideCount: 0,
      };
    })
  ]);

  // Keep nav and owner/dashboard summaries on the exact same KPI source so they
  // never disagree about today's trading position.
  const kpis = kpisResult;
  const todaySales = {
    totalPence: kpis.totalSalesPence,
    txCount: kpis.txCount,
    currency: business.currency,
  };

  // Show onboarding banner when onboarding is not complete
  const needsOnboarding = user.role === 'OWNER' && !business.onboardingCompletedAt;
  const headersList = headers();
  const pathname = headersList.get('x-pathname') || '';
  const billingAccessState = String((business as any).billingAccessState ?? 'ACTIVE');
  const billingGraceEndsAt = formatDateLabel((business as any).billingGraceEndsAt as Date | null | undefined);
  const billingStarterFallbackEndsAt = formatDateLabel(
    (business as any).billingStarterFallbackEndsAt as Date | null | undefined
  );
  const billingReadOnlyAt = formatDateLabel((business as any).billingReadOnlyAt as Date | null | undefined);

  // Compute lightweight readiness % — cached for 5 min per business.
  // Invalidated when products, staff, or sales change (revalidateTag in relevant actions).
  let readinessPct = 0;
  if (needsOnboarding) {
    readinessPct = await unstable_cache(
      async () => {
        const [productCount, staffCount, saleCount, purchaseCount] = await Promise.all([
          prisma.product.count({ where: { businessId: business.id } }),
          prisma.user.count({ where: { businessId: business.id } }),
          prisma.salesInvoice.count({
            where: {
              businessId: business.id,
              OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
            },
          }),
          prisma.purchaseInvoice.count({ where: { businessId: business.id } }),
        ]);
        const hasAddress = !!(business.address || business.phone);
        const hasOpeningStock = ((business as any).openingCapitalPence ?? 0) > 0 || purchaseCount > 0;
        const checks = [hasAddress, productCount >= 3, hasOpeningStock, staffCount > 1, saleCount > 0];
        return Math.round((checks.filter(Boolean).length / checks.length) * 100);
      },
      ['readiness', business.id],
      { revalidate: 300, tags: [`readiness-${business.id}`] }
    )();
  }

  return (
    <div className="min-h-screen w-full max-w-full">
      <ProtectedBusinessScope businessId={business.id} storeId={store?.id ?? null} />
      <TopNav
        user={{ name: user.name, role: user.role as 'CASHIER' | 'MANAGER' | 'OWNER' }}
        plan={getBusinessPlan((business as any).plan ?? (business?.mode as any), ((business as any).storeMode as any) ?? 'SINGLE_STORE')}
        storeMode={((business as any).storeMode as any) ?? 'SINGLE_STORE'}
        storeName={store?.name}
        momoEnabled={!!business.momoEnabled}
        todaySales={todaySales}
      />

      {/* Setup banner for owners who haven't completed onboarding */}
      {needsOnboarding && !pathname.includes('/onboarding') && (
        <div className="border-b border-blue-200/70 bg-gradient-to-r from-blue-50 via-white to-indigo-50/80 px-4 py-3 sm:px-6">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-accent">
              <div className="flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/80 px-3 py-2 shadow-sm">
                <div className="h-2 w-16 overflow-hidden rounded-full bg-accent/10">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${readinessPct}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-accent">{readinessPct}%</span>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent/70">Setup guide</div>
                <span className="text-sm font-medium text-accent">
                {readinessPct === 0
                ? 'Start with business profile, core products, and one live sale to activate your reports.'
                : readinessPct < 100
                ? `${readinessPct < 60 ? 'A few key steps remain' : 'Almost there'} — complete your setup to trade with full confidence.`
                : 'Final configuration steps are waiting — your system is already operational.'}
                </span>
              </div>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex w-full flex-shrink-0 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-accent/90 sm:ml-4 sm:w-auto sm:text-sm"
            >
              {readinessPct > 0 ? 'Continue setup' : 'Begin setup guide'} &rarr;
            </Link>
          </div>
        </div>
      )}

      {billingAccessState === 'GRACE' && !pathname.includes('/settings/billing') && (
        <div className="border-b border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Your subscription payment is pending. Full access continues until {billingGraceEndsAt ?? 'the end of your grace period'}.
            </p>
            <Link href="/settings/billing" className="font-semibold underline underline-offset-4">
              Update payment
            </Link>
          </div>
        </div>
      )}

      {billingAccessState === 'STARTER_FALLBACK' && !pathname.includes('/settings/billing') && (
        <div className="border-b border-sky-200 bg-sky-50/90 px-4 py-3 text-sm text-sky-900 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Running on Starter access. Upgrade to restore full features before {billingStarterFallbackEndsAt ?? billingReadOnlyAt ?? 'the fallback window closes'}.
            </p>
            <Link href="/settings/billing" className="font-semibold underline underline-offset-4">
              Open billing controls
            </Link>
          </div>
        </div>
      )}

      {billingAccessState === 'READ_ONLY' && !pathname.includes('/settings/billing') && (
        <div className="border-b border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Write access paused. Record payment to resume full operations.
            </p>
            <Link href="/settings/billing" className="font-semibold underline underline-offset-4">
              Restore access
            </Link>
          </div>
        </div>
      )}

        <main id="main-content" className="app-main-shell w-full min-w-0 max-w-full px-4 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5">
          {children}
        </main>
    </div>
  );
}
