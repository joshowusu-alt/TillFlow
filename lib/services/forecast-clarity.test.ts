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

  it('3. Subtitle contains plain-English money owed alternatives', () => {
    expect(pageSrc).toContain('money owed to you');
    expect(pageSrc).toContain('money you owe');
  });

  // Warning banner

  it('4. Warning banner contains action-focused language', () => {
    expect(pageSrc).toContain('Cash may run short');
  });

  it('5. Warning banner includes "Recommended actions"', () => {
    expect(pageSrc).toContain('Recommended actions');
  });

  it('6. Warning banner tells user to chase overdue customer balances', () => {
    expect(pageSrc).toContain('Chase overdue customer balances');
  });

  it('7. Warning banner tells user to review supplier payments', () => {
    expect(pageSrc).toContain('Review large supplier payments');
  });

  it('8. Warning banner includes largest outflow check', () => {
    expect(pageSrc).toContain('Largest expected outflow');
    expect(pageSrc).toContain('check this is correct');
  });

  it('9. Warning banner does not contain "receivables"', () => {
    expect(pageSrc).not.toContain('receivables');
  });

  it('10. Warning banner includes estimate/not-a-guarantee disclaimer', () => {
    expect(pageSrc).toContain('not a guarantee');
  });

  // Cashflow vs profit

  it('11. Page explains forecast is not the same as profit', () => {
    expect(pageSrc).toContain('not the same as profit');
  });

  it('12. Page explains credit sales are not cash until customer pays', () => {
    expect(pageSrc).toContain('sales on credit are not cash until the customer pays');
  });

  // Scenario helper

  it('13. Scenario helper explains Expected / Best / Worst', () => {
    expect(pageSrc).toContain('Expected uses normal assumptions');
    expect(pageSrc).toContain('customers pay faster');
    expect(pageSrc).toContain('slower collections');
  });

  // Daily Projection table

  it('14. Daily Projection has helper text about cash pressure', () => {
    expect(pageSrc).toContain('pressure on cash');
  });

  it('15. "Inflow" column header is replaced with "Money in"', () => {
    expect(pageSrc).toContain('>Money in<');
    expect(pageSrc).not.toContain('>Inflow<');
  });

  it('16. "Outflow" column header is replaced with "Money out"', () => {
    expect(pageSrc).toContain('>Money out<');
    expect(pageSrc).not.toContain('>Outflow<');
  });

  it('17. "Balance (Expected)" column header is replaced with "Expected balance"', () => {
    expect(pageSrc).toContain('>Expected balance<');
    expect(pageSrc).not.toContain('Balance (Expected)');
  });

  it('17b. "Best Case" and "Worst Case" column headers remain present', () => {
    expect(pageSrc).toContain('>Best Case<');
    expect(pageSrc).toContain('>Worst Case<');
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

  it('22. Methodology note contains "customer balances"', () => {
    expect(pageSrc).toContain('customer balances');
  });

  it('23. Methodology note contains supplier bills language', () => {
    expect(pageSrc).toContain('Supplier balances');
    expect(pageSrc).toContain('Supplier bills');
  });

  it('24. Methodology note contains estimate/not-guaranteed disclaimer', () => {
    expect(pageSrc).toContain('not a guaranteed prediction');
  });

  it('25. "How this forecast works" section remains present', () => {
    expect(pageSrc).toContain('How this forecast works');
  });

  // Controls and safety

  it('26. Day buttons 7, 14, 30 remain present', () => {
    expect(pageSrc).toContain('[7, 14, 30]');
  });

  it('27. getCashflowForecast import remains unchanged', () => {
    expect(pageSrc).toContain("from '@/lib/reports/forecast'");
    expect(pageSrc).toContain('getCashflowForecast');
  });

  it('28. features.cashflowForecast plan gate remains unchanged', () => {
    expect(pageSrc).toContain('features.cashflowForecast');
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

  it('30b. largestOutflowDay local helper is present', () => {
    expect(pageSrc).toContain('largestOutflowDay');
    expect(pageSrc).toContain('expectedOutflowPence');
  });

  it('30c. cashRecoveryDay local helper is present', () => {
    expect(pageSrc).toContain('cashRecoveryDay');
  });

  it('30d. lowestPointDate row highlight is present', () => {
    expect(pageSrc).toContain('isLowestDay');
    expect(pageSrc).toContain('bg-rose-50');
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
