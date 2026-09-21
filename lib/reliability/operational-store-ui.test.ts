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
    // With JS the submit goes through the result action so a failed POST stays
    // in the dialog (Retry keeps the intended branch) instead of the error boundary.
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain('switchOperationalStoreResultAction(formData)');
    expect(read('app/actions/operational-store.ts')).toContain('export async function switchOperationalStoreResultAction');
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
    // No timer-based fail-open: the dialog clears only when the authoritative branch equals the intended one.
    expect(read('components/OperationalStoreSwitcher.tsx')).not.toContain('setPending(null)');
    expect(read('components/OperationalStoreSwitcher.tsx')).not.toMatch(/setTimeout\([^)]*setPending/);
    expect(read('components/OperationalStoreSwitcher.tsx')).toContain('selectedStoreId === pending.id');
  });

  it('keeps the header on the authoritative branch until the cookie lands', () => {
    const switcher = read('components/OperationalStoreSwitcher.tsx');
    // Controlled by the server-rendered branch, not the just-clicked option.
    expect(switcher).toContain("value={selectedStoreId ?? ''}");
    expect(switcher).not.toContain('defaultValue={selectedStoreId');
    // The select itself is not the submitted field; the intended branch is.
    expect(switcher).not.toMatch(/<select[^>]*name="storeId"/);
    expect(switcher).toContain('name="storeId" value={pending?.id ?? selectedStoreId ?? \'\'}');
    // The submit happens after the pending branch has rendered into the hidden field.
    expect(switcher).not.toContain('event.currentTarget.form?.requestSubmit()');
    expect(switcher).toMatch(/if \(!pending\) return undefined;[\s\S]{0,300}formRef\.current\?\.requestSubmit\(\);/);
    // Empty-cookie tabs are covered by the stale guard once another tab switches.
    expect(read('components/StaleOperationalStoreGuard.tsx')).toContain('isStaleOperationalStore(storeId, signal, loadedAt)');
  });

  it('never pre-selects the inventory-loss account on the expense form', () => {
    const form = read('app/(protected)/expenses/ExpenseForm.tsx');
    expect(form).toContain('defaultExpenseAccountId(accounts)');
    expect(form).not.toContain('useState(accounts[0]?.id');
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
