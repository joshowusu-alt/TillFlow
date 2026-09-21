import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('blocks page buttons and form submits but keeps its own Reload button clickable', () => {
    window.localStorage.setItem(
      OPERATIONAL_STORE_SIGNAL_KEY,
      JSON.stringify({ id: 'store-b', name: 'Walkthrough Store B', ts: 1 }),
    );
    let pageClicks = 0;
    let submits = 0;
    let reloads = 0;
    const originalReload = window.location.reload;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: () => { reloads += 1; } },
    });
    render(
      <div>
        <form onSubmit={(e) => { e.preventDefault(); submits += 1; }}>
          <button type="submit" onClick={() => { pageClicks += 1; }}>Record expense</button>
        </form>
        <StaleOperationalStoreGuard storeId="store-a" storeName="Walkthrough Store A" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Record expense/i }));
    fireEvent.submit(screen.getByRole('button', { name: /Record expense/i }).closest('form')!);
    expect(pageClicks).toBe(0);
    expect(submits).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /Reload this tab/i }));
    expect(reloads).toBe(1);
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload: originalReload } });
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
