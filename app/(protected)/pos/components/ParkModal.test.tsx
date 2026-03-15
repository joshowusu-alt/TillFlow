import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ParkModal from './ParkModal';

describe('ParkModal', () => {
  it('lets the cashier choose a quick label and park the sale', () => {
    const onPark = vi.fn();
    const onClose = vi.fn();

    render(<ParkModal itemCount={3} onPark={onPark} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Customer returning' }));

    expect(screen.getByDisplayValue('Customer returning')).toBeInTheDocument();
    expect(screen.getByText(/Saved as/i)).toHaveTextContent('Saved as Customer returning');

    fireEvent.click(screen.getByRole('button', { name: 'Park (3 items)' }));

    expect(onPark).toHaveBeenCalledWith('Customer returning');
  });

  it('shows the fallback sale label preview when no label is entered', () => {
    render(<ParkModal itemCount={5} onPark={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText(/Saved as/i)).toHaveTextContent('Sale (5 items)');
  });

  it('closes when the backdrop is clicked but not when the dialog body is clicked', () => {
    const onClose = vi.fn();

    const { container } = render(<ParkModal itemCount={2} onPark={vi.fn()} onClose={onClose} />);

    const backdrop = container.querySelector('button[aria-hidden="true"]') as HTMLElement;

    fireEvent.click(screen.getByRole('dialog', { name: 'Park current sale' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});