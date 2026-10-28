import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/actions/partial-purchase-returns', () => ({ recordPartialPurchaseReturnAction: '/unused' }));
vi.mock('@/components/SubmitButton', () => ({ default: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => <button disabled={disabled}>{children}</button> }));
import PartialPurchaseReturnForm from './PartialPurchaseReturnForm';

const props = {
  invoiceId: 'invoice', storeId: 'store', totalPence: 12000, paidPence: 12000,
  previousCreditPence: 0, currency: 'GHS', requestKey: 'request',
  lines: [{ id: 'books', name: 'Exercise books', qtyBase: 10, alreadyReturned: 0, onHand: 10, subtotalPence: 10000, vatPence: 2000, baseUnit: 'piece' },
    { id: 'pens', name: 'Blue pens', qtyBase: 5, alreadyReturned: 5, onHand: 5, subtotalPence: 0, vatPence: 0, baseUnit: 'piece' }],
};
const submit = () => screen.getByRole('button', { name: 'Save selected return and supplier credit' });

describe('guided purchase return form', () => {
  it('explains blank quantities, preserves field names and disables exhausted lines', () => {
    render(<PartialPurchaseReturnForm {...props} />);
    expect(screen.getByText(/Leave everything else blank/)).toBeInTheDocument();
    expect(screen.getByLabelText('Return quantity for Exercise books')).toHaveAttribute('name', 'qty:books');
    expect(screen.getByLabelText('Return quantity for Blue pens')).toBeDisabled();
    expect(screen.getByText('Nothing available to return.')).toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it('shows the VAT-inclusive credit and requires a reason before saving', () => {
    render(<PartialPurchaseReturnForm {...props} />);
    fireEvent.change(screen.getByLabelText('Return quantity for Exercise books'), { target: { value: '4' } });
    expect(screen.getByText('1 item selected')).toBeInTheDocument();
    expect(screen.getByText('Credit for this item: GH₵48.00')).toBeInTheDocument();
    const review = screen.getByRole('region', { name: 'Check the result' });
    expect(within(review).getAllByText('GH₵48.00')).toHaveLength(2);
    expect(submit()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason / supplier credit reference'), { target: { value: 'Damaged — supplier credit 1042' } });
    expect(submit()).toBeEnabled();
  });

  it('identifies an excessive quantity on its own item and blocks saving', () => {
    render(<PartialPurchaseReturnForm {...props} />);
    const input = screen.getByLabelText('Return quantity for Exercise books');
    fireEvent.change(input, { target: { value: '11' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a whole number from 0 to 10.');
    expect(submit()).toBeDisabled();
    fireEvent.change(input, { target: { value: '1.5' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps unpaid debt and previously settled credits in the existing calculation', () => {
    const { rerender } = render(<PartialPurchaseReturnForm {...props} paidPence={0} />);
    fireEvent.change(screen.getByLabelText('Return quantity for Exercise books'), { target: { value: '4' } });
    let review = screen.getByRole('region', { name: 'Check the result' });
    expect(within(review).getByText('GH₵72.00')).toBeInTheDocument();
    rerender(<PartialPurchaseReturnForm {...props} previousCreditPence={2400} creditSettledPence={1200} />);
    review = screen.getByRole('region', { name: 'Check the result' });
    expect(within(review).getByText('GH₵60.00')).toBeInTheDocument();
  });
});
