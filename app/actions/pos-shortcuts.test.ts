import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ context: vi.fn(), count: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/action-utils', () => ({ requireSelectedStoreContext: m.context, safeAction: async (fn: () => unknown) => fn(), ok: (data: unknown) => ({ success: true, data }), UserError: class extends Error {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { product: { count: m.count }, store: { updateMany: m.update } } }));
vi.mock('@/lib/audit', () => ({ audit: m.audit }));
import { savePosShortcutsAction } from './pos-shortcuts';
const layout = { screens: [{ id: 'main', name: 'Main', productIds: ['p1'] }] };
beforeEach(() => { vi.resetAllMocks(); m.context.mockResolvedValue({ businessId: 'b1', user: { id: 'u1', name: 'Manager', role: 'MANAGER' } }); m.count.mockResolvedValue(1); m.update.mockResolvedValue({ count: 1 }); });
it('requires an authorised selected branch and validates tenant-scoped active products', async () => {
  await savePosShortcutsAction('s1', null, layout);
  expect(m.context).toHaveBeenCalledWith(['OWNER', 'MANAGER'], 's1');
  expect(m.count).toHaveBeenCalledWith({ where: { businessId: 'b1', active: true, id: { in: ['p1'] } } });
  expect(m.update).toHaveBeenCalledWith({ where: { id: 's1', businessId: 'b1', posShortcutsJson: null }, data: { posShortcutsJson: JSON.stringify(layout) } });
  expect(m.audit).toHaveBeenCalled();
});
it('refuses foreign or discontinued products without writing', async () => {
  m.count.mockResolvedValue(0); await expect(savePosShortcutsAction('s1', null, layout)).rejects.toThrow('no longer available'); expect(m.update).not.toHaveBeenCalled();
});
it('refuses stale edits without recording a successful change', async () => {
  m.update.mockResolvedValue({ count: 0 }); await expect(savePosShortcutsAction('s1', 'old-layout', layout)).rejects.toThrow('another till'); expect(m.audit).not.toHaveBeenCalled();
});
it('does not read or write products when authorisation fails', async () => {
  m.context.mockRejectedValue(new Error('Forbidden')); await expect(savePosShortcutsAction('s1', null, layout)).rejects.toThrow('Forbidden'); expect(m.count).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
