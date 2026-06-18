import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ShiftClient from './ShiftClient';

const refreshMock = vi.fn();
const openShiftActionMock = vi.fn();
const closeShiftActionMock = vi.fn();
const closeShiftOwnerOverrideActionMock = vi.fn();
const addCashToTillActionMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
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
        openShift={{
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
        }}
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

  it('shows Add cash to till button for OWNER when a shift is open', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShift={baseOpenShift}
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
        openShift={baseOpenShift}
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
        openShift={baseOpenShift}
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
        openShift={baseOpenShift}
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
        openShift={baseOpenShift}
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
        openShift={baseOpenShift}
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
        openShift={{ ...baseOpenShift, expectedCash: -590350, openingCashPence: 0 }}
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
        openShift={{ ...baseOpenShift, expectedCash: -590350, openingCashPence: 50000 }}
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
        openShift={baseOpenShift}
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
        openShift={{
          ...baseOpenShift,
          openingCashPence: 0,
          expectedCash: 176550,
          cashByType: {
            OPEN_FLOAT: 0,
            CASH_SALE: 86550,
            CASH_ADJUSTMENT: 90000,
          },
        }}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));
    expect(screen.getByText('Cash added / adjustments')).toBeInTheDocument();
  });

  it('shows supplier payments and other cash movement categories in the close breakdown', () => {
    render(
      <ShiftClient
        tills={[{ id: 'till-1', name: 'Till 1' }]}
        openShift={{
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
        }}
        otherOpenShifts={[]}
        recentShifts={[]}
        currency="GHS"
        userRole="OWNER"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close Shift' }));

    expect(screen.getByText('Opening Cash')).toBeInTheDocument();
    expect(screen.getByText('Cash Sales')).toBeInTheDocument();
    expect(screen.getByText('Customer payments received')).toBeInTheDocument();
    expect(screen.getByText('Supplier payments')).toBeInTheDocument();
    expect(screen.getByText('Expenses paid from till')).toBeInTheDocument();
    expect(screen.getAllByText('Expected Cash').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('GH₵2,600.00').length).toBeGreaterThanOrEqual(1);
  });
});
