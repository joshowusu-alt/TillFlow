import FinancialAmount from '@/components/reports/FinancialAmount';
import { paymentMixPresentation } from '@/lib/reports/today/method-share';
import { ReportDisclosure, ReportMetric, ReportSalesHero, ReportSection, ReportValueBars, REPORT_LINK } from './ReportPrimitives';

export type TradingViewData = {
  currency: string; totalSales: number; totalPaymentReceipts: number;
  grossProfit: number | null; grossProfitPercent: number | null; incompleteLineCount: number;
  expenses: number; profitAfterExpenses: number | null; netProfitPercent: number; allBranches: boolean;
  creditUnpaid: number; outstandingAR: number; outstandingAP: number; scopeHelper: string;
  receiptsHref: string; cashDrawerHref: string; analyticsHref: string; reorderHref: string;
  receiptOrigins: { label: string; pence: number }[];
  methods: { label: string; pence: number; href: string }[];
  voidCount: number; voidTotal: number; returnCount: number; returnTotal: number;
  cashShiftCount: number; cashDiscrepancies: number;
  adjustments: { product: string; direction: string; quantity: number; user: string }[];
  ageing: { label: string; pence: number }[];
  debtors: { id: string; name: string; balance: number }[];
  lowStock: { id: string; name: string; quantity: string; reorder: number }[];
  bestItems: { id: string; name: string; quantity: string; revenue: number }[];
  livePulse: string; onShift: string;
};

