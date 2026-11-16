import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { saleDeletionPreview } from '@/lib/food/sale-deletion';
import DeleteFoodSaleButton from './DeleteFoodSaleButton';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/actions/returns', () => ({ deleteFoodSaleAction: vi.fn() }));

const cash = { method: 'CASH', amountPence: 2000, status: 'CONFIRMED' };

it('offers Return instead of Delete sale for mixed confirmed payments', () => {
  const preview = saleDeletionPreview({
    tillId: null, shift: null, payments: [cash, { method: 'MOBILE_MONEY', amountPence: 500, status: 'CONFIRMED' }],
  }, 'GHS');
  render(<DeleteFoodSaleButton invoiceId="sale" preview={preview} />);
  expect(screen.queryByRole('button', { name: 'Delete sale' })).toBeNull();
  expect(screen.getByText('Paid more than one way — use Return')).toBeVisible();
});

it.each([
  ['OPEN', 'comes off Till 2’s cash.'],
  ['CLOSED', 'comes off cash on hand (till already closed).'],
])('explains which cash is reversed when the original shift is %s', (status, message) => {
  const preview = saleDeletionPreview({
    tillId: 'till2', shift: { status, tillId: 'till2', till: { active: true, name: 'Till 2' } },
    payments: [cash, { method: 'MOBILE_MONEY', amountPence: 500, status: 'PENDING' }],
  }, 'GHS');
  render(<DeleteFoodSaleButton invoiceId="sale" preview={preview} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete sale' }));
  expect(screen.getByText(`GH₵20.00 ${message}`)).toBeVisible();
});
