import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Supplier list UX
// ---------------------------------------------------------------------------

describe('supplier list — payables filter and status', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/suppliers/page.tsx'), 'utf8');

  it('supports amountOwed search param to filter suppliers with outstanding payables', () => {
    expect(src).toContain("amountOwed === '1'");
    expect(src).toContain('amountOwed=1');
  });

  it('renders an Amount owed only toggle link', () => {
    expect(src).toContain('Amount owed only');
  });

  it('shows last payment and last purchase columns', () => {
    expect(src).toContain('lastPaymentAt');
    expect(src).toContain('lastPurchaseAt');
    expect(src).toContain('Last payment');
    expect(src).toContain('Last purchase');
    expect(src).toContain('No payment yet');
    expect(src).toContain('No purchases');
  });

  it('shows linked product count per supplier', () => {
    expect(src).toContain('linkedProductCount');
    expect(src).toContain('Linked products');
    expect(src).toContain('productCountMap');
  });

  it('shows status badges: Up to date / Amount owed / Over limit', () => {
    expect(src).toContain('Up to date');
    expect(src).toContain('Amount owed');
    expect(src).toContain('Over limit');
  });

  it('renders record payment quick action linking to supplier payments with supplierId', () => {
    expect(src).toContain('/payments/supplier-payments?supplierId=');
    expect(src).toContain('Record payment');
  });

  it('renders the owner-friendly Suppliers page subtitle', () => {
    expect(src).toContain('Track who you buy from, what you owe, and when supplier payments are due.');
    expect(src).not.toContain('Vendors and payables.');
  });

  it('renders the Suppliers stat strip using already-loaded page data', () => {
    expect(src).toContain('SupplierStatCard');
    expect(src).toContain('OperationalMetricCard');
    expect(src).toContain('operational-metric-grid');
    expect(src).toContain('operational-filter-row');
    expect(src).toContain('Total suppliers');
    expect(src).toContain('Suppliers with balance');
    expect(src).toContain('What you owe suppliers');
    expect(src).toContain('totalCount.toLocaleString');
    expect(src).toContain('suppliersWithBalanceCount');
    expect(src).toContain('totalApOutstandingPence');
  });

  it('keeps the add supplier form closed by default', () => {
    expect(src).toContain('<details className="group">');
    expect(src).not.toMatch(/<details[^>]*id="add-supplier"[^>]*open/);
    expect(src).not.toMatch(/<details[^>]*open[^>]*id="add-supplier"/);
  });

  it('matches Customers rhythm by placing search/filter before the add supplier form', () => {
    expect(src.indexOf('{/* Search and filter */}')).toBeLessThan(src.indexOf('{/* Add supplier */}'));
    expect(src.indexOf('SearchFilter placeholder="Search suppliers')).toBeGreaterThan(-1);
    expect(src.indexOf('id="add-supplier"')).toBeGreaterThan(src.indexOf('Amount owed only'));
  });

  it('keeps supplier account and payment routes intact', () => {
    expect(src).toContain('href={`/suppliers/${supplier.id}`}');
    expect(src).toContain('/payments/supplier-payments?supplierId=${supplier.id}');
    expect(src).toContain('Open account');
  });

  it('renders helpful empty-state guidance with an add-supplier action', () => {
    expect(src).toContain('No suppliers yet.');
    expect(src).toContain('Add your first supplier so you can track purchases, payables, and payments in one place.');
    expect(src).toContain('Add first supplier');
    expect(src).toContain("href={isFiltered ? '/suppliers' : '#add-supplier'}");
  });

  it('adds subtle desktop row hover and mobile card tap polish without touch handlers', () => {
    expect(src).toContain('hover:-translate-y-px');
    expect(src).toContain('hover:shadow-card');
    expect(src).toContain('active:scale-[0.98]');
    expect(src).toContain('responsive-table-shell hidden lg:block');
    expect(src).toContain('space-y-3 lg:hidden');
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
  });
});

// ---------------------------------------------------------------------------
// Supplier detail UX
// ---------------------------------------------------------------------------

