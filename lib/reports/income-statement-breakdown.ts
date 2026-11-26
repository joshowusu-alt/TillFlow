import { evaluateMarginLines, evaluateMarginSet, type MarginInvoiceInput } from './margin-line';

export const INCOME_STATEMENT_METRICS = {
  revenue: { label: 'Sales', explanation: 'Recorded sales after discounts, excluding tax. Fully returned and voided sales are excluded.' },
  cogs: { label: 'Cost of goods sold', explanation: 'Historical costs recorded on the sales in this period. Missing costs remain incomplete.' },
  grossProfit: { label: 'Gross profit', explanation: 'Sales less the recorded cost of goods sold.' },
  otherExpenses: { label: 'Expenses', explanation: 'Posted expense entries in this period, excluding cost of goods sold. Reversals reduce the expense.' },
  otherOperatingIncome: { label: 'Other income', explanation: 'Posted income entries other than sales.' },
  netProfit: { label: 'Profit', explanation: 'Gross profit less expenses, plus other income. Expenses reduce profit; reversals restore it.' },
} as const;
export type IncomeStatementMetric = keyof typeof INCOME_STATEMENT_METRICS;
export function isIncomeStatementMetric(value: string): value is IncomeStatementMetric {
  return Object.prototype.hasOwnProperty.call(INCOME_STATEMENT_METRICS, value);
}
export function incomeStatementEntriesHref(metric: IncomeStatementMetric, from: string, to: string) {
  return `/reports/income-statement/entries?${new URLSearchParams({ metric, from, to })}`;
}
export type IncompleteSaleLine = { productId: string | null; name: string | null; qtyBase: number; revenuePence: number; reason: string | null };
export type IncomeStatementContribution = {
  id: string; date: string; label: string; description: string; href: string | null;
  kind: 'sale' | 'expense' | 'other-income' | 'food-cost';
  revenuePence: number; costPence: number | null; profitPence: number | null; amountPence: number;
  incompleteLines?: IncompleteSaleLine[];
};

export function saleIncomeContribution(input: {
  id: string; date: string; label: string; margin: MarginInvoiceInput;
}): IncomeStatementContribution | null {
  const margin = evaluateMarginSet([input.margin]);
  if (['VOID', 'RETURNED'].includes(input.margin.paymentStatus) && margin.state === 'READY') return null;
  const incompleteLines = margin.state === 'INCOMPLETE_COSTS'
    ? evaluateMarginLines([input.margin]).lines.flatMap((line, index) => line.ready ? [] : [{
      productId: line.productId, name: line.name, qtyBase: input.margin.lines[index].qtyBase,
      revenuePence: line.revenuePence, reason: line.incompleteReason,
    }]) : [];
  return {
    ...(incompleteLines.length ? { incompleteLines } : {}),
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
    } else if (entry.kind === 'food-cost') {
      if (metric !== 'grossProfit' && metric !== 'netProfit') return [];
      amount = -entry.amountPence;
    } else {
      if (metric !== 'netProfit' && metric !== (entry.kind === 'expense' ? 'otherExpenses' : 'otherOperatingIncome')) return [];
      amount = metric === 'netProfit' && entry.kind === 'expense' ? -entry.amountPence : entry.amountPence;
    }
    return amount === 0 && entry.kind !== 'sale' ? [] : [{ ...entry, contributionPence: amount }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
