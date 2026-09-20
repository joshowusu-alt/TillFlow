import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('authoritative operational store surfaces', () => {
  it('makes the header the branch switcher and stops using first-store lookup', () => {
    const layout = read('app/(protected)/layout.tsx');
    const topNav = read('components/TopNav.tsx');
    const auth = read('lib/auth.ts');
    expect(layout).toContain('storeId={store?.id ?? null}');
    expect(layout).toContain('stores={stores.map');
    expect(topNav).toContain('OperationalStoreSwitcher');
    expect(topNav).toContain('withOperationalStoreQuery');
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain('action={switchOperationalStoreAction}');
    expect(read('components/OperationalStoreSwitcher.tsx')).not.toContain('startTransition');
    expect(auth).toContain('resolveOperationalStore');
    expect(auth).toContain('_getStores');
    expect(read('lib/reliability/operational-store.ts')).not.toContain("from 'next/headers'");
  });

  it('keeps shift, expense, purchase, stock and supplier-payment pages on the cookie store', () => {
    expect(read('app/(protected)/shifts/page.tsx')).toContain('requireBusinessAndOptionalStore');
    expect(read('app/(protected)/expenses/page.tsx')).toContain('operationalStore');
    expect(read('app/(protected)/purchases/page.tsx')).toContain('operationalStore');
    expect(read('app/(protected)/inventory/adjustments/page.tsx')).toContain('operationalStore');
    expect(read('app/(protected)/payments/supplier-payments/page.tsx')).toContain('storeId: store.id');
    expect(read('app/(protected)/payments/customer-receipts/page.tsx')).toContain('storeId: store.id');
    expect(read('app/(protected)/pos/page.tsx')).toContain('SelectOperationalStoreNotice');
    expect(read('app/(protected)/pos/page.tsx')).toContain('EffectiveStoreBanner');
    expect(read('app/(protected)/layout.tsx')).toContain('StaleOperationalStoreGuard');
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain('publishOperationalStoreSignal');
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain('data-switching-operational-store');
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain('Wait until this branch is active');
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain('aria-modal="true"');
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain("document.addEventListener('click', block, true)");
    expect(read('components/OperationalStoreSwitcher.tsx')).not.toContain('12_000');
    expect(read('components/OperationalStoreSwitcher.tsx')).not.toContain('setPending(null)');
  });

  it('hides internal purchase ids on supplier payments', () => {
    const page = read('app/(protected)/payments/supplier-payments/page.tsx');
    expect(page).toContain("formatRecordNumber('purchase'");
    expect(page).not.toContain('invoice.id.slice(0, 8)');
    expect(page).toContain('SupplierPaymentDialog');
  });

  it('hides internal invoice ids on customer receipts', () => {
    const page = read('app/(protected)/payments/customer-receipts/page.tsx');
    expect(page).toContain("formatRecordNumber('invoice'");
    expect(page).not.toContain('invoice.id.slice(0, 8)');
    expect(page).toContain('EffectiveStoreBanner');
  });

  it('rejects mismatched till/store on supplier payment', () => {
    const payments = read('app/actions/payments.ts');
    expect(payments).toContain('resolveStoreFromTill');
    expect(payments).toContain('MISSING_STORE_CONTEXT_MSG');
  });
});
