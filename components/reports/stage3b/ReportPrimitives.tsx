import type { ReactNode } from 'react';
import FinancialAmount from '@/components/reports/FinancialAmount';
import { formatMoney } from '@/lib/format';

export const REPORT_FOCUS = 'rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
export const REPORT_LINK = `inline-flex min-h-11 items-center text-sm font-semibold text-accent ${REPORT_FOCUS}`;

export function ReportSection({ title, description, action, children, id }: {
  title: string; description?: string; action?: ReactNode; children: ReactNode; id?: string;
}) {
  return <section id={id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div className="min-w-0"><h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 max-w-[65ch] text-sm leading-5 text-slate-600">{description}</p> : null}</div>
      {action}
    </div>
    {children}
  </section>;
}

export function ReportMetric({ label, pence, currency, value, helper, warning = false, href }: {
  label: string; pence?: number | null; currency: string; value?: ReactNode; helper: string; warning?: boolean; href?: string;
}) {
  const content = <><dt className="text-sm font-semibold text-ink">{label}</dt>
    <dd className={`financial-fit mt-2 ${warning ? 'text-amber-900' : 'text-ink'}`}>
      {typeof pence === 'number' ? <FinancialAmount pence={pence} currency={currency} variant="prominent" /> : <span className="block break-words text-xl font-semibold leading-tight">{value ?? 'Not available'}</span>}
    </dd><dd className="mt-2 text-sm leading-5 text-slate-600">{helper}</dd></>;
  const classes = `min-w-0 rounded-2xl border p-4 sm:p-5 ${warning ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'} ${Math.abs(pence ?? 0) >= 1_000_000 ? 'col-span-2 sm:col-span-1' : ''}`;
  return <div className={classes} data-stage3b-metric>{href ? <a href={href} className={`block min-w-0 ${REPORT_FOCUS}`} aria-label={`${label} — view details`}><dl>{content}</dl></a> : <dl>{content}</dl>}</div>;
}

export function ReportSalesHero({ title, pence, currency, subtitle, children }: {
  title: string; pence: number; currency: string; subtitle: ReactNode; children?: ReactNode;
}) {
  const longAmount = formatMoney(Math.abs(pence), currency).length + (pence < 0 ? 1 : 0) > 14;
  return <section className="min-w-0 rounded-3xl bg-gradient-to-br from-[#172554] to-[#1d4ed8] p-5 text-white shadow-card sm:p-6" data-stage3b-hero data-first-figure="">
    <h2 className="text-base font-semibold">{title}</h2>
    <div className="financial-fit mt-3"><FinancialAmount pence={pence} currency={currency} variant="hero" className={`!text-white ${longAmount ? '!text-[clamp(1rem,7.5cqi,3.5rem)]' : '!text-[clamp(1rem,11cqi,3.5rem)]'}`} /></div>
    <div className="mt-2 text-sm leading-6 text-white">{subtitle}</div>
    {children ? <div className="mt-4 border-t border-white/30 pt-3 text-sm leading-6">{children}</div> : null}
  </section>;
}

export function ReportDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return <details className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4">
    <summary className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 py-2 text-sm font-semibold text-accent ${REPORT_FOCUS}`}>{title}<span aria-hidden="true">＋</span></summary>
    <div className="space-y-3 pb-4 text-sm leading-6 text-slate-700">{children}</div>
  </details>;
}

/** Exact values remain available by touch and keyboard; bars never imply negative composition. */
export function ReportValueBars({ rows, currency, empty = 'No recorded values for this period.' }: {
  rows: { label: string; pence: number; href?: string; helper?: string }[]; currency: string; empty?: string;
}) {
  const max = Math.max(...rows.map(row => Math.abs(row.pence)), 0);
  if (!rows.length) return <p className="py-3 text-sm text-slate-600">{empty}</p>;
  return <div className="space-y-3" data-report-value-bars>{rows.some(row => row.pence < 0) ? <p className="text-xs leading-5 text-slate-600">Bar length shows the size of the amount. Negative amounts are marked with a minus sign.</p> : null}{rows.map((row, index) => {
    const content = <><div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words text-sm font-medium text-ink">{row.label}</span>
      <span className="financial-fit w-full text-ink"><FinancialAmount pence={row.pence} currency={currency} className="!text-base" /></span></div>
      {row.helper ? <p className="mt-1 text-xs leading-5 text-slate-600">{row.helper}</p> : null}
      {max > 0 ? <div aria-hidden="true" className="mt-2 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${row.pence < 0 ? 'bg-amber-700' : 'bg-accent'}`} style={{ width: `${Math.abs(row.pence) / max * 100}%` }} /></div> : null}</>;
    return row.href ? <a key={index} href={row.href} className={`block min-h-11 min-w-0 py-1 ${REPORT_FOCUS}`}>{content}</a> : <div key={index} className="min-w-0">{content}</div>;
  })}</div>;
}
