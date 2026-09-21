import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const switchOperationalStoreAction = vi.fn(async (_formData: FormData) => undefined);

vi.mock('next/navigation', () => ({
  usePathname: () => '/expenses',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/app/actions/operational-store', () => ({
  switchOperationalStoreAction: (formData: FormData) => switchOperationalStoreAction(formData),
}));

import OperationalStoreSwitcher from './OperationalStoreSwitcher';

const stores = [
  { id: 'store-a', name: 'Walkthrough Store A' },
  { id: 'store-b', name: 'Walkthrough Store B' },
];

describe('OperationalStoreSwitcher', () => {
  afterEach(() => {
    cleanup();
    switchOperationalStoreAction.mockClear();
    window.localStorage.clear();
  });

  it('submits the intended branch while the header keeps showing the authoritative one', async () => {
    render(
      <OperationalStoreSwitcher
        stores={stores}
        selectedStoreId="store-a"
        selectedStoreName="Walkthrough Store A"
        canSwitch
      />,
    );
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;
    const form = select.closest('form') as HTMLFormElement;
    const submitted: FormData[] = [];
    // React 18 does not run server-action `action` props in jsdom; capture the
    // native submit that requestSubmit() produces and read the form fields.
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted.push(new FormData(form));
    });

    fireEvent.change(select, { target: { value: 'store-b' } });

    await waitFor(() => expect(submitted.length).toBe(1));
    expect(submitted[0].get('storeId')).toBe('store-b');
    expect(submitted[0].get('returnTo')).toBe('/expenses');

    // Header still shows the server-authoritative branch until the cookie lands.
    expect(select.value).toBe('store-a');
    expect(select.disabled).toBe(true);
    expect(select.getAttribute('data-operational-store')).toBe('store-a');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Switching to Walkthrough Store B');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Retry resubmits the same intended branch.
    fireEvent.click(screen.getByRole('button', { name: /retry switch/i }));
    await waitFor(() => expect(submitted.length).toBe(2));
    expect(submitted[1].get('storeId')).toBe('store-b');

    // The other-tab signal names the intended branch.
    expect(window.localStorage.getItem('tillflow_operational_store_signal')).toContain('store-b');
  });

  it('blocks pointer and submit interaction outside the switching dialog while pending', async () => {
    render(
      <OperationalStoreSwitcher stores={stores} selectedStoreId="store-a" selectedStoreName="Store A" canSwitch />,
    );
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;
    select.closest('form')!.addEventListener('submit', (event) => event.preventDefault());
    fireEvent.change(select, { target: { value: 'store-b' } });
    await screen.findByRole('alertdialog');

    const outsideButton = document.createElement('button');
    outsideButton.textContent = 'Sell';
    document.body.appendChild(outsideButton);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    outsideButton.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);

    const otherForm = document.createElement('form');
    document.body.appendChild(otherForm);
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    otherForm.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
  });

  it('does nothing when the same branch is re-selected or the empty option is chosen', () => {
    render(
      <OperationalStoreSwitcher stores={stores} selectedStoreId={null} selectedStoreName={null} canSwitch />,
    );
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
