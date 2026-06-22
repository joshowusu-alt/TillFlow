import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readSource = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Cash Drawer report clarity pass', () => {
  const page = readSource('app/(protected)/reports/cash-drawer/page.tsx');

  it('adds cash-only scope copy without changing the route or title', () => {
    expect(page).toContain('title="Cash Drawer Report"');
    expect(page).toContain('Track cash expected and cash counted across all tills and shifts.');
    expect(page).toContain('This report covers physical cash only.');
    expect(page).toContain('MoMo, card, and bank transfer receipts are not included here');
    expect(page).toContain('href="/reports/dashboard"');
    expect(page).toContain('Trading Report');
  });

  it('uses owner-friendly stat labels, helpers, and Difference wording', () => {
    expect(page).toContain('label="Cash expected"');
    expect(page).toContain('What the till should hold based on recorded activity.');
    expect(page).toContain("label={openShiftCount > 0 ? 'Cash counted (closed shifts only)' : 'Cash counted'}");
    expect(page).toContain('Cash physically counted when the shift was closed.');
    expect(page).toContain("label={openShiftCount > 0 ? 'Difference (closed shifts only)' : 'Difference'}");
    expect(page).toContain('Positive = more than expected. Negative = less than expected.');
    expect(page).toContain("tone={totalVariance === 0 ? 'default' : totalVariance > 0 ? 'success' : 'danger'}");
    expect(page).not.toContain("label={openShiftCount > 0 ? 'Variance (closed shifts only)' : 'Variance'}");
  });

  it('makes open-shift guidance explicit without changing the condition', () => {
    expect(page).toContain('{openShiftCount > 0 && (');
    expect(page).toContain("shift{openShiftCount > 1 ? 's' : ''} still open");
    expect(page).toContain('Cash counted and difference are from closed shifts only.');
    expect(page).toContain('Cash expected includes all shifts.');
    expect(page).toContain('Close open shifts');
  });

  it('renames the movement section and explains negative amounts without changing service labels', () => {
    expect(page).toContain('How cash moved through the drawer');
    expect(page).toContain('Negative amounts are cash paid out of the drawer');
    expect(page).toContain('CASH_DRAWER_BREAKDOWN_ORDER.map');
    expect(page).toContain('CASH_DRAWER_ENTRY_LABELS[entryType]');
    expect(page).not.toContain('title="Cash movement breakdown"');
    expect(page).not.toContain('min-w-[48rem]');

    const service = readSource('lib/services/cash-drawer.ts');
    expect(service).toContain("PAID_OUT_SUPPLIER: 'Supplier payments'");
    expect(service).toContain("CASH_ADJUSTMENT: 'Cash added / adjustments'");
  });

  it('adds a mobile movement breakdown list without changing the desktop table source', () => {
    expect(page).toContain('className="mt-3 space-y-2 md:hidden"');
    expect(page).toContain('className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"');
    expect(page).toContain('const amount = movementTotals[entryType] ?? 0;');
    expect(page).toContain('<span className="min-w-0 flex-1 text-sm text-slate-700">{CASH_DRAWER_ENTRY_LABELS[entryType]}</span>');
    expect(page).toContain('{formatMoney(amount, business.currency)}');
    expect(page).toContain("amount < 0 ? 'text-rose-700' : 'text-slate-950'");
    expect(page).toContain('No cash movements found in this date range.');
    expect(page).toContain('className="responsive-table-shell -mx-1 hidden px-1 md:block sm:mx-0 sm:px-0"');
    expect(page).toContain('<table className="table mt-3 w-full border-separate border-spacing-y-2">');
  });

  it('updates only display headers in the main shifts table', () => {
    expect(page).toContain('<th className="hidden xl:table-cell">Supplier cash paid out</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Expenses paid out</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Cash added</th>');
    expect(page).toContain('<th>Cash expected</th>');
    expect(page).toContain('<th>Cash counted</th>');
    expect(page).toContain('<th>Difference</th>');
    expect(page).toContain('<th>Manager approval</th>');
    expect(page).toContain("tableClassName=\"table w-full min-w-[56rem] border-separate border-spacing-y-2 xl:min-w-[104rem]\"");
  });

  it('hides movement detail columns below xl while keeping reconciliation columns visible', () => {
    expect(page).toContain('<th className="hidden xl:table-cell">Opening float</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Cash sales</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Customer payments</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Supplier cash paid out</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Expenses paid out</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Refunds</th>');
    expect(page).toContain('<th className="hidden xl:table-cell">Cash added</th>');

    expect(page).toContain('className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.OPEN_FLOAT');
    expect(page).toContain('className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_SALE');
    expect(page).toContain('className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_DEBTOR_PAYMENT');
    expect(page).toContain('className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.PAID_OUT_SUPPLIER');
    expect(page).toContain('className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.PAID_OUT_EXPENSE');
    expect(page).toContain('className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_REFUND');
    expect(page).toContain('className="hidden px-3 py-3 text-sm xl:table-cell">{formatMoney(byType.CASH_ADJUSTMENT');

    expect(page).toContain('<th>Cash expected</th>');
    expect(page).toContain('<th>Cash counted</th>');
    expect(page).toContain('<th>Difference</th>');
    expect(page).toContain('formatMoney(shift.expectedCashPence, business.currency)');
    expect(page).toContain('formatMoney(shift.actualCashPence, business.currency)');
    expect(page).toContain('formatMoney(shift.variance, business.currency)');
    expect(page).toContain('ReportTableEmptyRow colSpan={17}');
  });

  it('updates approval display copy only', () => {
    expect(page).toContain("shift.closeManagerApprovedBy?.name ?? (shift.status === 'OPEN' ? 'Shift open' : '—')");
    expect(page).not.toContain("shift.status === 'OPEN' ? 'Open' : 'N/A'");
  });

  it('keeps export route labels untouched', () => {
    const csv = readSource('app/(protected)/exports/eod-csv/route.ts');
    const pdf = readSource('app/(protected)/exports/eod-pdf/route.ts');

    expect(csv).toContain("header: 'Expected Cash'");
    expect(csv).toContain("header: 'Counted Cash'");
    expect(csv).toContain("header: 'Variance'");
    expect(pdf).toContain("header: 'Expected Cash'");
    expect(pdf).toContain("header: 'Counted Cash'");
    expect(pdf).toContain("header: 'Variance'");
  });

  it('does not add pointer or touch handlers for mobile polish', () => {
    expect(page).not.toContain('onPointerDown');
    expect(page).not.toContain('onTouchStart');
    expect(page).not.toContain('onTouchMove');
    expect(page).not.toContain('onTouchEnd');
  });
});
