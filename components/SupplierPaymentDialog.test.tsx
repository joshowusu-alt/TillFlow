import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/app/actions/payments', () => ({ recordSupplierPaymentAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
// react-dom 18.2 in jsdom has no useFormStatus (Next ships its own canary).
vi.mock('@/components/SubmitButton', () => ({
  default: ({ children }: { children: React.ReactNode }) => <button type="submit">{children}</button>,
}));

import SupplierPaymentDialog from './SupplierPaymentDialog';

describe('SupplierPaymentDialog', () => {
  afterEach(cleanup);

  it('renders the dialog outside the (hover-transformed) table row so it is never covered', () => {
    render(
      <table>
        <tbody>
          <tr data-testid="row" style={{ transform: 'translateY(-1px)' }}>
            <td>
              <SupplierPaymentDialog
                invoiceId="inv-1"
                purchaseNumber="PUR-000009"
                supplierName="Walkthrough Supplier 01"
                storeName="Walkthrough Store B"
                storeId="store-b"
                today="2026-09-21"
                currency="GHS"
                originalPence={400}
                paidPence={0}
                remainingPence={400}
                openTills={[{ tillId: 'till-b1', tillName: 'Till B1', shiftId: 'shift-1' }]}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Record payment$/ }));
    const dialog = screen.getByRole('dialog', { name: /Supplier payment PUR-000009/ });
    expect(screen.getByTestId('row').contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveTextContent('Recording in');
    expect(dialog).toHaveTextContent('Walkthrough Store B');
    expect(dialog.querySelector('input[name="invoiceId"]')).toHaveValue('inv-1');
  });
});
