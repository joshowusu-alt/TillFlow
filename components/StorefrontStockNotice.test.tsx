import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StorefrontStockNotice from './StorefrontStockNotice';

describe('storefront stock notice', () => {
  it('hides the notice when a food business has no sold-out items', () => {
    const { container } = render(<StorefrontStockNotice foodBusiness count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains what the hide button does and where to mark dishes sold out', () => {
    render(<StorefrontStockNotice foodBusiness count={1} />);
    expect(screen.getByText(/One item you sell online is out of stock/)).toHaveTextContent('To mark a dish as sold out, open the dish.');
  });

  it('keeps the existing empty-stock message for retail', () => {
    render(<StorefrontStockNotice foodBusiness={false} count={0} />);
    expect(screen.getByText('No published products are currently out of stock.')).toBeVisible();
  });
});
