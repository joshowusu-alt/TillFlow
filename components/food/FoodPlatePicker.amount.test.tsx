import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import FoodPlatePicker from './FoodPlatePicker';
import type { FoodMenu } from '@/lib/food/plate';

const menu: FoodMenu = { productId: 'rice', name: 'Fried Rice', stockMode: 'COUNTED', soldOut: false,
  lowAt: 0, sizes: [], inclusions: [], groups: [], allowCustomAmount: true, minimumAmountPence: 3000 };
const onConfirm = vi.fn();
const renderPicker = (allowTillAmount: boolean, enabled = true) =>
  render(<FoodPlatePicker menu={{ ...menu, allowCustomAmount: enabled }} startingPricePence={3000}
    allowTillAmount={allowTillAmount} onCancel={() => {}} onConfirm={onConfirm} />);

it('only offers Other amount on the till for enabled dishes', () => {
  const online = renderPicker(false);
  expect(screen.queryByRole('button', { name: 'Other amount' })).toBeNull();
  online.unmount();
  renderPicker(true, false);
  expect(screen.queryByRole('button', { name: 'Other amount' })).toBeNull();
});

it('focuses only the visible amount input and rejects an amount below the minimum', () => {
  renderPicker(true);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(document.activeElement).toBe(document.body);
  fireEvent.click(screen.getByRole('button', { name: 'Other amount' }));
  const amount = screen.getByRole('textbox', { name: 'Amount (GH₵)' });
  expect(amount).toHaveFocus();
  fireEvent.change(amount, { target: { value: '29' } });
  expect(screen.getByText('Lowest amount for this dish is GH₵30.00.')).toBeVisible();
  fireEvent.change(amount, { target: { value: '35' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add GH₵35.00' }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customAmountPence: 3500 }), 3500);
});

it('shows the VAT-inclusive cart price when paid extras are selected', () => {
  const onConfirm = vi.fn();
  render(<FoodPlatePicker menu={{ ...menu, groups: [{
    id: 'extras', name: 'Extras', selection: 'SINGLE', required: false,
    addons: [{ id: 'egg', name: 'Egg', pricePence: 500, maxQty: 1, stockPortions: 0 }],
  }] }} startingPricePence={3000} allowTillAmount amountVatRateBps={1500}
    onCancel={() => {}} onConfirm={onConfirm} />);

  fireEvent.click(screen.getByRole('button', { name: 'Other amount' }));
  const amount = screen.getByRole('textbox', { name: 'Amount (GH₵)' });
  fireEvent.change(amount, { target: { value: '35' } });
  expect(amount).toHaveAccessibleDescription('Includes VAT');
  expect(screen.getByRole('button', { name: 'Add GH₵35.00' })).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
  expect(amount).toHaveAccessibleDescription('Includes VAT. Extras + VAT.');
  fireEvent.click(screen.getByRole('button', { name: 'Add GH₵40.75' }));
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ customAmountPence: 3500 }), 4000);
});
