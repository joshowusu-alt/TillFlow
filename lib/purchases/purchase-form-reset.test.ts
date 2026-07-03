import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Purchase form reset after completion', () => {
  it('clears local draft storage helper is shared', () => {
    const draft = read('lib/purchases/purchase-draft.ts');

    expect(draft).toContain('getPurchaseDraftStorageKey');
    expect(draft).toContain('clearPurchaseDraft');
    expect(draft).toContain('tillflow:purchase-draft:');
  });

  it('purchase invoice page clears draft after successful creation', () => {
    const detailPage = read('app/(protected)/purchases/[id]/page.tsx');
    const clearer = read('components/purchases/PurchaseDraftClearer.tsx');

    expect(detailPage).toContain('PurchaseDraftClearer');
    expect(detailPage).toContain("active={searchParams?.created === '1'}");
    expect(clearer).toContain('clearPurchaseDraft(storeId)');
  });

  it('purchase form resets fields when returning with created flag', () => {
    const form = read('app/(protected)/purchases/PurchaseFormClient.tsx');

    expect(form).toContain('resetPurchaseForm');
    expect(form).toContain("searchParams?.get('created')");
    expect(form).toContain('resetPurchaseForm();');
    expect(form).toContain('setCart([])');
    expect(form).toContain("setSupplierId('')");
    expect(form).toContain("setPaymentStatus('PAID')");
  });

  it('incomplete purchase drafts still persist in localStorage', () => {
    const form = read('app/(protected)/purchases/PurchaseFormClient.tsx');

    expect(form).toContain('Draft restored');
    expect(form).toContain('window.localStorage.setItem(draftStorageKey');
    expect(form).toContain('hasDraft');
  });

  it('createPurchaseAction redirect and accounting paths remain unchanged', () => {
    const purchases = read('app/actions/purchases.ts');

    expect(purchases).toContain('await createPurchase({');
    expect(purchases).toContain('redirect(`/purchases/${invoice.id}?${params.toString()}`)');
    expect(purchases).not.toContain('revalidatePath(`/purchases`');
  });
});
