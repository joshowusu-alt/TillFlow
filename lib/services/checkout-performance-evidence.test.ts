import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function createSaleImplSource() {
  const source = read('lib/services/sales.ts');
  return source.slice(
    source.indexOf('async function createSaleImpl'),
    source.indexOf('// Amend Sale'),
  );
}

describe('Phase C5: checkout performance evidence instrumentation', () => {
  it('keeps checkout total timing and adds stable checkout sub-stage operation names', () => {
    const sales = read('lib/services/sales.ts');
    const actions = read('app/actions/sales.ts');
    const combined = `${sales}\n${actions}`;

    [
      'action.checkout.create-sale',
      'action.checkout.validate',
      'action.checkout.context',
      'action.checkout.cart-pricing',
      'action.checkout.transaction.total',
      'action.checkout.credit-customer',
      'action.checkout.sequence',
      'action.checkout.invoice-create',
      'action.checkout.inventory-update',
      'action.checkout.journal-post',
      'action.checkout.shift-update',
      'action.checkout.stock-movements',
      'action.checkout.audit-log',
      'action.checkout.revalidate',
    ].forEach((operation) => expect(combined).toContain(operation));
  });

  it('keeps createSale and completeSaleAction signatures unchanged', () => {
    expect(read('lib/services/sales.ts')).toContain('export async function createSale(input: CreateSaleInput)');
    expect(read('lib/services/sales.ts')).toContain('async function createSaleImpl(input: CreateSaleInput)');
    expect(read('app/actions/sales.ts')).toContain('export async function completeSaleAction(data: {');
    expect(read('app/actions/sales.ts')).toContain(
      "): Promise<ActionResult<{ receiptId: string; totalPence: number; transactionNumber: string | null }>>",
    );
  });

  it('keeps the checkout transaction as a single transaction boundary', () => {
    const impl = createSaleImplSource();
    expect((impl.match(/prisma\.\$transaction\(/g) ?? []).length).toBe(1);
    expect(impl).toContain("{ maxWait: 10000, timeout: 15000 }");
    expect(impl).toContain('action.checkout.transaction.total');
  });

  it('uses safe checkout metadata fields instead of sensitive customer, product, or payment details', () => {
    const sales = read('lib/services/sales.ts');
    const metadataHelper = sales.slice(
      sales.indexOf('function checkoutPerformanceMetadata'),
      sales.indexOf('function measureCheckoutStage'),
    );
    const actions = read('app/actions/sales.ts');
    const actionMetadataHelper = actions.slice(
      actions.indexOf('function checkoutActionTimingMetadata'),
      actions.indexOf('export async function createSaleAction'),
    );
    const metadataSource = `${metadataHelper}\n${actionMetadataHelper}`;

    [
      'cartLineCount',
      'distinctProductCount',
      'paymentMethodCount',
      'hasCredit',
      'hasCustomerId',
      'hasCashPayment',
      'hasCardPayment',
      'hasBankTransferPayment',
      'hasMobileMoneyPayment',
      'hasDiscount',
      'isOfflineSubmission',
      'duplicateCheckPerformed',
    ].forEach((field) => expect(metadataSource).toContain(field));

    expect(metadataSource).not.toMatch(/customerName|customerPhone|customerEmail|productName|sku|barcode/i);
    expect(metadataSource).not.toMatch(/paymentReference|momoRef|payerMsisdn|providerReference/i);
    expect(metadataSource).not.toMatch(/formData|requestBody|raw/i);
  });

  it('keeps checkout instrumentation out of item mapping callbacks and avoids raw line metadata', () => {
    const impl = createSaleImplSource();
    const lineCreateMap = impl.slice(
      impl.indexOf('lines: {'),
      impl.indexOf('payments: {'),
    );
    const stockMovementMap = impl.slice(
      impl.indexOf("action.checkout.stock-movements"),
      impl.indexOf('// Fire-and-forget: risk detection'),
    );

    expect(lineCreateMap).not.toContain('measureCheckoutStage');
    expect(stockMovementMap).toContain('rowCount: lineDetails.length');
    expect(stockMovementMap).not.toContain('productName');
  });

  it('keeps schemas, providers, migrations, routes, exports, and POS UI untouched by this evidence pass', () => {
    expect(read('prisma/schema.prisma')).toMatch(/provider\s+=\s+"sqlite"/);
    expect(read('prisma/schema.postgres.prisma')).toMatch(/provider\s+=\s+"postgresql"/);
    expect(read('prisma/migrations/migration_lock.toml')).toMatch(/provider\s+=\s+"postgresql"/);
    expect(readdirSync(join(process.cwd(), 'prisma/migrations')).length).toBeGreaterThan(0);
    expect(read('app/(protected)/pos/page.tsx')).not.toContain('action.checkout.');
  });

  it('keeps observability allowlist limited to checkout-safe counts and booleans', () => {
    const observability = read('lib/observability.ts');

    [
      'cartLineCount',
      'distinctProductCount',
      'paymentMethodCount',
      'hasCredit',
      'hasCustomerId',
      'hasCashPayment',
      'hasCardPayment',
      'hasBankTransferPayment',
      'hasMobileMoneyPayment',
      'hasDiscount',
      'isOfflineSubmission',
      'duplicateCheckPerformed',
      'stage',
    ].forEach((field) => expect(observability).toContain(`'${field}'`));

    expect(observability).not.toContain("'customerName'");
    expect(observability).not.toContain("'productName'");
    expect(observability).not.toContain("'paymentReference'");
  });
});
