'use client';

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RegisterForm from './RegisterForm';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/actions/register', () => ({
  register: vi.fn(),
}));

describe('RegisterForm step 1', () => {
  it('enables Next — Account Details only after Business Name and Your Name have React state', () => {
    render(<RegisterForm />);
    const next = screen.getByRole('button', { name: 'Next — Account Details' });
    const business = screen.getByPlaceholderText(/El-Shaddai Supermarket/i);
    const owner = screen.getByPlaceholderText(/Kingsley Atakorah/i);

    expect(next).toBeDisabled();

    fireEvent.change(business, { target: { value: 'Reliability Onboarding QA 2' } });
    expect(next).toBeDisabled();

    fireEvent.change(owner, { target: { value: 'Reliability Onboarding Owner 2' } });
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(screen.getByRole('button', { name: 'Next — Choose Plan' })).toBeInTheDocument();
  });

  it('keeps Next disabled when the DOM value is set without an onChange', () => {
    render(<RegisterForm />);
    const next = screen.getByRole('button', { name: 'Next — Account Details' });
    const business = screen.getByPlaceholderText(/El-Shaddai Supermarket/i) as HTMLInputElement;
    const owner = screen.getByPlaceholderText(/Kingsley Atakorah/i) as HTMLInputElement;

    business.value = 'Reliability Onboarding QA 2';
    owner.value = 'Reliability Onboarding Owner 2';
    expect(business.value).toBe('Reliability Onboarding QA 2');
    expect(owner.value).toBe('Reliability Onboarding Owner 2');
    expect(next).toBeDisabled();
  });
});
