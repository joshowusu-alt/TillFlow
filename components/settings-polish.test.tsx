import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StorefrontPickupHours from './StorefrontPickupHours';
import LoyaltySettingsForm from './LoyaltySettingsForm';
import { makeDefaultWeeklyHours } from '@/lib/business-hours';
vi.mock('@/app/actions/settings', () => ({ updateLoyaltySettingsAction: '/test-save' }));
vi.mock('@/components/SubmitButton', () => ({ default: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => <button type="submit" disabled={disabled}>{children}</button> }));

describe('pickup hours editor', () => {
  it('opens a closed day immediately and retains its custom times in the form', () => {
    const hours = makeDefaultWeeklyHours();
    hours.sunday = { open: '10:15', close: '16:45', closed: true };
    const { container } = render(<form><StorefrontPickupHours initialHours={hours} /></form>);
    expect(screen.getByLabelText('Sunday opens')).toBeDisabled();
    expect(new FormData(container.querySelector('form')!).get('sunday_open')).toBe('10:15');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Closed on Sunday' }));
    expect(screen.getByLabelText('Sunday opens')).toBeEnabled();
    expect(screen.getByLabelText('Sunday opens')).toHaveValue('10:15');
    fireEvent.change(screen.getByLabelText('Sunday opens'), { target: { value: '11:30' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Closed on Sunday' }));
    expect(new FormData(container.querySelector('form')!).get('sunday_open')).toBe('11:30');
  });
});

describe('loyalty reward preview', () => {
  it('uses currency amounts and the checkout earning and redemption rules', () => {
    render(<LoyaltySettingsForm enabled earnRate={1} redemptionPence={100} />);
    expect(screen.getByLabelText('Discount per 100 points (GHS)')).toHaveValue(1);
    fireEvent.change(screen.getByLabelText('Points earned per GHS 1.00 spent'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Discount per 100 points (GHS)'), { target: { value: '1.50' } });
    expect(screen.getByText('200 points')).toBeInTheDocument();
    expect(screen.getByText('GHS 3.00')).toBeInTheDocument();
  });
  it('explains incomplete point blocks and rejects invalid amounts before saving', () => {
    render(<LoyaltySettingsForm enabled={false} earnRate={1} redemptionPence={100} />);
    expect(screen.getByText(/complete blocks of 100/)).toBeInTheDocument();
    expect(screen.getByText(/programme will be off/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Discount per 100 points (GHS)'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save loyalty settings' })).toBeDisabled();
    expect(screen.getByText(/Enter valid earning/)).toBeInTheDocument();
  });
});
