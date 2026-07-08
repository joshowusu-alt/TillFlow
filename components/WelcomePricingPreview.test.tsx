import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import WelcomePricingPreview, { type WelcomePlanPreview } from '@/components/WelcomePricingPreview';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// jsdom does not implement matchMedia or IntersectionObserver; RevealOnScroll
// (used for the per-card reveal stagger) needs both to mount without error.
beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const plans: WelcomePlanPreview[] = [
  { name: 'Starter', monthlyPrice: 199, note: 'Starter note', bullets: ['a'] },
  { name: 'Growth', monthlyPrice: 349, note: 'Growth note', featured: true, bullets: ['b'] },
  { name: 'Pro', monthlyPrice: 699, note: 'Pro note', bullets: ['c'] },
];

describe('WelcomePricingPreview monthly/yearly toggle', () => {
  it('shows all three monthly prices by default', () => {
    render(<WelcomePricingPreview plans={plans} />);

    expect(screen.getByTestId('plan-price-starter')).toHaveTextContent('GH₵199');
    expect(screen.getByTestId('plan-price-growth')).toHaveTextContent('GH₵349');
    expect(screen.getByTestId('plan-price-pro')).toHaveTextContent('GH₵699');
  });

  it('updates Starter, Growth and Pro together when switching to yearly', () => {
    render(<WelcomePricingPreview plans={plans} />);

    fireEvent.click(screen.getByRole('button', { name: 'Yearly' }));

    // Regression guard: a prior build only updated some tiers because the
    // toggle handler referenced stale per-tier IDs. This must move all three.
    expect(screen.getByTestId('plan-price-starter')).toHaveTextContent(`GH₵${(199 * 10).toLocaleString('en-GH')}`);
    expect(screen.getByTestId('plan-price-growth')).toHaveTextContent(`GH₵${(349 * 10).toLocaleString('en-GH')}`);
    expect(screen.getByTestId('plan-price-pro')).toHaveTextContent(`GH₵${(699 * 10).toLocaleString('en-GH')}`);
  });

  it('reverts Starter, Growth and Pro together when switching back to monthly', () => {
    render(<WelcomePricingPreview plans={plans} />);

    fireEvent.click(screen.getByRole('button', { name: 'Yearly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));

    expect(screen.getByTestId('plan-price-starter')).toHaveTextContent('GH₵199');
    expect(screen.getByTestId('plan-price-growth')).toHaveTextContent('GH₵349');
    expect(screen.getByTestId('plan-price-pro')).toHaveTextContent('GH₵699');
  });

  it('shows savings badges only while yearly is selected, for every tier', () => {
    render(<WelcomePricingPreview plans={plans} />);

    expect(screen.queryByText(/Save GH₵/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yearly' }));

    const savingsBadges = screen.getAllByText(/Save GH₵/);
    expect(savingsBadges).toHaveLength(3);
    expect(screen.getByText(`Save ${'GH₵' + (199 * 2).toLocaleString('en-GH')} yearly`)).toBeInTheDocument();
    expect(screen.getByText(`Save ${'GH₵' + (349 * 2).toLocaleString('en-GH')} yearly`)).toBeInTheDocument();
    expect(screen.getByText(`Save ${'GH₵' + (699 * 2).toLocaleString('en-GH')} yearly`)).toBeInTheDocument();
  });

  it('keeps plan-specific CTA labels', () => {
    render(<WelcomePricingPreview plans={plans} />);

    expect(screen.getByRole('link', { name: 'Try Starter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Growth trial' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try Pro' })).toBeInTheDocument();
  });
});
