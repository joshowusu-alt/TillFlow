import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AmendSaleClient from './AmendSaleClient';

vi.mock('@/app/actions/sales', () => ({
  amendSaleAction: vi.fn(),
}));

describe('AmendSaleClient', () => {
  it('lets a single-line sale remove and re-add the same product as a replacement', () => {
    render(
      <AmendSaleClient
        invoiceId="sale-1"
        lines={[
          {
            id: 'line-1',
            productId: 'out-oscar',
            productName: 'OUT/OSCAR / TIGERHEAD/HOLY MATCHES/VOLCANO',
            unitName: 'piece',
            qtyInUnit: 2,
            unitPricePence: 300,
            lineDiscountPence: 0,
            promoDiscountPence: 0,
            lineTotalPence: 600,
            lineVatPence: 0,
          },
        ]}
        totalPence={600}
        totalPaid={600}
        currency="GHS"
        availableProducts={[
          {
            id: 'out-oscar',
            name: 'OUT/OSCAR / TIGERHEAD/HOLY MATCHES/VOLCANO',
            barcode: '12345',
            sellingPriceBasePence: 300,
            categoryName: 'Matches',
            imageUrl: null,
            onHandBase: 40,
            units: [
              {
                id: 'unit-piece',
                name: 'piece',
                pluralName: 'pieces',
                conversionToBase: 1,
                isBaseUnit: true,
                sellingPricePence: 300,
                defaultCostPence: 190,
              },
            ],
          },
        ]}
      />,
    );

    const removeButton = screen.getByRole('button', { name: 'Remove' });
    expect(removeButton).not.toBeDisabled();

    fireEvent.click(removeButton);

    expect(screen.getByText(/Add at least one replacement item before you confirm this amendment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review & Confirm Amendment' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Add Items/i }));

    const searchInput = screen.getByPlaceholderText('Search products by name or barcode…');
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, {
      target: { value: 'OUT/OSCAR' },
    });

    const productButton = screen.getByRole('button', { name: /OUT\/OSCAR/i });
    fireEvent.click(productButton);

    expect(screen.getByRole('button', { name: 'Review & Confirm Amendment' })).not.toBeDisabled();
  });
});