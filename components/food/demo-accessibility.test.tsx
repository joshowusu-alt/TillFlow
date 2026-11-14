import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FoodPlatePicker from './FoodPlatePicker';
import StorefrontPaymentModeCard from '../StorefrontPaymentModeCard';

afterEach(cleanup);

it('exposes the plate picker as a named modal dialog', () => {
  render(<FoodPlatePicker menu={{ productId: 'dish', name: 'Rice bowl', stockMode: 'COUNTED', soldOut: false,
    lowAt: 0, sizes: [], inclusions: [], groups: [] }} startingPricePence={2000} onCancel={vi.fn()} onConfirm={vi.fn()} />);
  expect(screen.getByRole('dialog', { name: 'Choose a plate for Rice bowl' })).toHaveAttribute('aria-modal', 'true');
});

it('shows the configured MoMo account name in a labelled settings field', () => {
  render(<StorefrontPaymentModeCard defaultMode="MOMO_NUMBER" defaultMomoNumber="0241234567"
    defaultMomoAccountName="Connie's Food" defaultMomoNetwork="MTN" defaultMerchantShortcode=""
    defaultBankName="" defaultBankAccountName="" defaultBankAccountNumber="" defaultBankBranch="" defaultPaymentNote="" />);
  expect(screen.getByRole('textbox', { name: 'MoMo account name' })).toHaveValue("Connie's Food");
});
