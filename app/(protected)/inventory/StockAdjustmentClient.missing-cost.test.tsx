import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StockAdjustmentClient from './StockAdjustmentClient';

vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/app/actions/inventory', () => ({ createStockAdjustmentAction: vi.fn() }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormStatus: () => ({ pending: false }) }));

const unit = { id: 'piece', name: 'piece', pluralName: 'pieces', conversionToBase: 1, isBaseUnit: true };
const neverStocked = { id: 'p-new', name: '12', units: [unit], onHandBase: 0, avgCostBasePence: 0 };
const stocked = { id: 'p-old', name: '10 BASIC STEPS', units: [unit], onHandBase: 1, avgCostBasePence: 2000 };

function renderIncrease(products: typeof neverStocked[], initialProductId: string) {
  render(
    <StockAdjustmentClient storeId="store" storeName="Main Branch" currency="GHS" products={products}
      phase1Enabled={false} phase2Enabled actorRole="OWNER" initialProductId={initialProductId} />,
  );
}

describe('Record increase for a product with no stock or cost yet', () => {
  it('explains the opening-stock route and blocks the submit', () => {
    renderIncrease([neverStocked, stocked], 'p-new');
    const notice = screen.getByTestId('increase-needs-opening-stock');
    expect(notice).toHaveTextContent(/no stock or cost in TillFlow yet/i);
    expect(screen.getByRole('link', { name: /set opening stock/i })).toHaveAttribute('href', '/setup/opening-stock?productId=p-new');
    const submit = screen.getAllByRole('button', { name: /record increase/i }).find((b) => b.getAttribute('type') === 'submit')!;
    expect(submit).toBeDisabled();
  });

  it('keeps the normal flow for a product with an average cost', () => {
    renderIncrease([neverStocked, stocked], 'p-old');
    expect(screen.queryByTestId('increase-needs-opening-stock')).toBeNull();
    const submit = screen.getAllByRole('button', { name: /record increase/i }).find((b) => b.getAttribute('type') === 'submit')!;
    expect(submit).not.toBeDisabled();
  });
});
