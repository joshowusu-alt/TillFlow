import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BottomTabBar from '@/components/BottomTabBar';
import { ReportsCompactBillingBanner, ReportsCompactSetupBanner } from '@/components/reports/ReportsCompactBanners';
import TodayScreen from '@/components/reports/today/TodayScreen';
import { todayNextActions, type TodaySnapshot } from '@/lib/reports/today/model';
import { stage3aExploreNextSteps } from '@/lib/reports/today/stage3a-nav';
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

export default function ReportsTodayLayoutReviewPage({
  searchParams,
}: {
  searchParams?: { fixture?: string; state?: string; banner?: string };
}) {
  if (!isReportsStage3aAllowed()) notFound();
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
