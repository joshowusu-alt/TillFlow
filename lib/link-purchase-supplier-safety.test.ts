import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const formSrc = readFileSync(
  path.join(process.cwd(), 'components/LinkPurchaseSupplierForm.tsx'),
  'utf8'
);
const actionSrc = readFileSync(
  path.join(process.cwd(), 'app/actions/purchases.ts'),
  'utf8'
);

describe('LinkPurchaseSupplierForm selection safety', () => {
  it('does not default to the first supplier id', () => {
    expect(formSrc).not.toMatch(/useState\(suppliers\[0\]/);
    expect(formSrc).toMatch(/useState\(''\)/);
    expect(formSrc).toContain('Select a supplier');
  });

  it('keeps Link supplier disabled until a deliberate choice', () => {
    expect(formSrc).toContain('disabled={isPending || !canSubmit}');
    expect(formSrc).toContain("mode === 'existing'");
    expect(formSrc).toContain('Create a new supplier');
  });

  it('requires confirmation with supplier, reference and outstanding amount', () => {
    expect(formSrc).toContain('window.confirm');
    expect(formSrc).toContain('Link ${resolvedSupplierName} to purchase ${purchaseReference}');
    expect(formSrc).toContain('Outstanding:');
  });

  it('shows purchase item summary context', () => {
    expect(formSrc).toContain('itemSummary');
    expect(formSrc).toContain('Items:');
  });

  it('blocks duplicate new-supplier creation in the UI', () => {
    expect(formSrc).toContain('duplicateMatch');
    expect(formSrc).toContain('already exists');
  });
});

describe('linkPurchaseSupplierAction safety', () => {
  it('rejects both existing and new supplier together', () => {
    expect(actionSrc).toContain(
      'Choose either an existing supplier or a new supplier name, not both.'
    );
  });

  it('refuses to overwrite an already-linked purchase', () => {
    expect(actionSrc).toContain('This purchase already has a supplier.');
    expect(actionSrc).toContain('supplierId: null');
  });

  it('rejects voided or cancelled purchases', () => {
    expect(actionSrc).toContain("['VOID', 'CANCELLED', 'RETURNED']");
  });

  it('detects duplicate supplier names before create', () => {
    expect(actionSrc).toContain('already exists. Select the existing supplier');
  });

  it('audits previous and new supplier values', () => {
    expect(actionSrc).toContain('previousSupplierId');
    expect(actionSrc).toContain('newSupplierId');
    expect(actionSrc).toContain('newSupplierValue');
  });
});

describe('linkPurchaseSupplierAction behaviour', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects conflicting existing+new input', async () => {
    vi.doMock('@/lib/action-utils', async () => {
      const actual = await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils');
      return {
        ...actual,
        withBusinessContext: vi.fn(async () => ({
          user: { id: 'u1', name: 'Owner', role: 'OWNER' },
          businessId: 'b1',
        })),
      };
    });
    vi.doMock('@/lib/prisma', () => ({ prisma: {} }));
    vi.doMock('@/lib/services/suppliers', () => ({ createSupplier: vi.fn() }));
    vi.doMock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
    vi.doMock('@/lib/reports/cache-revalidation', () => ({
      revalidateOwnerDashboardCache: vi.fn(),
    }));
    vi.doMock('@/lib/improve-records-revalidate', () => ({
      revalidateImproveRecordsHome: vi.fn(),
    }));
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
      revalidateTag: vi.fn(),
    }));

    const { linkPurchaseSupplierAction } = await import('@/app/actions/purchases');
    const formData = new FormData();
    formData.set('purchaseInvoiceId', 'p1');
    formData.set('supplierId', 's1');
    formData.set('newSupplierName', 'ABIGAIL');
    const result = await linkPurchaseSupplierAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/either an existing supplier or a new supplier/i);
    }
  });

  it('rejects blank new supplier names', async () => {
    vi.doMock('@/lib/action-utils', async () => {
      const actual = await vi.importActual<typeof import('@/lib/action-utils')>('@/lib/action-utils');
      return {
        ...actual,
        withBusinessContext: vi.fn(async () => ({
          user: { id: 'u1', name: 'Owner', role: 'OWNER' },
          businessId: 'b1',
        })),
      };
    });
    vi.doMock('@/lib/prisma', () => ({ prisma: {} }));
    vi.doMock('@/lib/services/suppliers', () => ({ createSupplier: vi.fn() }));
    vi.doMock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
    vi.doMock('@/lib/reports/cache-revalidation', () => ({
      revalidateOwnerDashboardCache: vi.fn(),
    }));
    vi.doMock('@/lib/improve-records-revalidate', () => ({
      revalidateImproveRecordsHome: vi.fn(),
    }));
    vi.doMock('next/cache', () => ({
      revalidatePath: vi.fn(),
      revalidateTag: vi.fn(),
    }));

    const { linkPurchaseSupplierAction } = await import('@/app/actions/purchases');
    const formData = new FormData();
    formData.set('purchaseInvoiceId', 'p1');
    formData.set('newSupplierName', '   ');
    const result = await linkPurchaseSupplierAction(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/select a supplier|enter a new name|valid supplier name/i);
    }
  });
});
