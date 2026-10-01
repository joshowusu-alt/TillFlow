import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cashflow Forecast actionability and clarity', () => {
  const pageSrc        = readFileSync(join(process.cwd(), 'app/(protected)/reports/cashflow-forecast/page.tsx'), 'utf8');
  const forecastSvcSrc = readFileSync(join(process.cwd(), 'lib/reports/forecast.ts'), 'utf8');
  const schemaSrc      = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const financialsExportSrc = readFileSync(join(process.cwd(), 'app/api/reports/financials/route.ts'), 'utf8');

  // Subtitle

  it('1. Cashflow Forecast page component exists', () => {
    expect(pageSrc).toContain('export default async function CashflowForecastPage');
  });

  it('2. Subtitle does not contain "AR, AP" jargon', () => {
    expect(pageSrc).not.toContain('AR, AP');
  });

  it('3. Says the estimate is withheld and shows no values', () => {
    expect(pageSrc).toContain('This estimate is withheld');
    expect(pageSrc).toContain('No values are shown');
    expect(pageSrc).not.toContain('getCashflowForecast');
  });

  // Warning banner

  it('4. Does not show a cash-short warning', () => {
    expect(pageSrc).not.toContain('Cash may run short');
  });

  it('5. Does not list recommended forecast actions', () => {
    expect(pageSrc).not.toContain('Recommended actions');
  });

  it('6. Does not tell the customer to chase balances from this page', () => {
    expect(pageSrc).not.toContain('Chase overdue customer balances');
  });

  it('7. Does not tell the customer to review supplier payments from this page', () => {
    expect(pageSrc).not.toContain('Review large supplier payments');
  });

  it('8. Does not show an outflow figure', () => {
    expect(pageSrc).not.toContain('Largest expected outflow');
  });

  it('9. Warning banner does not contain "receivables"', () => {
    expect(pageSrc).not.toContain('receivables');
  });

  it('10. Does not present a guarantee disclaimer beside live numbers', () => {
    expect(pageSrc).not.toContain('not a guarantee');
  });

  // Cashflow vs profit

  it('11. Does not compare a live forecast with profit', () => {
    expect(pageSrc).not.toContain('not the same as profit');
  });

  it('12. Does not explain credit sales beside forecast numbers', () => {
    expect(pageSrc).not.toContain('sales on credit are not cash until the customer pays');
  });

  // Scenario helper

  it('13. Does not render scenario assumptions', () => {
    expect(pageSrc).not.toContain('Expected uses normal assumptions');
    expect(pageSrc).not.toContain('customers pay faster');
  });

  // Daily Projection table

  it('14. Does not render a daily projection', () => {
    expect(pageSrc).not.toContain('pressure on cash');
  });

  it('15. Does not render a money-in column', () => {
    expect(pageSrc).not.toContain('>Money in<');
  });

  it('16. Does not render a money-out column', () => {
    expect(pageSrc).not.toContain('>Money out<');
  });

  it('17. Does not render an expected-balance column', () => {
    expect(pageSrc).not.toContain('>Expected balance<');
  });

  it('17b. Does not render best and worst case columns', () => {
    expect(pageSrc).not.toContain('>Best Case<');
    expect(pageSrc).not.toContain('>Worst Case<');
  });

  // Methodology note

  it('18. Methodology note does not contain "AR collections"', () => {
    expect(pageSrc).not.toContain('AR collections');
  });

  it('19. Methodology note does not contain "AP payments"', () => {
    expect(pageSrc).not.toContain('AP payments');
  });

  it('20. Methodology note does not contain "Overdue AR"', () => {
    expect(pageSrc).not.toContain('Overdue AR');
  });

  it('21. Methodology note does not contain "AP without due dates"', () => {
    expect(pageSrc).not.toContain('AP without due dates');
  });

  it('22. Does not describe customer balances as a forecast input', () => {
    expect(pageSrc).not.toContain('customer balances');
  });

  it('23. Does not describe supplier bills as a forecast input', () => {
    expect(pageSrc).not.toContain('Supplier balances');
  });

  it('24. Does not attach a prediction disclaimer to live numbers', () => {
    expect(pageSrc).not.toContain('not a guaranteed prediction');
  });

  it('25. Does not render the forecast method note', () => {
    expect(pageSrc).not.toContain('How this forecast works');
  });

  // Controls and safety

  it('26. Day buttons are not rendered', () => {
    expect(pageSrc).not.toContain('[7, 14, 30]');
  });

  it('27. The page does not load forecast values', () => {
    expect(pageSrc).not.toContain("from '@/lib/reports/forecast'");
    expect(pageSrc).not.toContain('getCashflowForecast');
  });

  it('28. features.cashflowForecast plan gate remains unchanged', () => {
    expect(pageSrc).toContain("surfaceId: 'cashflow_forecast'");
    expect(pageSrc).toContain('openLiveReport');
  });

  it('29. Badge dead import has been removed', () => {
    expect(pageSrc).not.toContain("import Badge from '@/components/Badge'");
  });

  it('30. No touch or pointer handlers added', () => {
    expect(pageSrc).not.toContain('onPointerDown');
    expect(pageSrc).not.toContain('onTouchStart');
    expect(pageSrc).not.toContain('onTouchMove');
  });

  // Local helper calculations

  it('30b. No outflow helper is calculated on the page', () => {
    expect(pageSrc).not.toContain('largestOutflowDay');
  });

  it('30c. No recovery helper is calculated on the page', () => {
    expect(pageSrc).not.toContain('cashRecoveryDay');
  });

  it('30d. No lowest-day highlight is rendered', () => {
    expect(pageSrc).not.toContain('isLowestDay');
  });

  // Service file integrity

  it('31. lib/reports/forecast.ts still exports getCashflowForecast', () => {
    expect(forecastSvcSrc).toContain('export function getCashflowForecast');
  });

  it('32. lib/reports/forecast.ts still exports projectCashflow', () => {
    expect(forecastSvcSrc).toContain('export function projectCashflow');
  });

  it('33. Collection/forecast percentages remain unchanged in service', () => {
    expect(forecastSvcSrc).toContain('0.85');
    expect(forecastSvcSrc).toContain('0.6');
    expect(forecastSvcSrc).toContain('1.1');
    expect(forecastSvcSrc).toContain('0.8');
  });

  // Export and schema safety

  it('34. Financial export route is intact and unchanged', () => {
    expect(financialsExportSrc).toContain('income-statement');
    expect(financialsExportSrc).toContain('cashflow');
  });

  it('35. Prisma schema still contains core financial models', () => {
    expect(schemaSrc).toContain('model SalesInvoice');
    expect(schemaSrc).toContain('model PurchaseInvoice');
    expect(schemaSrc).toContain('model Expense');
  });
});