describe('supplier detail page', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/suppliers/[id]/page.tsx'), 'utf8');

  it('shows status badge: Up to date / Amount owed / Over limit', () => {
    expect(src).toContain('Up to date');
    expect(src).toContain('Amount owed');
    expect(src).toContain('Over limit');
    expect(src).toContain('supplierStatus');
  });

  it('shows owner-friendly account balance labels', () => {
    expect(src).toContain('Supplier account');
    expect(src).toContain('What you owe');
    expect(src).toContain('Amount owed');
    expect(src).toContain('outstanding');
  });

  it('shows last payment in summary cards', () => {
    expect(src).toContain('Last payment');
    expect(src).toContain('lastPaymentAt');
    expect(src).toContain('No payment yet');
  });

  it('shows available credit / remaining threshold', () => {
    expect(src).toContain('availableCredit');
    expect(src).toContain('remaining');
  });

  it('action bar Record payment links to supplier payments with supplierId', () => {
    expect(src).toContain('/payments/supplier-payments?supplierId=');
    expect(src).toContain('Record payment');
  });

  it('keeps supplier statement CSV link available', () => {
    expect(src).toContain('/suppliers/${supplier.id}/statement');
    expect(src).toContain('View statement (CSV)');
    expect(src).toContain('Download CSV');
  });

  it('action bar Create purchase links to purchases with supplierId', () => {
    expect(src).toContain('/purchases?supplierId=');
    expect(src).toContain('Create purchase');
  });

  it('keeps account details edit form present but collapsed by default', () => {
    expect(src).toContain('id="account-details"');
    expect(src).toContain('Account details');
    expect(src).toContain('action={updateSupplierAction}');
    expect(src).toContain('name="creditLimit"');
    expect(src).not.toMatch(/<details[^>]*id="account-details"[^>]*open/);
    expect(src).not.toMatch(/<details[^>]*open[^>]*id="account-details"/);
  });

  it('all invoice Pay links include supplierId param', () => {
    const payLinks = [...src.matchAll(/supplier-payments\?supplierId=/g)];
    expect(payLinks.length).toBeGreaterThan(2);
  });

  it('renders products supplied section when linked products exist', () => {
    expect(src).toContain('Products supplied');
    expect(src).toContain('linkedProducts');
    expect(src).toContain('preferredSupplierId');
    expect(src).toContain('products-supplied');
  });

  it('shows stock and cost in the products supplied section', () => {
    expect(src).toContain('Current stock');
    expect(src).toContain('Default cost');
    expect(src).toContain('inventoryBalances');
    expect(src).toContain('defaultCostBasePence');
  });

  it('uses owner-friendly statement column labels', () => {
    expect(src).toContain('>Purchase<');
    expect(src).toContain('>Payment<');
    expect(src).toContain('>Balance<');
  });

  it('adds helpful supplier activity empty states and subtle table polish', () => {
    expect(src).toContain('Purchases and payment history');
    expect(src).toContain('No purchases yet.');
    expect(src).toContain('When you record purchases from this supplier, unpaid items will appear here.');
    expect(src).toContain('No payments recorded yet.');
    expect(src).toContain('Payments will appear here once recorded.');
    expect(src).toContain('hover:-translate-y-px');
    expect(src).toContain('hover:shadow-card');
    expect(src).toContain('active:scale-[0.98]');
  });

  it('does not add pointer or touch handlers to supplier detail polish', () => {
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
  });

  it('uses stable sortKey tie-breaker in statement', () => {
    expect(src).toContain('sortKey');
    expect(src).toContain('sortKey - b.sortKey');
  });
});

// ---------------------------------------------------------------------------
// Supplier payments page
// ---------------------------------------------------------------------------

describe('supplier payments page — supplierId support', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/payments/supplier-payments/page.tsx'), 'utf8');

  it('reads supplierId from searchParams', () => {
    expect(src).toContain('supplierId');
    expect(src).toContain("searchParams?.supplierId");
  });

  it('filters invoices by supplierId when param is present', () => {
    expect(src).toContain('supplierId ? { supplierId }');
  });

  it('fetches linked supplier info when supplierId is present', () => {
    expect(src).toContain('linkedSupplier');
  });

  it('shows supplier account context with owner-friendly balance wording', () => {
    expect(src).toContain('Supplier account');
    expect(src).toContain('What you owe');
    expect(src).toContain('Last payment');
  });

  it('provides a back link to the supplier account', () => {
    expect(src).toContain('Back to supplier account');
    expect(src).toContain('/suppliers/${linkedSupplier.id}');
  });

  it('returns to the supplier profile after recording a filtered payment', () => {
    expect(src).toContain('name="returnTo"');
    expect(src).toContain('value={`/suppliers/${linkedSupplier.id}`}');
  });

  it('uses owner-friendly page title and subtitle', () => {
    expect(src).toContain('Record supplier payment');
    expect(src).toContain('Pay a supplier and reduce what your business owes.');
  });

  it('renders unpaid purchases with aligned desktop and mobile payment layouts', () => {
    expect(src).toContain('Unpaid purchases');
    expect(src).toContain('Choose an unpaid purchase and record the amount paid.');
    expect(src).toContain('>Purchase<');
    expect(src).toContain('>What you owe<');
    expect(src).toContain('mode="cards"');
    expect(src).toContain('active:scale-[0.98]');
    expect(src).toContain('hover:-translate-y-px');
    expect(src).toContain('action={recordSupplierPaymentAction}');
    expect(src).toContain('name="invoiceId"');
    expect(src).toContain('name="paymentMethod"');
    expect(src).toContain('name="amount"');
    expect(src).toContain('name="paidAt"');
    expect(src).toContain('name="notes"');
  });

  it('keeps recent supplier payments visible with a helpful empty state', () => {
    expect(src).toContain('Recent supplier payments');
    expect(src).toContain('No supplier payments recorded yet.');
    expect(src).toContain('Payments to suppliers will appear here once recorded.');
    expect(src).toContain('recordedBy');
  });

  it('does not add pointer or touch handlers to supplier payments polish', () => {
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
  });
});

// ---------------------------------------------------------------------------
// Supplier purchase preselection
// ---------------------------------------------------------------------------

describe('supplier profile to purchase integration', () => {
  const purchasesPageSrc = readFileSync(join(process.cwd(), 'app/(protected)/purchases/page.tsx'), 'utf8');
  const purchaseFormSrc = readFileSync(join(process.cwd(), 'app/(protected)/purchases/PurchaseFormClient.tsx'), 'utf8');

  it('accepts supplierId on the purchases page', () => {
    expect(purchasesPageSrc).toContain('supplierId?: string');
  });

  it('preselects the supplierId URL param in the purchase form when valid', () => {
    expect(purchaseFormSrc).toContain("searchParams?.get('supplierId')");
    expect(purchaseFormSrc).toContain('validRequestedSupplierId');
    expect(purchaseFormSrc).toContain('setSupplierId(validRequestedSupplierId');
  });
});
