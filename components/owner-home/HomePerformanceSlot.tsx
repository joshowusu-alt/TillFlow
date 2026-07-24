import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import type { HomePerformanceSummary } from '@/lib/reports/home-performance-kpis';
import { getStatValueSize } from '@/components/owner-home/home-chrome';
import { HomePerformanceUnavailable } from '@/components/owner-home/section-errors';

export default async function HomePerformanceSlot({
  performancePromise,
  currency,
  saleCount,
}: {
  performancePromise: Promise<HomePerformanceSummary>;
  currency: string;
  saleCount: number;
}) {
  let data: HomePerformanceSummary;
  try {
    data = await performancePromise;
  } catch (error) {
    console.error('[home.performance] failed to load today\'s figures', error);
    return <HomePerformanceUnavailable />;
  }

  const formatCurrency = (pence: number) => formatMoney(pence, currency);

  const todayVsYesterdayText =
    data.yesterdayRevenuePence > 0
      ? `${formatCurrency(data.todayRevenuePence)} today / ${formatCurrency(data.yesterdayRevenuePence)} yesterday`
      : `${formatCurrency(data.todayRevenuePence)} today`;

  const heroStats =
    saleCount === 0
      ? [
          {
            label: 'Products',
            displayLabel: 'Products',
            value: data.productCount.toLocaleString(),
            href: '/products',
            footer: `${data.productCount} listed`,
            primary: true,
          },
          {
            label: "Today's Transactions",
            displayLabel: 'Transactions',
            value: data.todayTransactionCount.toLocaleString(),
            href: '/sales',
            footer: null as string | null,
            primary: false,
          },
          {
            label: 'Expected Cash',
            displayLabel: 'Expected Cash',
            value: formatCurrency(data.expectedCashPence),
            href: '/reports/cash-drawer',
            footer: data.openShiftCount > 0 ? 'Current open till balance' : 'No open till',
            primary: false,
          },
        ]
      : [
          {
            label: "Today's Revenue",
            displayLabel: 'Revenue',
            value: formatCurrency(data.todayRevenuePence),
            href: '/reports/dashboard',
            footer: todayVsYesterdayText,
            primary: true,
          },
          {
            label: "Today's Transactions",
            displayLabel: 'Transactions',
            value: data.todayTransactionCount.toLocaleString(),
            href: '/sales',
            footer: null as string | null,
            primary: false,
          },
          {
            label: 'Expected Cash',
            displayLabel: 'Expected Cash',
            value: formatCurrency(data.expectedCashPence),
            href: '/reports/cash-drawer',
            footer: data.openShiftCount > 0 ? 'Current open till balance' : 'No open till',
            primary: false,
          },
        ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
      {heroStats.map(({ label, displayLabel, value, href, footer, primary }) => (
        <Link
          key={label}
          href={href}
          aria-label={`${label}: ${value}`}
          className={`group relative flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-left backdrop-blur-md transition hover:border-white/20 hover:bg-white/14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:min-h-[6.5rem] sm:px-4 sm:py-3.5 lg:min-h-[6.5rem] lg:px-4 lg:py-3.5 ${
            primary ? 'col-span-2 min-h-[4.5rem] sm:col-span-1' : 'min-h-[4rem]'
          }`}
        >
          <span className="pointer-events-none relative z-10 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-blue-100/80 lg:text-xs">
            {displayLabel}
          </span>
          <span
            className={`mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-black leading-tight tracking-normal tabular-nums text-white ${getStatValueSize(value, primary)}`}
            title={value}
          >
            {value}
          </span>
          {footer ? (
            <span className="pointer-events-none relative z-10 mt-auto pt-1.5 text-[10px] font-semibold leading-snug text-blue-100/70 sm:pt-2">
              {footer}
            </span>
          ) : (
            <span className="pointer-events-none relative z-10 mt-auto pt-1.5 text-[10px] font-semibold text-blue-100/65 sm:pt-2">
              Today · All branches
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
