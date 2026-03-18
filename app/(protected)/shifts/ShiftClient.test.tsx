import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ShiftClient from './ShiftClient';

const refreshMock = vi.fn();
const openShiftActionMock = vi.fn();
const closeShiftActionMock = vi.fn();
const closeShiftOwnerOverrideActionMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/app/actions/shifts', () => ({
  openShiftAction: (...args: unknown[]) => openShiftActionMock(...args),
  closeShiftAction: (...args: unknown[]) => closeShiftActionMock(...args),
  closeShiftOwnerOverrideAction: (...args: unknown[]) => closeShiftOwnerOverrideActionMock(...args),
}));

describe('ShiftClient', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    openShiftActionMock.mockReset();
    closeShiftActionMock.mockReset();
    closeShiftOwnerOverrideActionMock.mockReset();
  });

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
});