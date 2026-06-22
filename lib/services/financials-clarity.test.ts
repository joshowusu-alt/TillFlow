import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Financial Reports clarity', () => {
  const cashflowSrc        = readFileSync(join(process.cwd(), 'app/(protected)/reports/cashflow/page.tsx'), 'utf8');
  const incomeSrc          = readFileSync(join(process.cwd(), 'app/(protected)/reports/income-statement/page.tsx'), 'utf8');
  const marginsSrc         = readFileSync(join(process.cwd(), 'app/(protected)/reports/margins/page.tsx'), 'utf8');
  const balanceSrc         = readFileSync(join(process.cwd(), 'app/(protected)/reports/balance-sheet/page.tsx'), 'utf8');
  const forecastSrc        = readFileSync(join(process.cwd(), 'app/(protected)/reports/cashflow-forecast/page.tsx'), 'utf8');
  const financialsServiceSrc = readFileSync(join(process.cwd(), 'lib/reports/financials.ts'), 'utf8');
  const marginsServiceSrc  = readFileSync(join(process.cwd(), 'lib/reports/margin-analysis.ts'), 'utf8');
  const forecastServiceSrc = readFileSync(join(process.cwd(), 'lib/reports/forecast.ts'), 'utf8');
  const financialsExportSrc = readFileSync(join(process.cwd(), 'app/api/reports/financials/route.ts'), 'utf8');
  const marginsExportSrc   = readFileSync(join(process.cwd(), 'app/(protected)/exports/margins/route.ts'), 'utf8');
  const schemaSrc          = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  // Cashflow page

  it('1. Cashflow page component exists', () => {
    expect(cashflowSrc).toContain('export default async function CashflowPage');
  });

  it('2. Does not contain "Indirect cashflow (operations)."', () => {
    expect(cashflowSrc).not.toContain('Indirect cashflow (operations).');
  });

  it('3. Does not contain "Net Cash from Ops" label', () => {
    expect(cashflowSrc).not.toContain('"Net Cash from Ops"');
  });

  it('4. Contains a plain-English cash movement subtitle', () => {
    expect(cashflowSrc).toContain('money moved in and out of the business');
  });

  it('5. Contains explanation that cashflow is not the same as profit', () => {
    expect(cashflowSrc).toContain('Cashflow is not the same as profit');
  });

  it('6. Contains explanation that credit sales may affect profit before cash is collected', () => {
    expect(cashflowSrc).toContain('Credit sales may increase profit before the cash is collected');
  });

  it('7. Does not contain raw "Change in Accounts Receivable" label', () => {
    expect(cashflowSrc).not.toContain('Change in Accounts Receivable');
  });

  it('8. Does not contain raw "Change in Accounts Payable" label', () => {
    expect(cashflowSrc).not.toContain('Change in Accounts Payable');
  });

  it('9. Contains friendly AR/AP row alternatives', () => {
    expect(cashflowSrc).toContain('Customer credit not yet collected');
    expect(cashflowSrc).toContain('Supplier bills not yet paid');
  });

  // Income Statement page

  it('10. Income Statement page component exists', () => {
    expect(incomeSrc).toContain('export default async function IncomeStatementPage');
  });

  it('11. Does not contain standalone "COGS" as a quoted label', () => {
    expect(incomeSrc).not.toContain('"COGS"');
  });

  it('12. Contains "Cost of products sold"', () => {
    expect(incomeSrc).toContain('Cost of products sold');
  });

  it('13. Contains trust note about credit sales not yet collected', () => {
    expect(incomeSrc).toContain('credit sales not yet collected');
  });

  it('14. Contains wording that this is profit performance, not cash in the bank', () => {
    expect(incomeSrc).toContain('not cash in the bank');
  });

  it('15. Does not contain "No journal entries yet"', () => {
    expect(incomeSrc).not.toContain('No journal entries yet');
  });

  it('16. Contains plain-English empty state title', () => {
    expect(incomeSrc).toContain('No financial activity recorded yet');
  });

  // Profit Margins page

  it('17. Profit Margins page component exists', () => {
    expect(marginsSrc).toContain('export default async function MarginsPage');
  });

  it('18. Contains disclaimer that margins are before operating expenses', () => {
    expect(marginsSrc).toContain('They do not include');
    expect(marginsSrc).toContain('operating expenses');
  });

  it('19. Contains wording mentioning wages, rent, or utilities', () => {
    expect(marginsSrc).toContain('wages');
    expect(marginsSrc).toContain('rent');
    expect(marginsSrc).toContain('utilities');
  });

  it('20. Does not contain "Avg Sell / Base" column header', () => {
    expect(marginsSrc).not.toContain('Avg Sell / Base');
  });

  it('21. Does not contain "Avg Cost / Base" column header', () => {
    expect(marginsSrc).not.toContain('Avg Cost / Base');
  });

  it('22. Contains "Avg sell price" column header', () => {
    expect(marginsSrc).toContain('Avg sell price');
  });

  it('23. Contains "Avg cost per unit" column header', () => {
    expect(marginsSrc).toContain('Avg cost per unit');
  });

  it('24. Existing cost check wording remains present', () => {
    expect(marginsSrc).toContain('Cost check');
    expect(marginsSrc).toContain('costIssueLabel');
    expect(marginsSrc).toContain('recommendedAction');
  });

  // Balance Sheet page

  it('25. Balance Sheet page component exists', () => {
    expect(balanceSrc).toContain('export default async function BalanceSheetPage');
  });

  it('26. Existing blue note remains present', () => {
    expect(balanceSrc).toContain('Balance Sheet is an as-of-date financial position report');
    expect(balanceSrc).toContain('Equity includes cumulative net profit to date');
  });

  it('27. Contains "Money customers owe you" near Accounts Receivable', () => {
    expect(balanceSrc).toContain('Money customers owe you');
  });

  it('28. Contains "Value of stock on hand, not cash" near Inventory', () => {
    expect(balanceSrc).toContain('Value of stock on hand, not cash');
  });

  it('29. Contains "Money you owe suppliers" near Accounts Payable', () => {
    expect(balanceSrc).toContain('Money you owe suppliers');
  });

  it('30. BalanceSheetDatePicker import and control remain unchanged', () => {
    expect(balanceSrc).toContain("import BalanceSheetDatePicker from './BalanceSheetDatePicker'");
    expect(balanceSrc).toContain('<BalanceSheetDatePicker');
  });

  // Cashflow Forecast page

  it('31. Cashflow Forecast page component exists', () => {
    expect(forecastSrc).toContain('export default async function CashflowForecastPage');
  });

  it('32. Subtitle does not contain "AR, AP" jargon', () => {
    expect(forecastSrc).not.toContain('AR, AP');
  });

  it('33. Subtitle contains plain-English alternatives', () => {
    expect(forecastSrc).toContain('money owed to you');
    expect(forecastSrc).toContain('money you owe');
  });

  it('34. "How this forecast works" methodology note remains present', () => {
    expect(forecastSrc).toContain('How this forecast works');
  });

  it('35. Forecast day controls remain present', () => {
    expect(forecastSrc).toContain('days=${d}');
    expect(forecastSrc).toContain('[7, 14, 30]');
  });

  // Safety: plan gates unchanged

  it('36. Plan gates remain unchanged in all pages', () => {
    expect(cashflowSrc).toContain('features.financialReports');
    expect(incomeSrc).toContain('features.financialReports');
    expect(balanceSrc).toContain('features.financialReports');
    expect(marginsSrc).toContain('features.advancedReports');
    expect(forecastSrc).toContain('features.cashflowForecast');
  });

  // Safety: service import paths unchanged

  it('37. Service import paths remain unchanged', () => {
    expect(cashflowSrc).toContain("from '@/lib/reports/financials'");
    expect(incomeSrc).toContain("from '@/lib/reports/financials'");
    expect(balanceSrc).toContain("from '@/lib/reports/financials'");
    expect(marginsSrc).toContain("from '@/lib/reports/margin-analysis'");
    expect(forecastSrc).toContain("from '@/lib/reports/forecast'");
  });

  // Safety: date filters remain present

  it('38. Date filter controls remain present', () => {
    expect(cashflowSrc).toContain('DateRangeFilterCard');
    expect(incomeSrc).toContain('DateRangeFilterCard');
    expect(balanceSrc).toContain('BalanceSheetDatePicker');
    expect(marginsSrc).toContain("name=\"period\"");
    expect(forecastSrc).toContain('[7, 14, 30]');
  });

  // Safety: export links remain present

  it('39. Export links remain present where they existed', () => {
    expect(cashflowSrc).toContain('Export CSV');
    expect(incomeSrc).toContain('Export CSV');
    expect(balanceSrc).toContain('Export CSV');
    expect(marginsSrc).toContain('Excel');
    expect(marginsSrc).toContain('Print / PDF');
  });

  // Safety: service files untouched

  it('40. Financial service file key exports are intact', () => {
    expect(financialsServiceSrc).toContain('export function getIncomeStatement');
    expect(financialsServiceSrc).toContain('export function getBalanceSheet');
    expect(financialsServiceSrc).toContain('export function getCashflow');
    expect(financialsServiceSrc).toContain('export async function getAccountBalance');
  });

  it('40b. Margins service file key exports are intact', () => {
    expect(marginsServiceSrc).toContain('getMarginAnalysisSnapshot');
  });

  it('40c. Forecast service file key exports are intact', () => {
    expect(forecastServiceSrc).toContain('getCashflowForecast');
  });

  // Safety: export route files untouched

  it('41. Financials export route file is intact', () => {
    expect(financialsExportSrc).toContain('income-statement');
    expect(financialsExportSrc).toContain('cashflow');
    expect(financialsExportSrc).toContain('balance-sheet');
  });

  it('41b. Margins export route file is intact', () => {
    expect(marginsExportSrc).toContain('getMarginAnalysisSnapshot');
  });

  // Safety: schema untouched

  it('42. Prisma schema still contains core financial models', () => {
    expect(schemaSrc).toContain('model SalesInvoice');
    expect(schemaSrc).toContain('model JournalEntry');
    expect(schemaSrc).toContain('model Account');
  });

  // Safety: no touch/pointer handlers added

  it('43. No touch or pointer handlers added to any financial page', () => {
    for (const src of [cashflowSrc, incomeSrc, marginsSrc, balanceSrc, forecastSrc]) {
      expect(src).not.toContain('onPointerDown');
      expect(src).not.toContain('onTouchStart');
      expect(src).not.toContain('onTouchMove');
    }
  });
});
