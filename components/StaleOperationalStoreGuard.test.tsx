import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StaleOperationalStoreGuard from './StaleOperationalStoreGuard';
import { OPERATIONAL_STORE_SIGNAL_KEY } from '@/lib/reliability/operational-store-sync';

describe('StaleOperationalStoreGuard', () => {
  it('blocks the stale tab after another tab switches to Store B', () => {
    window.localStorage.setItem(
      OPERATIONAL_STORE_SIGNAL_KEY,
      JSON.stringify({ id: 'store-b', name: 'Walkthrough Store B', ts: 1 }),
    );
    render(<StaleOperationalStoreGuard storeId="store-a" storeName="Walkthrough Store A" />);
    expect(screen.getByRole('alertdialog')).toHaveAttribute('data-stale-operational-store', 'store-b');
    expect(screen.getByText(/Branch changed in another tab/i)).toBeInTheDocument();
    expect(screen.getByText(/Walkthrough Store A/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload this tab/i })).toBeInTheDocument();
  });

  it('stays silent when this tab already matches Store B', () => {
    window.localStorage.setItem(
      OPERATIONAL_STORE_SIGNAL_KEY,
      JSON.stringify({ id: 'store-b', name: 'Walkthrough Store B', ts: 1 }),
    );
    const { container } = render(
      <StaleOperationalStoreGuard storeId="store-b" storeName="Walkthrough Store B" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
