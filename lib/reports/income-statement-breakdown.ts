import { evaluateMarginSet, type MarginInvoiceInput } from './margin-line';

export const INCOME_STATEMENT_METRICS = {
  revenue: { label: 'Revenue', explanation: 'Recorded sales after discounts, excluding tax. Fully returned and voided sales are excluded.' },
  cogs: { label: 'Cost of products sold', explanation: 'Historical costs recorded on the sales in this period. Missing costs remain incomplete.' },
  grossProfit: { label: 'Gross Profit', explanation: 'Revenue less the recorded cost of products sold.' },
  otherExpenses: { label: 'Operating Expenses', explanation: 'Posted expense entries in this period, excluding cost of products sold. Reversals reduce the expense.' },
  otherOperatingIncome: { label: 'Other operating income', explanation: 'Posted income entries other than sales revenue.' },
  netProfit: { label: 'Net Profit', explanation: 'Gross profit less operating expenses, plus other operating income. Expenses reduce profit; reversals restore it.' },
} as const;
export type IncomeStatementMetric = keyof typeof INCOME_STATEMENT_METRICS;
export function isIncomeStatementMetric(value: string): value is IncomeStatementMetric {
  return Object.prototype.hasOwnProperty.call(INCOME_STATEMENT_METRICS, value);
}
export function incomeStatementEntriesHref(metric: IncomeStatementMetric, from: string, to: string) {
  return `/reports/income-statement/entries?${new URLSearchParams({ metric, from, to })}`;
}
export type IncomeStatementContribution = {
  id: string; date: string; label: string; description: string; href: string | null;
  kind: 'sale' | 'expense' | 'other-income';
  revenuePence: number; costPence: number | null; profitPence: number | null; amountPence: number;
};

export function saleIncomeContribution(input: {
  id: string; date: string; label: string; margin: MarginInvoiceInput;
}): IncomeStatementContribution | null {
  const margin = evaluateMarginSet([input.margin]);
  if (['VOID', 'RETURNED'].includes(input.margin.paymentStatus) && margin.state === 'READY') return null;
  return {
    id: `sale:${input.id}`, date: input.date, label: input.label, description: 'Recorded sale · after discounts, excluding tax',
    href: `/sales/${encodeURIComponent(input.id)}`, kind: 'sale',
    revenuePence: margin.recognisedSalesPence,
    costPence: margin.grossProfitPence === null ? null : margin.recognisedSalesPence - margin.grossProfitPence,
    profitPence: margin.grossProfitPence, amountPence: 0,
  };
}

export function selectIncomeStatementEntries(entries: IncomeStatementContribution[], metric: IncomeStatementMetric) {
  return entries.flatMap(entry => {
    let amount: number | null;
    if (entry.kind === 'sale') {
      if (metric === 'otherExpenses' || metric === 'otherOperatingIncome') return [];
      amount = metric === 'revenue' ? entry.revenuePence : metric === 'cogs' ? entry.costPence : entry.profitPence;
    } else {
      if (metric !== 'netProfit' && metric !== (entry.kind === 'expense' ? 'otherExpenses' : 'otherOperatingIncome')) return [];
      amount = metric === 'netProfit' && entry.kind === 'expense' ? -entry.amountPence : entry.amountPence;
    }
    return amount === 0 && entry.kind !== 'sale' ? [] : [{ ...entry, contributionPence: amount }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
