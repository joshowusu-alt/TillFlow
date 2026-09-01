import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ProductCreateHashOpener, {
  PRODUCT_CREATE_HASH_ID,
  applyProductCreateHash,
} from './ProductCreateHashOpener';

function ProductCreateFixture({ emptyCatalogue = true }: { emptyCatalogue?: boolean }) {
  return (
    <div>
      <ProductCreateHashOpener />
      <a href={`#${PRODUCT_CREATE_HASH_ID}`}>Add product</a>
      <details data-testid="product-create-details">
        <summary id={PRODUCT_CREATE_HASH_ID}>Add product</summary>
        <form>
          <h2>Add product</h2>
          <label>
            Name
            <input name="name" />
          </label>
        </form>
      </details>
      {emptyCatalogue ? (
        <div className="lg:hidden">
          <div className="text-sm font-semibold text-ink">No products yet.</div>
        </div>
      ) : null}
    </div>
  );
}

function clearHash() {
  if (window.location.hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

afterEach(() => {
  clearHash();
});

describe('ProductCreateHashOpener', () => {
  it('leaves the details closed when there is no hash', () => {
    render(<ProductCreateFixture />);
    expect(screen.getByTestId('product-create-details')).not.toHaveAttribute('open');
    expect(applyProductCreateHash(document)).toBe(false);
  });

  it('opens the details and reveals the form on initial #product-create', async () => {
    window.history.replaceState(null, '', `/products#${PRODUCT_CREATE_HASH_ID}`);
    render(<ProductCreateFixture />);
    await waitFor(() => {
      expect(screen.getByTestId('product-create-details')).toHaveAttribute('open');
    });
    expect(screen.getByRole('heading', { name: 'Add product' })).toBeVisible();
    expect(screen.getByRole('textbox')).toBeVisible();
    expect(screen.getByText('No products yet.')).toBeInTheDocument();
  });

  it('opens the details on hashchange after the page has loaded', async () => {
    render(<ProductCreateFixture />);
    expect(screen.getByTestId('product-create-details')).not.toHaveAttribute('open');

    await act(async () => {
      window.location.hash = PRODUCT_CREATE_HASH_ID;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('product-create-details')).toHaveAttribute('open');
    });
    expect(screen.getByRole('textbox')).toBeVisible();
  });

  it('opens the details when the in-page Add product hash link is clicked', async () => {
    render(<ProductCreateFixture />);
    fireEvent.click(screen.getByRole('link', { name: 'Add product' }));
    await act(async () => {
      window.location.hash = PRODUCT_CREATE_HASH_ID;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('product-create-details')).toHaveAttribute('open');
    });
    expect(screen.getByRole('textbox')).toBeVisible();
  });

  it('does not let the empty catalogue copy conceal the form once the hash is applied', () => {
    window.history.replaceState(null, '', `/products#${PRODUCT_CREATE_HASH_ID}`);
    const { container } = render(<ProductCreateFixture />);
    applyProductCreateHash(container);
    const details = screen.getByTestId('product-create-details');
    expect(details).toHaveAttribute('open');
    const form = details.querySelector('form');
    const empty = screen.getByText('No products yet.');
    expect(form).toBeTruthy();
    expect(form?.contains(empty)).toBe(false);
    expect(details.contains(empty)).toBe(false);
  });
});
