import { requireBusiness, getFirstStore } from '@/lib/auth';
import { getBusinessPlan } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { getTodayKPIs } from '@/lib/reports/today-kpis';
import { countOnlineOrdersNeedingAttention } from '@/lib/services/online-orders-attention';
import TopNav from '@/components/TopNav';
import BottomTabBar from '@/components/BottomTabBar';
import ProtectedBusinessScope from '@/components/ProtectedBusinessScope';
import PullToRefresh from '@/components/PullToRefresh';
import { headers } from 'next/headers';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getMerchantSubscriptionMessage } from '@/lib/subscription-lifecycle';

function formatDateLabel(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-GB');
}

const RESTRICTED_BILLING_STATES = new Set(['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'CANCELLED', 'READ_ONLY']);

function isAllowedWhenBillingRestricted(pathname: string) {
  if (!pathname || pathname === '/') return true;
  return (
    pathname.startsWith('/settings/billing') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/settings/organization') ||
    pathname.startsWith('/getting-started') ||
    pathname.startsWith('/reports/dashboard')
  );
}

function RestrictedAccessScreen({
  message,
}: {
  message: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-2 py-10">
      <div className="w-full rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 0h10.5A1.5 1.5 0 0118.75 12v7.5A1.5 1.5 0 0117.25 21H6.75a1.5 1.5 0 01-1.5-1.5V12a1.5 1.5 0 011.5-1.5z" />
          </svg>
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-ink">Access restricted</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-black/60">
          {message || 'Your TillFlow payment needs confirmation before this feature can continue.'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/settings/billing" className="btn-primary justify-center">
            View billing
          </Link>
          <Link href="/settings/billing#payment-instructions" className="btn-ghost justify-center">
            Contact Tishgroup
          </Link>
        </div>
      </div>
    </div>
  );
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

  // Online orders attention count — shown as a badge on the Online Orders nav item.
  // Only fetch for OWNER/MANAGER to avoid unnecessary queries for cashiers.
  const onlineOrdersCount =
    (user.role === 'OWNER' || user.role === 'MANAGER')
      ? await countOnlineOrdersNeedingAttention(business.id).catch(() => 0)
      : 0;

  // Show onboarding banner when onboarding is not complete
  const needsOnboarding = user.role === 'OWNER' && !business.onboardingCompletedAt;
  const headersList = headers();
  const pathname = headersList.get('x-pathname') || '';
  const billingAccessState = String((business as any).billingAccessState ?? 'ACTIVE');
  const billingDisplayStatus = String((business as any).billingDisplayStatus ?? billingAccessState.replace(/_/g, ' '));
  const billingPrimaryBanner = (business as any).billingPrimaryBanner as string | null | undefined;
  const billingNextActionLabel = String((business as any).billingNextActionLabel ?? 'View billing');
  const billingNextActionHref = String((business as any).billingNextActionHref ?? '/settings/billing');
  const billingControlMessage = String((business as any).billingControlMessage ?? 'Billing access is being evaluated.');
  const billingMerchantMessage = String((business as any).billingMerchantMessage ?? getMerchantSubscriptionMessage(business as any));
  const shouldRestrictPage =
    RESTRICTED_BILLING_STATES.has(billingAccessState) &&
    !isAllowedWhenBillingRestricted(pathname);

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
      <PullToRefresh />
      <TopNav
        user={{ name: user.name, role: user.role as 'CASHIER' | 'MANAGER' | 'OWNER' }}
        plan={getBusinessPlan((business as any).plan ?? (business?.mode as any), ((business as any).storeMode as any) ?? 'SINGLE_STORE')}
        storeMode={((business as any).storeMode as any) ?? 'SINGLE_STORE'}
        storeName={store?.name}
        businessName={business.name}
        merchantBranding={{
          businessName: business.name,
          logoUrl: business.logoUrl ?? null,
          logoWidth: (business as any).logoWidth ?? null,
          logoHeight: (business as any).logoHeight ?? null,
          brandCompactLogoUrl: (business as any).brandCompactLogoUrl ?? null,
          brandCompactLogoWidth: (business as any).brandCompactLogoWidth ?? null,
          brandCompactLogoHeight: (business as any).brandCompactLogoHeight ?? null,
          brandSquareLogoUrl: (business as any).brandSquareLogoUrl ?? null,
          brandSquareLogoWidth: (business as any).brandSquareLogoWidth ?? null,
          brandSquareLogoHeight: (business as any).brandSquareLogoHeight ?? null,
          brandInitials: (business as any).brandInitials ?? null,
          brandPrimaryColor: (business as any).brandPrimaryColor ?? null,
          brandCompactMode: (business as any).brandCompactMode ?? 'AUTO',
          brandLogoBackground: (business as any).brandLogoBackground ?? 'AUTO',
        }}
        momoEnabled={!!business.momoEnabled}
        todaySales={todaySales}
        onlineOrdersCount={onlineOrdersCount}
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

      {billingPrimaryBanner && !pathname.includes('/settings/billing') && (
        <div className={`border-b px-4 py-3 text-sm sm:px-6 ${
          ['TRIAL_RESTRICTED', 'PAYMENT_RESTRICTED', 'CANCELLED', 'READ_ONLY'].includes(billingAccessState)
            ? 'border-rose-200 bg-rose-50/90 text-rose-900'
            : billingAccessState.includes('DUE_TODAY') || billingAccessState.includes('OVERDUE')
              ? 'border-amber-200 bg-amber-50/90 text-amber-900'
              : 'border-blue-200 bg-blue-50/90 text-blue-900'
        }`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>{billingPrimaryBanner}</p>
            <Link href={billingNextActionHref} className="font-semibold underline underline-offset-4">
              {billingNextActionLabel}
            </Link>
          </div>
        </div>
      )}

        <main
          id="main-content"
          className="app-main-shell w-full min-w-0 max-w-full px-4 py-3 pb-[calc(9rem+env(safe-area-inset-bottom,0px))] sm:px-5 sm:py-4 lg:px-6 lg:py-5 lg:pb-5"
        >
          {shouldRestrictPage ? (
            <RestrictedAccessScreen message={billingMerchantMessage} />
          ) : children}
        </main>
        <BottomTabBar />
    </div>
  );
}