export default function TradingReportView({ data }: { data: TradingViewData }) {
  const c = data.currency;
  const ready = data.grossProfit != null && data.grossProfitPercent != null;
  const mix = paymentMixPresentation(data.methods.map(row => row.pence));
  const unusualMargin = ready && data.grossProfitPercent! < -50 && data.totalSales > 0;
  const hasActivity = data.voidCount > 0 || data.returnCount > 0 || data.adjustments.length > 0 || data.cashDiscrepancies > 0;
  return <div className="space-y-4 sm:space-y-5" data-stage3b-report="trading" data-first-metric="">
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <ReportSalesHero title="Sales revenue" pence={data.totalSales} currency={c} subtitle="Recognised sales for the selected period. Includes credit sales; this is not money received.">
        {data.livePulse || data.onShift ? <div>{data.livePulse ? <p className="mt-1">{data.livePulse}</p> : null}{data.onShift ? <p className="mt-1">On shift now: {data.onShift}</p> : null}</div> : null}
      </ReportSalesHero>
      <ReportSection title="Money received" description="Confirmed receipts in this period, including later credit collections. Refunds are separate." action={<a href={data.receiptsHref} className={REPORT_LINK}>All receipts →</a>} id="money-received">
        <div className="financial-fit text-ink"><FinancialAmount pence={data.totalPaymentReceipts} currency={c} variant="prominent" /></div>
        <p className="mt-2 text-sm leading-5 text-slate-600">Sales and receipts use different event dates. Today shows net money received after completed refunds.</p>
        <details className="mt-2"><summary className={REPORT_LINK + ' cursor-pointer'}>Receipt origins</summary><dl className="mt-1 space-y-2">{data.receiptOrigins.map(row => <div key={row.label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2">
          <dt className="text-sm text-slate-600">{row.label}</dt><dd className="financial-fit w-full text-ink"><FinancialAmount pence={row.pence} currency={c} className="!text-base" /></dd>
        </div>)}</dl></details>
      </ReportSection>
    </div>

    <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
      <ReportMetric label="Gross profit" pence={data.grossProfit} value={data.incompleteLineCount > 0 ? "Costs incomplete" : "Not available"} currency={c} warning={!ready || data.grossProfit! < 0}
        helper={ready ? `Profit before expenses · ${data.grossProfitPercent}% margin` : data.incompleteLineCount > 0 ? `${data.incompleteLineCount} sale lines have missing recorded costs. Profit stays hidden; sales are still shown.` : 'No gross profit figure available for this period.'} />
      <ReportMetric label="Business-wide expenses" pence={data.expenses} currency={c} helper={data.scopeHelper} />
      <ReportMetric label={data.allBranches ? 'Net profit' : 'Profit after business-wide expenses'} pence={data.profitAfterExpenses} value={data.incompleteLineCount > 0 ? "Costs incomplete" : "Not available"} currency={c} warning={!ready || data.profitAfterExpenses! < 0}
        helper={data.allBranches ? 'Profit after expenses.' : 'Branch gross profit minus whole-business expenses. This is not branch net profit.'} />
      <ReportMetric label="Credit sales (unpaid)" pence={data.creditUnpaid} currency={c} helper="Unpaid portion of sales in this period. Not counted as money received." />
    </div>
    {unusualMargin ? <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Gross margin looks unusual ({data.grossProfitPercent}%). Review product cost prices and units before relying on this profit figure. <a href="/products" className="font-semibold underline">Review products</a>.</p> : null}

    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <ReportSection title="Receipt methods" description="Confirmed payment amounts. Tap a method to inspect its records.">
        {data.methods.every(row => row.pence === 0) ? <p className="text-sm text-slate-600">No confirmed receipt value for this period.</p> : <>
          {mix.showBar ? <div aria-hidden="true" className="mb-3 flex h-2 overflow-hidden rounded-full bg-slate-100">{data.methods.map((row, index) => <div key={row.label} className={index % 2 ? 'bg-sky-700' : 'bg-accent'} style={{ width: `${row.pence / data.totalPaymentReceipts * 100}%` }} />)}</div> : null}
          <ReportValueBars currency={c} rows={data.methods.filter(row => row.pence !== 0).map(row => ({ ...row, helper: mix.showBar ? (() => { const share = Math.round(row.pence / data.totalPaymentReceipts * 100); return share > 0 ? `${share}% of confirmed receipts` : undefined; })() : undefined }))} />
        </>}
        <p className="mt-3 text-sm leading-5 text-slate-600">Electronic payments are not physical till cash. <a href={data.cashDrawerHref} className={REPORT_LINK}>Open cash drawer →</a></p>
      </ReportSection>
      <ReportSection title="Period activity highlights" description="Returns, voids and stock adjustments in this period. These lists have record limits; they are not an exhaustive audit.">
        {!hasActivity ? <p className="text-sm text-slate-600">No voids, returns, adjustments, or cash variances in this period.</p> : <div className="space-y-3">
          <ReportValueBars currency={c} rows={[
            ...(data.voidCount ? [{ label: `Voids (${data.voidCount} recorded)`, pence: data.voidTotal }] : []),
            ...(data.returnCount ? [{ label: `Returns (${data.returnCount} recorded)`, pence: data.returnTotal, href: '/sales' }] : []),
            ...(data.cashDiscrepancies > 0 ? [{ label: `Total cash discrepancies (${data.cashShiftCount} shifts)`, pence: data.cashDiscrepancies, href: data.cashDrawerHref, helper: 'Shortages and overages added without cancelling each other out. Cash Drawer shows the net difference.' }] : []),
          ]} />
          {data.adjustments.map((row, index) => <p key={index} className="rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-700">Stock adjustment · {row.product} · {row.direction} {row.quantity} · {row.user}</p>)}
        </div>}
      </ReportSection>
    </div>

    <ReportSection title="Best-selling products by revenue" description="Selected report period · recorded line totals" action={<a href={data.analyticsHref} className={REPORT_LINK}>Sales analytics →</a>}>
        <ReportValueBars rows={data.bestItems.map(row => ({ label: row.name, pence: row.revenue, helper: row.quantity, href: `/products/${encodeURIComponent(row.id)}` }))} currency={c} empty="No sales in selected range." />
      </ReportSection>

    <ReportDisclosure title="How to read Trading">
      <p>Sales revenue can differ from Money received. Credit sales raise revenue before cash arrives; later credit collections raise receipts without new revenue.</p>
      <p>Physical cash drawer totals follow till/shift movements and may differ from cash receipts. Refund figures in the activity list use the existing returns query.</p>
      <p>Received at sale and Later credit collected use stored receipt origins. Historical — not classified includes older payments without a durable origin; they are not guessed from timestamps.</p>
      <p>Unknown/Other keeps payments with unrecognised stored methods in the total. Shares are omitted for negative or zero-total mixes.</p>
      <p>{data.scopeHelper}</p>
    </ReportDisclosure>

    <div className="pt-2"><h2 className="font-display text-xl font-semibold text-ink">Current debts and stock</h2><p className="mt-1 text-sm text-slate-600">Current position across all periods. These figures do not follow the selected report dates.</p></div>
    <div className="grid min-w-0 grid-cols-2 gap-3">
      <ReportMetric label="What customers owe overall" pence={data.outstandingAR} currency={c} helper="Current customer balances · all periods" href="/payments/customer-receipts" />
      <ReportMetric label="What you owe suppliers" pence={data.outstandingAP} currency={c} helper="Current supplier balances · all periods. Record supplier payments when purchases are paid." href="/payments/supplier-payments" />
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <ReportSection title="Customer debt ageing" description="Current outstanding customer balances by age."><ReportValueBars rows={data.ageing} currency={c} /></ReportSection>
      <ReportSection title="Largest customer balances" action={<a href="/payments/customer-receipts" className={REPORT_LINK}>Receive payments →</a>}>
        <ReportValueBars rows={data.debtors.map(row => ({ label: row.name, pence: row.balance, href: `/customers/${encodeURIComponent(row.id)}` }))} currency={c} empty="No outstanding customer debts." />
      </ReportSection>
      <ReportSection title="Stock needing attention" description="Current stock position." action={<a href={data.reorderHref} className={REPORT_LINK}>Review stock →</a>}>
        {data.lowStock.length ? <ul className="space-y-2">{data.lowStock.map(row => <li key={row.id} className="rounded-xl bg-amber-50 p-3 text-sm leading-6"><p className="font-semibold text-ink">{row.name}</p><p className="text-amber-900">{row.quantity}{row.reorder > 0 ? ` · Reorder quantity ${row.reorder}` : ''}</p></li>)}</ul> : <p className="text-sm text-slate-600">No stock needing attention in the loaded inventory.</p>}
      </ReportSection>

    </div>
    <ReportDisclosure title="Report coverage"><p>Inventory is limited to 1,000 records; best sellers to 20 groups before the displayed top five. Activity loads up to 200 voids, 500 returns, 100 counted shift differences and eight adjustments. Open shifts are capped at 20. Use supporting ledgers for a full investigation.</p></ReportDisclosure>
  </div>;
}
