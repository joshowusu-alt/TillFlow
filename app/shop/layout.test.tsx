import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ShopLayout from './layout';

describe('ShopLayout', () => {
  it('renders a skip link for shop pages', () => {
    render(
      <ShopLayout>
        <div>Shop content</div>
      </ShopLayout>,
    );

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#shop-main');
    expect(screen.getByText('Shop content')).toBeInTheDocument();
  });
});
