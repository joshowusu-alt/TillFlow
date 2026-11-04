import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoyaltySettingsPage from './page';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), preferences: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireBusiness: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { business: { findUnique: mocks.preferences } } }));
vi.mock('@/app/actions/settings', () => ({ updateLoyaltySettingsAction: '/test-save' }));
vi.mock('@/components/SubmitButton', () => ({ default: () => <button>Save loyalty settings</button> }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ business: { id: 'business-1', plan: 'PRO', mode: 'ADVANCED', storeMode: 'SINGLE_STORE' } });
  mocks.preferences.mockResolvedValue({ loyaltyEnabled: true, loyaltyPointsPerGhsPence: 2, loyaltyGhsPerHundredPoints: 150 });
});
describe('saved loyalty preferences', () => {
  it('loads persisted rates even when the shared business snapshot does not contain them', async () => {
    render(await LoyaltySettingsPage({}));
    expect(screen.getByLabelText('Points earned per GHS 1.00 spent')).toHaveValue(2);
    expect(screen.getByLabelText('Discount per 100 points (GHS)')).toHaveValue(1.5);
    expect(screen.getByRole('checkbox', { name: /Enable loyalty programme/ })).toBeChecked();
    expect(mocks.preferences).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'business-1' } }));
  });
  it('does not load premium preferences for a Starter business', async () => {
    mocks.auth.mockResolvedValue({ business: { id: 'business-1', plan: 'STARTER', mode: 'SIMPLE' } });
    await LoyaltySettingsPage({});
    expect(mocks.preferences).not.toHaveBeenCalled();
  });
});
