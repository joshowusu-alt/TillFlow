import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  PosDeferredApply,
  PosProgressiveShell,
} from '@/components/pos/PosProgressiveShell';

vi.mock('@/app/(protected)/pos/PosClient', () => ({
  default: function MockPosClient(props: {
    products: unknown[];
    customers: unknown[];
    tills: unknown[];
    checkoutExtrasReady?: boolean;
    customersUnavailable?: boolean;
  }) {
    return (
      <div>
        <div data-testid="product-count">{props.products.length}</div>
        <div data-testid="customer-count">{props.customers.length}</div>
        <div data-testid="till-count">{props.tills.length}</div>
        <div data-testid="checkout-ready">{String(Boolean(props.checkoutExtrasReady))}</div>
        <div data-testid="customers-unavailable">{String(Boolean(props.customersUnavailable))}</div>
      </div>
    );
  },
}));

const business = {
  id: 'b1',
  currency: 'GHS',
  vatEnabled: false,
};

const store = { id: 's1', name: 'Main' };

const products = [
  {
    id: 'p1',
    name: 'Rice',
    barcode: '123',
    sellingPriceBasePence: 1000,
    vatRateBps: 0,
    promoBuyQty: 0,
    promoGetQty: 0,
    categoryId: null,
    categoryName: null,
    imageUrl: null,
    units: [
      {
        id: 'u1',
        name: 'ea',
        pluralName: 'ea',
        conversionToBase: 1,
        isBaseUnit: true,
        sellingPricePence: 1000,
        defaultCostPence: 500,
      },
    ],
    onHandBase: 5,
  },
];

describe('PosProgressiveShell', () => {
  it('exposes products for selling before deferred checkout extras arrive', async () => {
    render(
      <PosProgressiveShell business={business} store={store} products={products}>
        <div data-testid="deferred-slot" />
      </PosProgressiveShell>,
    );

    expect(screen.getByTestId('product-count')).toHaveTextContent('1');
    expect(screen.getByTestId('customer-count')).toHaveTextContent('0');
    expect(screen.getByTestId('till-count')).toHaveTextContent('0');
    expect(screen.getByTestId('checkout-ready')).toHaveTextContent('false');

    render(
      <PosProgressiveShell business={business} store={store} products={products}>
        <PosDeferredApply
          payload={{
            tills: [{ id: 't1', name: 'Till 1' }],
            openShiftTillIds: ['t1'],
            customers: [{ id: 'c1', name: 'Ama', creditLimitPence: 0, loyaltyPointsBalance: 0 }],
            units: [],
            categories: [],
          }}
        />
      </PosProgressiveShell>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('checkout-ready').some((node) => node.textContent === 'true')).toBe(true);
    });
  });

  it('keeps cash path usable when customers are unavailable', async () => {
    render(
      <PosProgressiveShell business={business} store={store} products={products}>
        <PosDeferredApply
          payload={{
            tills: [{ id: 't1', name: 'Till 1' }],
            openShiftTillIds: ['t1'],
            customers: [],
            units: [],
            categories: [],
            customersUnavailable: true,
            checkoutUnavailable: false,
          }}
        />
      </PosProgressiveShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('customers-unavailable')).toHaveTextContent('true');
      expect(screen.getByTestId('product-count')).toHaveTextContent('1');
      expect(screen.getByTestId('checkout-ready')).toHaveTextContent('true');
    });
  });

  it('treats failed checkout load as unavailable rather than ready-with-empty-tills', async () => {
    render(
      <PosProgressiveShell business={business} store={store} products={products}>
        <PosDeferredApply
          payload={{
            tills: [],
            openShiftTillIds: [],
            customers: [],
            units: [],
            categories: [],
            checkoutUnavailable: true,
          }}
        />
      </PosProgressiveShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('checkout-ready')).toHaveTextContent('false');
    });
  });
});
