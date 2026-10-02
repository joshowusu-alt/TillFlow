import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AnalyticsClient from '@/app/(protected)/reports/analytics/AnalyticsClient';
import ReportAmountCard from '@/components/reports/ReportAmountCard';
import ReportFilterDisclosure from '@/components/reports/ReportFilterDisclosure';
import BottomTabBar from '@/components/BottomTabBar';
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import { ReportsCompactBillingBanner, ReportsCompactSetupBanner } from '@/components/reports/ReportsCompactBanners';
import TodayScreen from '@/components/reports/today/TodayScreen';
import { todayNextActions, type TodaySnapshot } from '@/lib/reports/today/model';
import { reviewAttentionSampleRows } from '@/lib/reports/today/review-samples';
import { returnPathFor, stage3aExploreNextSteps, stage3aLinks, type Stage3aSection } from '@/lib/reports/today/stage3a-nav';
import { isReportsStage3aAllowed } from '@/lib/reviews/reports-stage3a-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports Today layout review',
  robots: { index: false, follow: false },
};

const FIXTURES = {
  zero: { money: 0, cash: 0 },
  medium: { money: 120_000, cash: -200 },
  large: { money: 1_234_567_890, cash: 1_234_567_890 },
  'negative-large': { money: -1_234_567_890, cash: -1_234_567_890 },
} as const;

type FixtureId = keyof typeof FIXTURES;

function snapshot(fixture: FixtureId): TodaySnapshot {
  const amounts = FIXTURES[fixture];
  return {
    readCount: 1,
    salesTodayPence: 150_000,
    salesCount: 4,
    yesterdayPence: 80_000,
    days: [{ key: '2026-09-30', label: 'Wed', salesPence: 150_000 }],
    moneyReceivedPence: amounts.money,
    methods: [{ method: 'CASH', label: 'Cash', amountPence: amounts.money }],
    cashDifferencePence: amounts.cash,
    comparison: null,
    branches: null,
    profit: { state: 'ready', grossProfitPence: 45_000 },
    topProducts: [],
    attention: fixture === 'medium' ? [] : [{
      rank: 1,
      severity: 'high',
      title: 'Cash counted is short',
      detail: 'Sample till',
      action: 'Review cash',
      href: '/reports/cash-drawer',
      occurredAt: '2026-09-30T18:00:00.000Z',
    }],
  };
}

const BANNERS = ['none', 'setup', 'trial', 'both'] as const;
type BannerMode = (typeof BANNERS)[number];

function quietSnapshot(): TodaySnapshot {
  return {
    readCount: 1,
    salesTodayPence: 0,
    salesCount: 0,
    yesterdayPence: 0,
    days: [],
    moneyReceivedPence: 0,
    methods: [],
    cashDifferencePence: null,
    comparison: null,
    branches: null,
    profit: { state: 'omitted', grossProfitPence: null },
    topProducts: [],
    attention: [],
  };
}

const REVIEW_HREFS = new Set([
  '/reports/dashboard',
  '/reports/analytics',
  '/reports/business-movement',
  '/reports/money-received',
  '/settings/online-store/analytics',
  '/reports/momo-confirmation',
  '/payments/reconciliation',
  '/reports/cash-drawer',
  '/reports/stock-movements',
  '/reports/margins',
  '/reports/reorder-suggestions',
  '/reports/sales-by-supplier',
  '/reports/risk-monitor',
  '/reports/income-statement',
  '/reports/exports',
  '/reports/owner',
  '/reports/audit-log',
]);

const RETURN_DESTINATIONS = {
  trading: '/reports/dashboard',
  analytics: '/reports/analytics',
  movement: '/reports/business-movement',
  income: '/reports/income-statement',
} as const;

function ReviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-today-layout-review>
      <div aria-hidden="true" className="h-[5.75rem] border-b border-slate-200 bg-white" data-header-stand-in="" />
      <main className="app-main-shell" data-reports-focus-scope>
        {children}
      </main>
      <BottomTabBar userRole="OWNER" />
    </div>
  );
}

