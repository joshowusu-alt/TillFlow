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

  it('renders the owner-friendly Customers page subtitle', () => {
    expect(src).toContain('Track what your customers owe you, set credit limits, and record payments.');
    expect(src).not.toContain('Credit accounts, balances, and contact details.');
  });

  it('renders the Customers stat strip using already-loaded page data', () => {
    expect(src).toContain('CustomerStatCard');
    expect(src).toContain('Total customers');
    expect(src).toContain('Customers with balance');
    expect(src).toContain('What customers owe');
    expect(src).toContain('totalCount.toLocaleString');
    expect(src).toContain('customersWithBalanceCount');
    expect(src).toContain('totalArOutstandingPence');
  });

  it('keeps the add customer form closed by default', () => {
    expect(src).toContain('<details className="group">');
    expect(src).not.toMatch(/<details[^>]*id="add-customer"[^>]*open/);
    expect(src).not.toMatch(/<details[^>]*open[^>]*id="add-customer"/);
  });

  it('keeps customer account and payment routes intact', () => {
    expect(src).toContain('href={`/customers/${customer.id}`}');
    expect(src).toContain('/payments/customer-receipts?customerId=${customer.id}');
    expect(src).toContain('Open account');
  });

  it('renders helpful empty-state guidance with an add-customer action', () => {
    expect(src).toContain('No customers yet.');
    expect(src).toContain('Add your first customer account so you can track balances, credit limits, and payments in one place.');
    expect(src).toContain('Add first customer');
    expect(src).toContain("href={isFiltered ? '/customers' : '#add-customer'}");
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

  it('shows owner-friendly account balance labels', () => {
    expect(src).toContain('Customer account');
    expect(src).toContain('What they owe');
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

  it('keeps customer statement CSV link available', () => {
    expect(src).toContain('/customers/${customer.id}/statement');
    expect(src).toContain('View statement (CSV)');
    expect(src).toContain('Download CSV');
  });

  it('action bar links Create sale to POS with this customer selected', () => {
    expect(src).toContain('/pos?customerId=');
    expect(src).toContain('Create sale');
  });

  it('keeps account details edit form present but collapsed by default', () => {
    expect(src).toContain('id="account-details"');
    expect(src).toContain('Account details');
    expect(src).toContain('action={updateCustomerAction}');
    expect(src).toContain('name="creditLimit"');
    expect(src).not.toMatch(/<details[^>]*id="account-details"[^>]*open/);
    expect(src).not.toMatch(/<details[^>]*open[^>]*id="account-details"/);
  });

  it('adds helpful customer activity empty states and subtle table polish', () => {
    expect(src).toContain('Sales and payment history');
    expect(src).toContain('No invoices yet.');
    expect(src).toContain('When this customer buys on credit, their unpaid invoices will appear here.');
    expect(src).toContain('No payments recorded yet.');
    expect(src).toContain('Payments will appear here once recorded.');
    expect(src).toContain('hover:-translate-y-px');
    expect(src).toContain('hover:shadow-card');
  });

  it('does not add pointer or touch handlers to customer detail polish', () => {
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
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

  it('shows customer account context with owner-friendly balance wording', () => {
    expect(src).toContain('Customer account');
    expect(src).toContain('What they owe');
    expect(src).toContain('Balance due');
  });

  it('provides a back link to the customer account', () => {
    expect(src).toContain('Back to customer account');
    expect(src).toContain('/customers/${linkedCustomer.id}');
  });

  it('returns to the customer profile after recording a filtered payment', () => {
    expect(src).toContain('name="returnTo"');
    expect(src).toContain('value={`/customers/${linkedCustomer.id}`}');
  });

  it('uses owner-friendly page title', () => {
    expect(src).toContain('Record customer payment');
    expect(src).toContain('Take a payment from a customer and reduce what they owe.');
  });

  it('renders unpaid invoices with desktop and mobile payment layouts', () => {
    expect(src).toContain('Unpaid invoices');
    expect(src).toContain('Choose an unpaid invoice and record the amount received.');
    expect(src).toContain('ResponsiveDataTable');
    expect(src).toContain('mode="cards"');
    expect(src).toContain('active:scale-[0.98]');
    expect(src).toContain('hover:-translate-y-px');
    expect(src).toContain('action={recordCustomerPaymentAction}');
    expect(src).toContain('name="invoiceId"');
    expect(src).toContain('name="paymentMethod"');
    expect(src).toContain('name="amount"');
  });

  it('adds recent customer payments using a lightweight scoped query', () => {
    expect(src).toContain('recentPayments');
    expect(src).toContain('prisma.salesPayment.findMany');
    expect(src).toContain('businessId: business.id');
    expect(src).toContain('...(customerId ? { customerId } : {})');
    expect(src).toContain('take: 20');
    expect(src).toContain('Recent customer payments');
  });

  it('renders helpful payment empty states without touch handlers', () => {
    expect(src).toContain('No unpaid invoices for this customer.');
    expect(src).toContain('When this customer buys on credit, unpaid invoices will appear here.');
    expect(src).toContain('No payments recorded yet.');
    expect(src).toContain('Customer payments will appear here once recorded.');
    expect(src).not.toContain('onPointerDown');
    expect(src).not.toContain('onTouchStart');
    expect(src).not.toContain('onTouchMove');
  });
});

// ---------------------------------------------------------------------------
// Customer sale preselection
// ---------------------------------------------------------------------------

describe('customer profile to POS integration', () => {
  const posPageSrc =
    readFileSync(join(process.cwd(), 'app/(protected)/pos/page.tsx'), 'utf8') +
    '\n' +
    readFileSync(join(process.cwd(), 'app/(protected)/pos/PosBoard.tsx'), 'utf8') +
    '\n' +
    readFileSync(join(process.cwd(), 'app/(protected)/pos/PosDeferredSection.tsx'), 'utf8');
  const posClientSrc = readFileSync(join(process.cwd(), 'app/(protected)/pos/PosClient.tsx'), 'utf8');

  it('loads a customer requested by customerId even when not in the cached POS list', () => {
    expect(posPageSrc).toContain('searchParams?: { customerId?: string }');
    expect(posPageSrc).toContain('requestedCustomerId');
    expect(posPageSrc).toContain('requestedCustomer');
    expect(posPageSrc).toContain('withRequested');
  });

  it('selects the customerId URL param in POS when valid', () => {
    expect(posClientSrc).toContain("searchParams?.get('customerId')");
    expect(posClientSrc).toContain('customerExists(urlCustomerId)');
    expect(posClientSrc).toContain('setCustomerId(urlCustomerId)');
  });
});
