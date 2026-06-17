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

  it('shows Amount owed summary card', () => {
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

  it('action bar Create purchase links to purchases with supplierId', () => {
    expect(src).toContain('/purchases?supplierId=');
    expect(src).toContain('Create purchase');
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

  it('shows supplier summary header with name, outstanding, and last payment', () => {
    expect(src).toContain('Recording payment to');
    expect(src).toContain('Total outstanding');
    expect(src).toContain('Last payment');
  });

  it('provides a back link to the supplier profile', () => {
    expect(src).toContain('← Back to supplier profile');
    expect(src).toContain('/suppliers/${linkedSupplier.id}');
  });

  it('returns to the supplier profile after recording a filtered payment', () => {
    expect(src).toContain('name="returnTo"');
    expect(src).toContain('value={`/suppliers/${linkedSupplier.id}`}');
  });

  it('uses owner-friendly page title', () => {
    expect(src).toContain('Record payment to supplier');
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
