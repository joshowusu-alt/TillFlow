import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context: vi.fn(), node: vi.fn(), category: vi.fn(), division: vi.fn(), group: vi.fn(), redirect: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({ withBusinessContext: m.context, safeAction: async (fn: () => unknown) => fn(), ok: (data: unknown) => ({ success: true, data }) }));
vi.mock('@/lib/prisma', () => ({ prisma: { productDivision: { findFirst: m.division }, productGroup: { findFirst: m.group } } }));
vi.mock('@/lib/services/product-classification', () => ({ createClassificationNode: m.node }));
vi.mock('./categories', () => ({ quickCreateCategoryAction: m.category }));
vi.mock('@/lib/audit', () => ({ audit: m.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
import { saveClassificationSetupAction } from './product-classification';
beforeEach(() => { vi.resetAllMocks(); m.context.mockResolvedValue({ businessId: 'business', user: { id: 'owner', name: 'Owner', role: 'OWNER' } }); m.redirect.mockImplementation(() => { throw new Error('navigate'); }); });
it('opens the next division editor under the category returned by the saved action', async () => {
  m.category.mockResolvedValue({ success: true, data: { id: 'saved-category', name: 'Books' } });
  await expect(saveClassificationSetupAction('category', '', 'Books')).rejects.toThrow('navigate');
  expect(m.redirect).toHaveBeenCalledWith('/products?tab=categories&setupSaved=category&setupCategory=saved-category&setupAdd=division');
});
it('restores the saved division and its database category before opening the group editor', async () => {
  m.node.mockResolvedValue({ id: 'saved-division', name: 'Bibles' }); m.division.mockResolvedValue({ categoryId: 'actual-category' });
  await expect(saveClassificationSetupAction('division', 'actual-category', 'Bibles')).rejects.toThrow('navigate');
  expect(m.division).toHaveBeenCalledWith({ where: { id: 'saved-division', businessId: 'business' }, select: { categoryId: true } });
  expect(m.redirect).toHaveBeenCalledWith('/products?tab=categories&setupSaved=division&setupCategory=actual-category&setupDivision=saved-division&setupAdd=group');
});
it('uses the saved groups tenant-scoped ancestry for the selected path', async () => {
  m.node.mockResolvedValue({ id: 'saved-group', name: 'General' }); m.group.mockResolvedValue({ divisionId: 'actual-division', division: { categoryId: 'actual-category' } });
  await expect(saveClassificationSetupAction('group', 'actual-division', 'General')).rejects.toThrow('navigate');
  expect(m.group).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'saved-group', businessId: 'business', division: { businessId: 'business' } } }));
  expect(m.redirect).toHaveBeenCalledWith('/products?tab=categories&setupSaved=group&setupCategory=actual-category&setupDivision=actual-division&setupGroup=saved-group');
});
it('keeps validation failures on the form without claiming a successful save', async () => {
  m.category.mockResolvedValue({ success: false, error: 'Enter a category name.' });
  expect(await saveClassificationSetupAction('category', '', '')).toEqual({ success: false, error: 'Enter a category name.' });
  expect(m.redirect).not.toHaveBeenCalled();
});
