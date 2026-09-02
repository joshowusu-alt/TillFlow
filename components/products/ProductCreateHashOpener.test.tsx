import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
        <div>
          <h2>Add product</h2>
          <p>Start with the items you sell every day.</p>
          <form>
            <label>
              Name
              <input name="name" />
            </label>
            <label>
              SKU
              <input name="sku" />
            </label>
            <button type="submit">Create product</button>
          </form>
        </div>
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
    const name = document.querySelector('input[name="name"]') as HTMLInputElement | null;
    expect(name).toBeTruthy();
    expect(name).toBeVisible();
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
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible();
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
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible();
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

  it('matches hosted markup: Add product h2 is a details sibling of form, not inside form', async () => {
    window.history.replaceState(null, '', `/products#${PRODUCT_CREATE_HASH_ID}`);
    render(<ProductCreateFixture />);
    const details = screen.getByTestId('product-create-details');

    await waitFor(() => {
      expect(details).toHaveAttribute('open');
    });

    const heading = within(details).getByRole('heading', { name: 'Add product' });
    const form = details.querySelector('form');
    expect(form).toBeTruthy();
    expect(form?.contains(heading)).toBe(false);
    expect(within(form as HTMLElement).queryByRole('heading', { name: 'Add product' })).toBeNull();
    expect(within(details).getByRole('heading', { name: 'Add product' })).toBe(heading);

    const name = form?.querySelector('input[name="name"]') as HTMLInputElement | null;
    expect(name).toBeTruthy();
    expect(name).toBeVisible();
    expect(name).not.toBeDisabled();
    await waitFor(() => {
      expect(document.activeElement).toBe(name);
    });

    const page = readFileSync(join(process.cwd(), 'app/(protected)/products/page.tsx'), 'utf8');
    const headingIdx = page.indexOf('<h2 className="text-lg font-display font-semibold">Add product</h2>');
    const formIdx = page.indexOf('<ProductCreateFormEnhancer');
    expect(headingIdx).toBeGreaterThan(0);
    expect(formIdx).toBeGreaterThan(headingIdx);
  });
});
