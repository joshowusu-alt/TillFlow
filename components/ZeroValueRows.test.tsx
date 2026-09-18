import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ZeroValueRows from './ZeroValueRows';
import AccountingDetails from './AccountingDetails';

describe('ZeroValueRows and AccountingDetails', () => {
  it('collapses non-material zero rows and keeps warnings visible', () => {
    render(
      <ZeroValueRows
        formatValue={(value) => `${value}`}
        rows={[
          { id: 'cash', label: 'Cash', value: 1200 },
          { id: 'momo', label: 'MoMo', value: 0 },
          { id: 'card', label: 'Card', value: 0, warning: true },
          { id: 'transfer', label: 'Transfer', value: 0, incomplete: true },
        ]}
      />,
    );

    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByText('MoMo')).not.toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('Transfer')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Incomplete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expand all \(1 zero row\)/ }));
    expect(screen.getByText('MoMo')).toBeInTheDocument();
  });

  it('discloses debit and credit lines for integrators', () => {
    render(
      <AccountingDetails
        lines={[
          { id: 'dr', side: 'debit', account: '5100 Inventory loss', amountLabel: 'GHS 12.00' },
          { id: 'cr', side: 'credit', account: '1200 Inventory', amountLabel: 'GHS 12.00' },
        ]}
      />,
    );

    expect(screen.getByText('Accounting details')).toBeInTheDocument();
    expect(screen.getByText('5100 Inventory loss')).toBeInTheDocument();
    expect(screen.getByText('1200 Inventory')).toBeInTheDocument();
  });
});
