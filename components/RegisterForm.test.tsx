import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/actions/register', () => ({ register: vi.fn() }));
vi.mock('@/components/SubmitButton', () => ({ default: ({ children }: any) => <button type="submit">{children}</button> }));
vi.mock('@/components/Logo', () => ({ Logo: () => <span>TillFlow</span> }));
import RegisterForm from './RegisterForm';
function fillBusiness() {
  fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'Fixture shop' } });
  fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Owner' } });
  fireEvent.submit(screen.getByLabelText('Your Name').closest('form')!);
}
function fillAccount() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abcdef' } });
  fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
}
describe('registration controls', () => {
  it('supports form submission on both early steps and rejects invalid email', () => {
    render(<RegisterForm />); fillBusiness();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abcdef' } });
    expect(screen.getByRole('button', { name: 'Next — Choose Plan' })).toBeDisabled();
    fillAccount();
    expect(screen.getByRole('button', { name: /^Growth/ })).toHaveAttribute('aria-pressed', 'false');
  });
  it('retains currency on Back and submits the selected plan, addon and interval', () => {
    const { container } = render(<RegisterForm />); fillBusiness(); fillAccount();
    fireEvent.click(screen.getByRole('button', { name: /^Growth/ }));
    fireEvent.click(screen.getByLabelText('Add online storefront to my Growth plan'));
    fireEvent.click(screen.getByRole('button', { name: /Annual Pay/ }));
    expect(screen.getByText(/Subscription after your trial: GHS 5,490/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next — Currency' }));
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'GBP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Next — Currency' }));
    expect(screen.getByLabelText('Currency')).toHaveValue('GBP');
    expect(container.querySelector('input[name="plan"]')).toHaveValue('GROWTH');
    expect(container.querySelector('input[name="addonOnlineStorefront"]')).toHaveValue('on');
    expect(container.querySelector('input[name="billingInterval"]')).toHaveValue('ANNUAL');
  });
  it('explains throttling instead of displaying an unknown error', () => {
    render(<RegisterForm error="throttled" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Too many signup attempts');
  });
});
