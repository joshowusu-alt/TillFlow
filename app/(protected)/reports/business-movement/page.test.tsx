import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ownerMovementFixture } from '@/lib/reviews/reports-owner-fixtures';

const mocks = vi.hoisted(() => ({ open: vi.fn(), compute: vi.fn(), stores: vi.fn(), timezone: vi.fn() }));
vi.mock('@/lib/entitlements/live-report', () => ({ openLiveReport: mocks.open }));
vi.mock('@/lib/services/stores', () => ({ getBusinessStores: mocks.stores }));
vi.mock('@/lib/prisma', () => ({ prisma: { business: { findUnique: mocks.timezone } } }));
vi.mock('@/lib/reports/business-movement', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/reports/business-movement')>()),
  computeBusinessMovementWithMoneyFromDb: mocks.compute,
}));
vi.mock('@/components/DownloadLink', () => ({ default: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => <button disabled={disabled}>{children}</button> }));
import Page from './page';

describe('Business movement owner page', () => {
  const stores = [{ id: 'sample-branch', name: 'Sample branch' }];
  const now = new Date('2026-11-26T12:00:00Z');
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stores.mockResolvedValue({ stores });
    mocks.timezone.mockResolvedValue({ timezone: 'Africa/Accra' });
    mocks.compute.mockResolvedValue(ownerMovementFixture());
    mocks.open.mockImplementation(async ({ range }) => {
      const requested = range({ timezone: 'Africa/Accra', now, canonicalPlan: 'PRO' });
      expect(requested).toEqual({ fromLocalDate: '2026-10-06', toLocalDate: '2026-11-26', preset: 'CUSTOM' });
      return { ok: true, business: { id: 'synthetic', currency: 'GHS', canonicalPlan: 'PRO' },
        user: { role: 'OWNER', businessId: 'synthetic' }, branch: { kind: 'stores', selected: 'sample-branch', storeIds: ['sample-branch'], choices: stores, offerAll: false }, readOnly: false };
    });
  });
  it('requests the equal-length prior period and loads the exact authorised month-to-date pair', async () => {
    const html = renderToStaticMarkup(await Page({}));
    expect(mocks.compute).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      businessId: 'synthetic', branchIds: ['sample-branch'],
      period: { preset: 'equal_length_custom', currentFromKey: '2026-11-01', currentToKey: '2026-11-26' },
    }));
    const root = document.createElement('div'); root.innerHTML = html;
    expect(root.querySelector('#movement-storeId')).toBeNull();
    expect(root.querySelectorAll('[data-report-header-actions] > a')).toHaveLength(1);
    expect(root.querySelector('[data-report-header-actions] > a')?.textContent).toBe('Money received');
    expect(root.querySelector('[data-stage3b-actions]')?.hasAttribute('open')).toBe(false);
    expect(root.querySelectorAll('[data-report-period-chips] a')).toHaveLength(5);
    expect(html).not.toContain('Change period or branch');
    expect(html).not.toContain('>Update<');
    expect(html.indexOf('What to look at')).toBeLessThan(html.indexOf('Biggest product changes'));
  });
  it('does not query money or sales if the guard denies the request', async () => {
    mocks.open.mockResolvedValue({ ok: false, denial: <p>Access denied</p> });
    expect(renderToStaticMarkup(await Page({}))).toContain('Access denied');
    expect(mocks.compute).not.toHaveBeenCalled();
  });
});