function reviewToday(section: Stage3aSection, extras: Partial<Parameters<typeof TodayScreen>[0]>) {
  return (
    <TodayScreen
      section={section}
      scopeLabel="Sample Main Branch"
      dateLabel="Wednesday 30 September 2026 · Local time"
      zoneName="GMT"
      updatedLabel="14:10"
      readOnly={false}
      currency="GHS"
      storeId="sample-branch"
      links={stage3aLinks(section, REVIEW_HREFS, { showNetworkQueue: true })}
      salesHref="/reports/dashboard"
      snapshot={null}
      blocked={null}
      failed={false}
      {...extras}
    />
  );
}

export default function ReportsTodayLayoutReviewPage({
  searchParams,
}: {
  searchParams?: { fixture?: string; state?: string; banner?: string; destination?: string };
}) {
  if (!isReportsStage3aAllowed()) notFound();
  if (searchParams?.state === 'analytics-values') {
    return <ReviewShell><AnalyticsClient data={{
      currency: 'GHS', periodDays: 7,
      salesTrend: { labels: ['Mon'], values: [1_234_567_890] },
      profitTrend: { labels: ['Mon'], values: [-1_234_567_890] },
      hourlyData: [{ day: 'Mon', hour: 10, sales: 4 }],
      categoryData: [{ name: 'Groceries', value: 1_234_567_890 }],
      productData: [{ name: 'Rice', revenue: 1_234_567_890, profit: 500_000, margin: 20 }],
      comparison: { labels: ['Mon'], current: [1_234_567_890], previous: [800_000] },
      kpis: { totalSales: 1_234_567_890, totalProfit: -1_234_567_890, marginPercent: -100,
        totalTransactions: 4, avgTransaction: 1_234_567_890, growthPercent: 20,
        previousPeriodSales: 800_000, topSellingProduct: 'Rice', peakHour: '10:00' },
    }} /></ReviewShell>;
  }
  if (searchParams?.state === 'movement-values') {
    return <ReviewShell><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 150_000, 16_273_050, 1_234_567_890, -1_234_567_890].map((pence, index) =>
        <ReportAmountCard key={index} label={`Metric ${index + 1}`} pence={pence} currency="GHS" />)}
    </div></ReviewShell>;
  }
  if (searchParams?.state === 'trading-filters') {
    return <ReviewShell><ReportFilterDisclosure><form method="GET">
      <label htmlFor="review-from">From</label><input className="input" id="review-from" type="date" name="from" defaultValue="2026-10-02" />
      <button className="btn-primary" type="submit">Apply filters</button>
    </form></ReportFilterDisclosure></ReviewShell>;
  }
  if (searchParams?.state === 'attention') {
    const ready = snapshot('large');
    ready.attention = reviewAttentionSampleRows();
    return <ReviewShell>{reviewToday('today', { snapshot: ready, moneyHref: '/reports/money-received', cashHref: '/reports/cash-drawer' })}</ReviewShell>;
  }
  if (searchParams?.state === 'activity' || searchParams?.state === 'more') {
    return <ReviewShell>{reviewToday(searchParams.state, {})}</ReviewShell>;
  }
  if (searchParams?.state === 'failed') {
    return <ReviewShell>{reviewToday('today', { failed: true, updatedLabel: '', snapshot: null })}</ReviewShell>;
  }
  if (searchParams?.state === 'no-branch') {
    return (
      <ReviewShell>
        <select id="operational-store-switcher" className="hidden" aria-label="Hidden branch" defaultValue="">
          <option value="">Select branch</option>
        </select>
        <select id="operational-store-switcher" aria-label="Working location" defaultValue="">
          <option value="">Select branch</option>
          <option value="sample-branch">Sample Main Branch</option>
        </select>
        {reviewToday('today', {
          snapshot: null,
          blocked: {
            title: 'Choose a branch',
            body: 'Figures stay hidden until a branch is selected. Use the Working location control at the top of the screen.',
            focusBranch: true,
          },
        })}
      </ReviewShell>
    );
  }
  if (searchParams?.state === 'return') {
    const destination = RETURN_DESTINATIONS[searchParams.destination as keyof typeof RETURN_DESTINATIONS] ?? RETURN_DESTINATIONS.trading;
    const path = returnPathFor(destination);
    if (!path) notFound();
    return (
      <ReviewShell>
        <ReportsReturnPath path={path} storeId={destination === '/reports/income-statement' ? null : 'sample-branch'} />
      </ReviewShell>
    );
  }
  const fixture = (searchParams?.fixture && searchParams.fixture in FIXTURES
    ? searchParams.fixture
    : 'medium') as FixtureId;
  if (searchParams?.state === 'empty') {
    const banner = (BANNERS.includes(searchParams.banner as BannerMode) ? searchParams.banner : 'none') as BannerMode;
    const exploreLinks = stage3aExploreNextSteps(new Set([
      '/reports/dashboard',
      '/reports/money-received',
      '/reports/momo-confirmation',
      '/reports/stock-movements',
    ]));
    return (
      <div data-today-layout-review data-today-fixture="empty" data-banner-mode={banner}>
        {banner === 'setup' || banner === 'both' ? (
          <ReportsCompactSetupBanner
            title="Getting ready"
            detail="Tell us what kind of business you run."
            cta="Begin setup"
          />
        ) : null}
        {banner === 'trial' || banner === 'both' ? (
          <ReportsCompactBillingBanner
            message="Your TillFlow trial has 8 days left."
            actionLabel="View billing"
            href="/settings/billing"
            tone="blue"
          />
        ) : null}
        <main className="app-main-shell">
          <TodayScreen
            section="today"
            scopeLabel="Sample Main Branch"
            dateLabel="Wednesday 30 September 2026 · Local time"
            zoneName="GMT"
            updatedLabel=""
            readOnly={false}
            currency="GHS"
            storeId="sample-branch"
            links={[]}
            exploreLinks={exploreLinks}
            nextActions={todayNextActions({ role: 'OWNER', readOnly: false })}
            salesHref="/reports/dashboard"
            snapshot={quietSnapshot()}
            blocked={null}
            failed={false}
          />
        </main>
        <BottomTabBar userRole="OWNER" />
      </div>
    );
  }
  if (searchParams?.state === 'clearance') {
    const banner = (BANNERS.includes(searchParams.banner as BannerMode) ? searchParams.banner : 'setup') as BannerMode;
    return (
      <div data-today-layout-review data-banner-mode={banner}>
        <div aria-hidden="true" className="h-[5.75rem] border-b border-slate-200 bg-white" data-header-stand-in="" />
        {banner === 'setup' || banner === 'both' ? (
          <ReportsCompactSetupBanner
            title="Getting ready"
            detail="Tell us what kind of business you run."
            cta="Begin setup"
          />
        ) : null}
        {banner === 'trial' || banner === 'both' ? (
          <ReportsCompactBillingBanner
            message="Your TillFlow trial has 8 days left."
            actionLabel="View billing"
            href="/settings/billing"
            tone="blue"
          />
        ) : null}
        <main className="app-main-shell w-full min-w-0 px-4 pt-1">
          {reviewToday('today', {
            snapshot: snapshot('large'),
            moneyHref: '/reports/money-received',
            cashHref: '/reports/cash-drawer',
          })}
        </main>
        <BottomTabBar userRole="OWNER" />
      </div>
    );
  }
  return (
    <div data-today-layout-review data-today-fixture={fixture}>
      <TodayScreen
        section="today"
        scopeLabel="Sample Main Branch"
        dateLabel="Wednesday 30 September 2026 · Local time"
        zoneName="GMT"
        updatedLabel="14:10"
        readOnly={false}
        currency="GHS"
        storeId="sample-branch"
        links={[]}
        salesHref="/reports/dashboard"
        moneyHref="/reports/money-received"
        snapshot={snapshot(fixture)}
        blocked={null}
        failed={false}
      />
    </div>
  );
}
