'use client';

import DashboardWelcomeHeader from '@/components/DashboardWelcomeHeader';
import FinancialAmount from '@/components/reports/FinancialAmount';
import StatCard from '@/components/StatCard';
import { formatMoney } from '@/lib/format';

/** Approved Today sample, mounted only so the live card can be measured. Not a destination query. */
export const DESTINATION_SAMPLE_PENCE = 150_000;
/** Layout fixture used to show the existing Analytics truncation. Not a business total. */
export const DESTINATION_LONG_PENCE = 9_876_543_210;

const money = (pence: number) => formatMoney(pence, 'GHS');

export function TradingResult() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-destination-result="trading">
      <div data-primary-card="true">
        <StatCard
          label="Sales revenue"
          value={<span data-first-figure="true">{money(DESTINATION_SAMPLE_PENCE)}</span>}
          tone="accent"
          helper="Recognised sales for this period (not money received)."
        />
      </div>
      <StatCard
        label="Gross Profit"
        value="Costs incomplete"
        tone="warn"
        helper="Lines without authoritative cost. Sales above are still recognised."
      />
      <StatCard label="Expenses" value={money(0)} helper="Business-wide accounting records." />
    </div>
  );
}

export function TradingWelcome() {
  return (
    <DashboardWelcomeHeader
      firstName="Sample"
      businessName="Sample Main Branch"
      caption="Trading Report · 7-day default."
      userKey="stage3a1-review"
      actions={<p className="text-sm text-muted">Updated 14:10</p>}
    />
  );
}

/**
 * The KPI row from AnalyticsClient, including its truncate classes.
 * Charts are not mounted. This review does not calculate Analytics.
 */
export function AnalyticsResult({ truncateMoney }: { truncateMoney: boolean }) {
  const revenue = money(DESTINATION_LONG_PENCE);
  const label = truncateMoney ? 'text-[10px] text-black/50 sm:text-xs' : 'text-xs font-semibold text-slate-700';
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8" data-destination-result="analytics">
      <div className="card p-3 sm:p-4" data-primary-card="true">
        <div className={label}>Revenue</div>
        {truncateMoney ? (
          <div className="mt-1 text-base sm:text-xl font-bold text-emerald-600 truncate" data-analytics-amount="" data-first-figure="true">{revenue}</div>
        ) : (
          <div className="financial-fit mt-1 min-w-0" data-analytics-amount="" data-first-figure="true">
            <FinancialAmount pence={DESTINATION_LONG_PENCE} currency="GHS" variant="prominent" />
          </div>
        )}
      </div>
      <div className="card p-3 sm:p-4">
        <div className={label}>Gross Profit</div>
        <div className="mt-1 text-base sm:text-xl font-bold truncate text-amber-700">Costs incomplete</div>
      </div>
      <div className="card p-3 sm:p-4">
        <div className={label}>Margin</div>
        <div className="mt-1 text-base sm:text-xl font-bold text-amber-700">Costs incomplete</div>
      </div>
      <div className="card p-3 sm:p-4">
        <div className={label}>Transactions</div>
        <div className="mt-1 text-base sm:text-xl font-bold">4</div>
      </div>
      <div className="card p-3 sm:p-4">
        <div className={label}>Avg Ticket</div>
        <div className="mt-1 text-base sm:text-xl font-bold truncate">—</div>
      </div>
      <div className="card p-3 sm:p-4">
        <div className={label}>Growth</div>
        <div className="mt-1 text-base sm:text-xl font-bold">—</div>
      </div>
      <div className="card p-3 sm:p-4">
        <div className={label}>Top Product</div>
        <div className="mt-1 truncate font-bold text-xs sm:text-sm">Sample rice</div>
      </div>
      <div className="card p-3 sm:p-4">
        <div className={label}>Peak Hour</div>
        <div className="mt-1 text-base sm:text-xl font-bold">—</div>
      </div>
    </div>
  );
}

export function MovementResult() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" data-destination-result="business-movement">
      <div data-primary-card="true">
        <StatCard
          label="Sales"
          value={<span data-first-figure="true">{money(DESTINATION_SAMPLE_PENCE)}</span>}
          helper="Sales use the time the invoice was created."
          tone="success"
        />
      </div>
      <StatCard label="Money Received" value={money(120_000)} helper="Confirmed payments for the selected period." tone="accent" />
      <StatCard label="Refunds" value="—" helper="No refund total is included in this review." />
      <StatCard label="MoMo to confirm" value={money(42_000)} helper="Waiting for confirmation." tone="warn" />
      <StatCard label="Sales vs money in" value="—" helper="Shown by the live report after both totals load." />
    </div>
  );
}
