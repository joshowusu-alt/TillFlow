import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const switchOperationalStoreAction = vi.fn(async (_formData: FormData) => undefined);
const switchOperationalStoreResultAction = vi.fn(
  async (_formData: FormData): Promise<{ success: true } | { success: false; error: string }> => ({ success: true }),
);

vi.mock('next/navigation', () => ({
  usePathname: () => '/expenses',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/app/actions/operational-store', () => ({
  switchOperationalStoreAction: (formData: FormData) => switchOperationalStoreAction(formData),
  switchOperationalStoreResultAction: (formData: FormData) => switchOperationalStoreResultAction(formData),
}));

import OperationalStoreSwitcher, { SWITCH_NETWORK_FAILURE_MSG } from './OperationalStoreSwitcher';

const stores = [
  { id: 'store-a', name: 'Walkthrough Store A' },
  { id: 'store-b', name: 'Walkthrough Store B' },
];

describe('OperationalStoreSwitcher', () => {
  afterEach(() => {
    cleanup();
    switchOperationalStoreAction.mockClear();
    switchOperationalStoreResultAction.mockClear();
    switchOperationalStoreResultAction.mockImplementation(async () => ({ success: true }));
    window.localStorage.clear();
  });

  it('server-renders the select disabled and enables it only once hydrated', async () => {
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(
      <OperationalStoreSwitcher stores={stores} selectedStoreId={null} selectedStoreName={null} canSwitch />,
    );
    // Pre-hydration a native pick would show the new branch without switching; keep it inert.
    expect(html).toMatch(/<select[^>]*\sdisabled=""/);
    expect(html).not.toContain('data-hydrated');

    render(<OperationalStoreSwitcher stores={stores} selectedStoreId={null} selectedStoreName={null} canSwitch />);
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;
    await waitFor(() => expect(select.disabled).toBe(false));
    expect(select.getAttribute('data-hydrated')).toBe('1');
    expect(select.value).toBe('');
  });

  it('submits the intended branch while the header keeps showing the authoritative one', async () => {
    // Never resolve: the cookie has not landed yet.
    switchOperationalStoreResultAction.mockImplementation(() => new Promise(() => {}));
    render(
      <OperationalStoreSwitcher
        stores={stores}
        selectedStoreId="store-a"
        selectedStoreName="Walkthrough Store A"
        canSwitch
      />,
    );
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'store-b' } });

    await waitFor(() => expect(switchOperationalStoreResultAction).toHaveBeenCalledTimes(1));
    const submitted = switchOperationalStoreResultAction.mock.calls[0][0];
    expect(submitted.get('storeId')).toBe('store-b');
    expect(submitted.get('intendedStoreId')).toBe('store-b');
    expect(submitted.get('returnTo')).toBe('/expenses');
    // The no-JS form action is not what runs when JS handles the submit.
    expect(switchOperationalStoreAction).not.toHaveBeenCalled();

    // Header still shows the server-authoritative branch until the cookie lands.
    expect(select.value).toBe('store-a');
    expect(select.disabled).toBe(true);
    expect(select.getAttribute('data-operational-store')).toBe('store-a');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Switching to Walkthrough Store B');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // The other-tab signal names the intended branch.
    expect(window.localStorage.getItem('tillflow_operational_store_signal')).toContain('store-b');
  });

  it('keeps the dialog and the intended branch when the switch POST fails, and Retry resubmits it', async () => {
    switchOperationalStoreResultAction.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(
      <OperationalStoreSwitcher stores={stores} selectedStoreId="store-a" selectedStoreName="Store A" canSwitch />,
    );
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'store-b' } });

    await screen.findByText(SWITCH_NETWORK_FAILURE_MSG);
    // Still pending on the old authoritative branch: no fail-open, no error boundary.
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Switching to Walkthrough Store B');
    expect(select.getAttribute('data-operational-store')).toBe('store-a');
    expect(select.disabled).toBe(true);

    // Other tabs are handed back the branch that is still authoritative.
    expect(window.localStorage.getItem('tillflow_operational_store_signal')).toContain('store-a');

    const retry = screen.getByRole('button', { name: /retry switch/i });
    expect(retry).not.toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(switchOperationalStoreResultAction).toHaveBeenCalledTimes(2));
    expect(switchOperationalStoreResultAction.mock.calls[1][0].get('storeId')).toBe('store-b');
    // Retry re-announces the intended branch while pending again.
    expect(window.localStorage.getItem('tillflow_operational_store_signal')).toContain('store-b');
  });

  it('shows a server rejection inside the dialog instead of throwing', async () => {
    switchOperationalStoreResultAction.mockImplementation(async () => ({
      success: false,
      error: 'That branch is not available for this business.',
    }));
    render(
      <OperationalStoreSwitcher stores={stores} selectedStoreId="store-a" selectedStoreName="Store A" canSwitch />,
    );
    fireEvent.change(screen.getByLabelText('Active branch'), { target: { value: 'store-b' } });
    await screen.findByText('That branch is not available for this business.');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('clears the dialog only once the authoritative branch equals the intended one', async () => {
    switchOperationalStoreResultAction.mockImplementation(() => new Promise(() => {}));
    const view = render(
      <OperationalStoreSwitcher stores={stores} selectedStoreId="store-a" selectedStoreName="Store A" canSwitch />,
    );
    fireEvent.change(screen.getByLabelText('Active branch'), { target: { value: 'store-b' } });
    await screen.findByRole('alertdialog');

    // Some other branch landing does not clear it.
    view.rerender(
      <OperationalStoreSwitcher stores={stores} selectedStoreId="store-a" selectedStoreName="Store A" canSwitch />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    view.rerender(
      <OperationalStoreSwitcher stores={stores} selectedStoreId="store-b" selectedStoreName="Store B" canSwitch />,
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(select.getAttribute('data-operational-store')).toBe('store-b');
  });

  it('blocks pointer and submit interaction outside the switching dialog while pending', async () => {
    switchOperationalStoreResultAction.mockImplementation(() => new Promise(() => {}));
    render(
      <OperationalStoreSwitcher stores={stores} selectedStoreId="store-a" selectedStoreName="Store A" canSwitch />,
    );
    const select = screen.getByLabelText('Active branch') as HTMLSelectElement;
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
