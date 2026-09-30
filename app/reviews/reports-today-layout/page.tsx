import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TodayScreen from '@/components/reports/today/TodayScreen';
import { isReportsStage3aAllowed } from '@/lib/reviews/reports-stage3a-gate';
import type { TodaySnapshot } from '@/lib/reports/today/model';

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

export default function ReportsTodayLayoutReviewPage({
  searchParams,
}: {
  searchParams?: { fixture?: string };
}) {
  if (!isReportsStage3aAllowed()) notFound();
  const fixture = (searchParams?.fixture && searchParams.fixture in FIXTURES
    ? searchParams.fixture
    : 'medium') as FixtureId;
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
