import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Customer list UX
// ---------------------------------------------------------------------------

describe('customer list — debtor filter and status', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/customers/page.tsx'), 'utf8');

  it('supports balanceDue search param to filter customers with outstanding balance', () => {
    expect(src).toContain("balanceDue === '1'");
    expect(src).toContain('balanceDue: balanceDue || undefined');
  });

  it('renders a Balance due only toggle link', () => {
    expect(src).toContain('Balance due only');
    expect(src).toContain('balanceDue=1');
  });

  it('shows last payment column in desktop table', () => {
    expect(src).toContain('Last payment');
    expect(src).toContain('lastPaymentAt');
    expect(src).toContain('No payment yet');
  });

  it('shows credit status badges', () => {
    expect(src).toContain('Over limit');
    expect(src).toContain('Balance due');
    expect(src).toContain('Up to date');
  });

  it('renders record payment quick action linking to customer receipts page', () => {
    expect(src).toContain('/payments/customer-receipts?customerId=');
    expect(src).toContain('Record payment');
  });
});

// ---------------------------------------------------------------------------
// Customer service — balanceDue filter + lastPaymentAt
// ---------------------------------------------------------------------------

describe('customer service — getCustomers options', () => {
  const src = readFileSync(join(process.cwd(), 'lib/services/customers.ts'), 'utf8');

  it('exports balanceDue option in CustomerListOptions', () => {
    expect(src).toContain('balanceDue?: boolean');
  });

  it('applies balanceDue filter in the Prisma where clause', () => {
    expect(src).toContain("paymentStatus: { in: ['UNPAID', 'PART_PAID'");
    expect(src).toContain('salesInvoices: { some');
  });

  it('batch-loads last payment date per customer', () => {
    expect(src).toContain('recentCustomerPayments');
    expect(src).toContain('lastPaymentMap');
    expect(src).toContain('lastPaymentAt');
  });

  it('returns lastPaymentAt on each customer object', () => {
    expect(src).toContain('lastPaymentAt: lastPaymentMap.get(c.id) ?? null');
  });
});

// ---------------------------------------------------------------------------
// Customer detail UX
// ---------------------------------------------------------------------------

describe('customer detail page', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/customers/[id]/page.tsx'), 'utf8');

  it('shows status badge: Up to date / Balance due / Over limit', () => {
    expect(src).toContain('Up to date');
    expect(src).toContain('Balance due');
    expect(src).toContain('Over limit');
    expect(src).toContain('creditStatus');
  });

  it('shows Balance due summary card', () => {
    expect(src).toContain('Balance due');
    expect(src).toContain('outstanding');
  });

  it('shows last payment in summary cards', () => {
    expect(src).toContain('Last payment');
    expect(src).toContain('lastPaymentAt');
    expect(src).toContain('No payment yet');
  });

  it('shows available credit or over-limit amount', () => {
    expect(src).toContain('availableCredit');
    expect(src).toContain('available');
    expect(src).toContain('over');
  });

  it('action bar has Record payment linking to customer receipts', () => {
    expect(src).toContain('/payments/customer-receipts?customerId=');
    expect(src).toContain('Record payment');
  });

  it('uses owner-friendly statement column headers', () => {
    expect(src).toContain('>Invoice<');
    expect(src).toContain('>Payment<');
    expect(src).toContain('>Balance<');
  });

  it('uses stable sortKey tie-breaker in statement', () => {
    expect(src).toContain('sortKey');
    expect(src).toContain('sortKey - b.sortKey');
  });
});

// ---------------------------------------------------------------------------
// Customer receipts page
// ---------------------------------------------------------------------------

describe('customer receipts page', () => {
  const src = readFileSync(join(process.cwd(), 'app/(protected)/payments/customer-receipts/page.tsx'), 'utf8');

  it('fetches customer info when customerId param is present', () => {
    expect(src).toContain('linkedCustomer');
    expect(src).toContain('customerId');
  });

  it('shows customer summary header with name, phone, outstanding', () => {
    expect(src).toContain('Collecting payment from');
    expect(src).toContain('Total outstanding');
  });

  it('provides a back link to the customer profile', () => {
    expect(src).toContain('← Back to customer profile');
    expect(src).toContain('/customers/${linkedCustomer.id}');
  });

  it('uses owner-friendly page title', () => {
    expect(src).toContain('Record customer payment');
  });
});
