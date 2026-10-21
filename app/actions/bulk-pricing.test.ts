import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context: vi.fn(), preview: vi.fn(), apply: vi.fn(), cache: vi.fn(), path: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({ withBusinessContext: m.context, ok: (data: unknown) => ({ success: true, data }), UserError: class extends Error {}, safeAction: async (fn: () => unknown) => fn() }));
vi.mock('@/lib/services/bulk-pricing', () => ({ previewBulkPricing: m.preview, applyBulkPricing: m.apply }));
vi.mock('@/lib/cache/pos-tags', () => ({ revalidatePosCatalog: m.cache }));
vi.mock('next/cache', () => ({ revalidatePath: m.path }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
import { previewBulkPricingAction, applyBulkPricingAction, submitBulkPricingAction } from './bulk-pricing';
beforeEach(() => { vi.clearAllMocks(); m.context.mockResolvedValue({ businessId: 'authenticated', user: { id: 'owner', name: 'Owner', role: 'OWNER' } }); m.apply.mockResolvedValue({ updated: 1 }); });
it('checks roles on preview and enforces the billing write gate again on apply', async () => {
  await previewBulkPricingAction({}); expect(m.context).toHaveBeenLastCalledWith(['OWNER', 'MANAGER'], { requireWrite: false });
  expect(m.preview).toHaveBeenCalledWith('authenticated', {});
  const request = { input: {}, fingerprint: 'fp', selectedIds: ['product'], acknowledgeWarnings: false, reason: 'Change' };
  await applyBulkPricingAction(request);
  expect(m.context).toHaveBeenLastCalledWith(['OWNER', 'MANAGER']);
  expect(m.apply).toHaveBeenCalledWith({ businessId: 'authenticated', id: 'owner', name: 'Owner', role: 'OWNER' }, request);
  expect(m.cache).toHaveBeenCalledWith('authenticated'); expect(m.path).toHaveBeenCalledWith('/products/[id]', 'page');
});
it('does not write or invalidate caches when authentication or billing denies the action', async () => {
  m.context.mockRejectedValue(new Error('read-only'));
  await expect(applyBulkPricingAction({ input: {}, fingerprint: '', selectedIds: [], acknowledgeWarnings: false, reason: '' })).rejects.toThrow('read-only');
  expect(m.apply).not.toHaveBeenCalled(); expect(m.cache).not.toHaveBeenCalled();
});
it('navigates to the committed batch receipt only after successful apply', async () => {
  m.apply.mockResolvedValue({ updated: 2, batchId: 'saved-batch' });
  await submitBulkPricingAction({ input: {}, fingerprint: 'fp', selectedIds: ['p1', 'p2'], acknowledgeWarnings: false, reason: 'Reviewed' });
  expect(m.redirect).toHaveBeenCalledWith('/products/bulk-pricing?batch=saved-batch');
  m.redirect.mockClear(); m.apply.mockRejectedValue(new Error('write failed'));
  await expect(submitBulkPricingAction({ input: {}, fingerprint: '', selectedIds: [], acknowledgeWarnings: false, reason: '' })).rejects.toThrow('write failed');
  expect(m.redirect).not.toHaveBeenCalled();
});
