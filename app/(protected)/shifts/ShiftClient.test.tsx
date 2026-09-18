import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ShiftClient from './ShiftClient';

const refreshMock = vi.fn();
const pushMock = vi.fn();
const openShiftActionMock = vi.fn();
const closeShiftActionMock = vi.fn();
const closeShiftOwnerOverrideActionMock = vi.fn();
const addCashToTillActionMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

vi.mock('@/app/actions/shifts', () => ({
  openShiftAction: (...args: unknown[]) => openShiftActionMock(...args),
  closeShiftAction: (...args: unknown[]) => closeShiftActionMock(...args),
  closeShiftOwnerOverrideAction: (...args: unknown[]) => closeShiftOwnerOverrideActionMock(...args),
  addCashToTillAction: (...args: unknown[]) => addCashToTillActionMock(...args),
}));

describe('ShiftClient', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    pushMock.mockReset();
    openShiftActionMock.mockReset();
    closeShiftActionMock.mockReset();
    closeShiftOwnerOverrideActionMock.mockReset();
    addCashToTillActionMock.mockReset();
  });

  const baseOpenShift = {
    id: 'shift-1',
    till: { name: 'Till 1' },
    openedAt: new Date('2026-06-17T08:44:00.000Z'),
    openingCashPence: 0,
    salesCount: 10,
    salesTotal: 86550,
    expectedCash: 86550,
    cardTotal: 0,
    transferTotal: 0,
    momoTotal: 0,
    cashByType: {
      OPEN_FLOAT: 0,
      CASH_SALE: 86550,
    },
  };

  it('keeps the close modal open and shows owner override errors when the action fails', async () => {
    closeShiftOwnerOverrideActionMock.mockResolvedValue({ success: false, error: 'Incorrect password.' });

    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[{
          id: 'shift-1',
          till: { name: 'Till 1' },
          openedAt: new Date('2026-03-18T08:00:00.000Z'),
          openingCashPence: 0,
          salesCount: 0,
          salesTotal: 0,
          expectedCash: 0,
          cardTotal: 0,
          transferTotal: 0,
          momoTotal: 0,
          cashByType: {},
        }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));
    fireEvent.click(screen.getByRole('button', { name: 'Owner Override (use password)' }));

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '0.00' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter your login password'), { target: { value: 'wrong-password' } });
    fireEvent.change(screen.getByDisplayValue('Select reason...'), { target: { value: 'SYSTEM_ISSUE' } });
    fireEvent.change(screen.getByPlaceholderText('Explain why owner override is needed'), { target: { value: 'Need to close from owner console' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Close Shift' })[1]);

    await waitFor(() => {
      expect(closeShiftOwnerOverrideActionMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Incorrect password.')).toBeInTheDocument();
    });

    expect(screen.getByText('Owner Override')).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('lists every current-user open shift so each can be closed', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }, { id: 'till-3', name: 'Till 3' }]}
        openShifts={[
          baseOpenShift,
          { ...baseOpenShift, id: 'shift-3', till: { name: 'Till 3' } },
        ]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    expect(screen.getByRole('button', { name: 'Till 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Till 3' })).toBeInTheDocument();
  });

  it('shows Add cash to till button for OWNER when a shift is open', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[baseOpenShift]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    expect(screen.getByRole('button', { name: '+ Add cash to till' })).toBeInTheDocument();
  });

  it('shows Add cash to till button for MANAGER when a shift is open', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[baseOpenShift]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="MANAGER"
      />
    );
    expect(screen.getByRole('button', { name: '+ Add cash to till' })).toBeInTheDocument();
  });

  it('does not show Add cash to till button for cashier role', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[baseOpenShift]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="CASHIER"
      />
    );
    expect(screen.queryByRole('button', { name: '+ Add cash to till' })).not.toBeInTheDocument();
  });

  it('reveals the add cash form when the button is clicked', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[baseOpenShift]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add cash to till' }));
    expect(screen.getByText('Add cash to till')).toBeInTheDocument();
    expect(screen.getByText(/increases expected cash but does not count as revenue/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add cash' })).toBeInTheDocument();
  });

  it('calls addCashToTillAction with amount and reason on submit', async () => {
    addCashToTillActionMock.mockResolvedValue({ success: true, data: { id: 'entry-1' } });
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[baseOpenShift]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add cash to till' }));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '7000' } });
    fireEvent.change(screen.getByDisplayValue('Select reason'), { target: { value: 'OWNER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add cash' }));
    await waitFor(() => {
      expect(addCashToTillActionMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows action error when addCashToTillAction fails', async () => {
    addCashToTillActionMock.mockResolvedValue({ success: false, error: 'Open shift is required before adding cash to till.' });
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[baseOpenShift]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add cash to till' }));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
    fireEvent.change(screen.getByDisplayValue('Select reason'), { target: { value: 'SAFE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add cash' }));
    await waitFor(() => {
      expect(screen.getByText('Open shift is required before adding cash to till.')).toBeInTheDocument();
    });
  });

  it('shows negative expected cash helper text when expected cash is negative', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[{ ...baseOpenShift, expectedCash: -590350, openingCashPence: 0 }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    expect(screen.getByText('More cash has been paid out than received in this shift.')).toBeInTheDocument();
    expect(screen.getByText('No opening float was recorded.')).toBeInTheDocument();
  });

  it('shows negative expected cash helper without float message when opening float was set', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[{ ...baseOpenShift, expectedCash: -590350, openingCashPence: 50000 }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    expect(screen.getByText('More cash has been paid out than received in this shift.')).toBeInTheDocument();
    expect(screen.queryByText('No opening float was recorded.')).not.toBeInTheDocument();
  });

  it('does not show negative expected cash helper when expected cash is positive', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[baseOpenShift]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    expect(screen.queryByText('More cash has been paid out than received in this shift.')).not.toBeInTheDocument();
  });

  it('shows Cash added / adjustments label in close breakdown when adjustments are present', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[{
          ...baseOpenShift,
          openingCashPence: 0,
          expectedCash: 176550,
          cashByType: {
            OPEN_FLOAT: 0,
            CASH_SALE: 86550,
            CASH_ADJUSTMENT: 90000,
          },
        }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));
    expect(screen.getAllByText('Cash added / adjustments').length).toBeGreaterThanOrEqual(1);
  });

  it('shows supplier payments and other cash movement categories in the close breakdown', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShifts={[{
          id: 'shift-1',
          till: { name: 'Till 1' },
          openedAt: new Date('2026-03-18T08:00:00.000Z'),
          openingCashPence: 20000,
          salesCount: 1,
          salesTotal: 100000,
          expectedCash: 260000,
          cardTotal: 0,
          transferTotal: 0,
          momoTotal: 0,
          cashByType: {
            OPEN_FLOAT: 20000,
            CASH_SALE: 100000,
            CASH_DEBTOR_PAYMENT: 200000,
            PAID_OUT_SUPPLIER: -50000,
            PAID_OUT_EXPENSE: -10000,
            CASH_REFUND: 0,
            CASH_ADJUSTMENT: 0,
          },
        }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));

    expect(screen.getByText('Opening Cash')).toBeInTheDocument();
    expect(screen.getByText('Cash Sales')).toBeInTheDocument();
    expect(screen.getAllByText('Customer payments received').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Supplier payments').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Expenses paid from till').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Expected Cash').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('GH₵2,600.00').length).toBeGreaterThanOrEqual(1);
  });

  it('does not offer a usable Open Shift action for an already-open till', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }, { id: 'till-3', name: 'Till 3' }]}
        openShifts={[]}
        occupiedTills={[{
          tillId: 'till-1',
          tillName: 'Till 1',
          shiftId: 'shift-other',
          userId: 'user-2',
          userName: 'Ama',
          openedAt: '2026-09-17T08:00:00.000Z',
          openingCashPence: 20000,
          salesCount: 1,
          salesTotal: 1000,
          expectedCash: 21000,
          cardTotal: 0,
          transferTotal: 0,
          momoTotal: 0,
        }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="CASHIER"
        currentUserId="user-1"
      />
    );

    expect(screen.getByText(/Open — Ama/)).toBeInTheDocument();
    expect(screen.getByText(/float GH₵200.00/)).toBeInTheDocument();
    expect(screen.getByText('Open unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Shift' })).toBeInTheDocument();
    const tillSelect = screen.getByLabelText('Till') as HTMLSelectElement;
    expect(tillSelect.value).toBe('till-3');
    expect(screen.queryByRole('option', { name: 'Till 1' })).not.toBeInTheDocument();
  });

  it('opens a shift by navigating to POS for that till, not by remaining on Start New Shift', async () => {
    openShiftActionMock.mockResolvedValue({ success: true, data: { id: 'shift-3', tillId: 'till-3' } });
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }, { id: 'till-3', name: 'Till 3' }]}
        openShifts={[]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );

    expect(screen.getByRole('heading', { name: 'Start New Shift' })).toBeInTheDocument();
    expect(screen.queryByText('Shift Active')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Till'), { target: { value: 'till-3' } });
    fireEvent.change(screen.getByLabelText(/Opening Cash/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Shift' }));

    await waitFor(() => {
      expect(openShiftActionMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).toHaveBeenCalledWith('/pos?till=till-3');
  });

  it('sends the explicit store with open, close and add-cash writes', async () => {
    openShiftActionMock.mockResolvedValue({ success: true, data: { id: 'shift-b', tillId: 'till-b' } });
    addCashToTillActionMock.mockResolvedValue({ success: true, data: { id: 'cash-1' } });
    closeShiftActionMock.mockResolvedValue({ success: true, data: { id: 'shift-1', investigationId: null } });

    const { rerender } = render(
      <ShiftClient
        storeId="store-b"
        tills={[{ id: 'till-b', name: 'Till B1' }]}
        openShifts={[]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Opening Cash/i), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Shift' }));
    await waitFor(() => expect(openShiftActionMock).toHaveBeenCalledTimes(1));
    const openData = openShiftActionMock.mock.calls[0][0] as FormData;
    expect(openData.get('storeId')).toBe('store-b');
    expect(openData.get('tillId')).toBe('till-b');

    rerender(
      <ShiftClient
        storeId="store-b"
        tills={[{ id: 'till-b', name: 'Till B1' }]}
        openShifts={[{ ...baseOpenShift, tillId: 'till-b', till: { name: 'Till B1' } }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Add cash to till' }));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    fireEvent.change(screen.getByDisplayValue('Select reason'), { target: { value: 'SAFE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add cash' }));
    await waitFor(() => expect(addCashToTillActionMock).toHaveBeenCalledTimes(1));
    expect((addCashToTillActionMock.mock.calls[0][0] as FormData).get('storeId')).toBe('store-b');

    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));
    fireEvent.change(screen.getByLabelText(/Actual Cash Counted/i), { target: { value: '865.50' } });
    fireEvent.change(screen.getByPlaceholderText('Enter manager approval PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Close Shift' }).at(-1)!);
    await waitFor(() => expect(closeShiftActionMock).toHaveBeenCalledTimes(1));
    expect((closeShiftActionMock.mock.calls[0][0] as FormData).get('storeId')).toBe('store-b');
    expect((closeShiftActionMock.mock.calls[0][0] as FormData).get('shiftId')).toBe('shift-1');
  });

  it('shows close-shift identity and starts approval fields empty', async () => {
    render(
      <ShiftClient
        storeId="store-b"
        storeName="Walkthrough Store B"
        tills={[{ id: 'till-b', name: 'Till B1' }]}
        openShifts={[{ ...baseOpenShift, userName: 'Ama Cashier', till: { name: 'Till B1' } }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));
    expect(screen.getByText('Walkthrough Store B')).toBeInTheDocument();
    expect(screen.getAllByText('Till B1').length).toBeGreaterThan(0);
    expect(screen.getByText('Ama Cashier')).toBeInTheDocument();
    expect(screen.getAllByText(/Opened/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Variance Details')).toHaveValue('');
    expect(screen.getByPlaceholderText('Enter manager approval PIN')).toHaveValue('');
    expect(screen.getByLabelText('Variance Details')).toHaveAttribute('autoComplete', 'off');
    expect(screen.getByPlaceholderText('Enter manager approval PIN')).toHaveAttribute('name', 'close-shift-manager-approval');
  });

  it('does not claim the full float can be retained when counted cash is below it', async () => {
    render(
      <ShiftClient
        storeId="store-b"
        storeName="Walkthrough Store B"
        tills={[{ id: 'till-b', name: 'Till B1' }]}
        openShifts={[{
          ...baseOpenShift,
          expectedCash: 20000,
          openingCashPence: 20000,
          cashByType: { OPEN_FLOAT: 20000 },
        }]}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));
    fireEvent.change(screen.getByLabelText(/Actual Cash Counted/i), { target: { value: '5.00' } });
    expect(screen.getByText('Float shortfall')).toBeInTheDocument();
    expect(screen.getByText(/full float cannot be retained/i)).toBeInTheDocument();
  });
});
