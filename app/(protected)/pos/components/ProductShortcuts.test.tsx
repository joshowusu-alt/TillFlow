import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProductShortcuts from './ProductShortcuts';
import ResponsiveModal from '@/components/ResponsiveModal';
import { savePosShortcutsAction } from '@/app/actions/pos-shortcuts';
vi.mock('@/app/actions/pos-shortcuts', () => ({ savePosShortcutsAction: vi.fn() }));
const product = { id: 'p1', name: 'Blue pen', sku: 'PEN-BLUE', barcode: null, sellingPriceBasePence: 200, vatRateBps: 0, isTaxable: false, promoBuyQty: 0, promoGetQty: 0, categoryName: 'Stationery', onHandBase: 3, units: [] };
const layout = { screens: [{ id: 'main', name: 'Stationery', productIds: ['p1'] }] };
const select = vi.fn(); const loaded = vi.fn();
const props = { businessId: 'b1', storeId: 's1', currency: 'GHS', products: [product], onProductLoaded: loaded, onSelect: select, getAvailable: () => 3 };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ layout, revision: JSON.stringify(layout), canManage: true, products: [product] }) })); });
afterEach(() => vi.unstubAllGlobals());
it('adds from a screen, preserves stock gates, and disables unavailable products', async () => {
  const { rerender } = render(<ProductShortcuts {...props} />);
  const button = await screen.findByRole('button', { name: /Blue pen/ });
  await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); expect(select).toHaveBeenCalledWith(product);
  rerender(<ProductShortcuts {...props} getAvailable={() => 0} />); expect(button).toBeDisabled(); expect(screen.getByText('Out of stock')).toBeInTheDocument();
});
it('keeps draft edits out of selling and cancels without writing', async () => {
  render(<ProductShortcuts {...props} />); fireEvent.click(await screen.findByRole('button', { name: 'Manage shortcuts' }));
  fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByText('Discard your changes?')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Screen name')).toHaveValue('Changed');
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.getByRole('button', { name: 'Stationery' })).toBeInTheDocument(); expect(savePosShortcutsAction).not.toHaveBeenCalled();
});
it('shows a save conflict and retains the unsaved editor', async () => {
  vi.mocked(savePosShortcutsAction).mockResolvedValue({ success: false, error: 'Changed on another till' });
  render(<ProductShortcuts {...props} />); fireEvent.click(await screen.findByRole('button', { name: 'Manage shortcuts' })); fireEvent.click(screen.getByRole('button', { name: 'Save shortcuts' }));
  expect(await screen.findByText('Changed on another till')).toBeInTheDocument(); expect(screen.getByLabelText('Screen name')).toBeInTheDocument();
});
it('uses only branch-scoped cached IDs offline and offers no management controls', async () => {
  localStorage.setItem('pos.shortcuts.v1.b1.s1', JSON.stringify(layout));
  vi.mocked(fetch).mockRejectedValue(new Error('offline'));
  render(<ProductShortcuts {...props} />);
  const button = await screen.findByRole('button', { name: /Blue pen/ }); await waitFor(() => expect(button).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'Manage shortcuts' })).not.toBeInTheDocument();
  await act(async () => { window.dispatchEvent(new Event('offline')); }); fireEvent.click(button); expect(select).toHaveBeenCalledWith(product);
});

it('keeps the draft and input focus through typing, backdrop clicks and viewport resize', async () => {
  render(<ProductShortcuts {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Manage shortcuts' }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  const input = screen.getByLabelText('Screen name');
  input.focus();
  fireEvent.change(input, { target: { value: 'B' } });
  const dialog = screen.getByRole('dialog');
  const backdrop = dialog.parentElement?.previousElementSibling;
  expect(backdrop).toBeInstanceOf(HTMLButtonElement);
  fireEvent.click(backdrop!);
  await act(async () => {
    window.dispatchEvent(new Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 25));
  });
  expect(dialog).toBeVisible();
  expect(input).toHaveValue('B');
  expect(input).toHaveFocus();
});

it('closes an unchanged draft without asking', async () => {
  render(<ProductShortcuts {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Manage shortcuts' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('asks before removing a screen and its buttons', async () => {
  render(<ProductShortcuts {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Manage shortcuts' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove screen' }));
  expect(screen.getByText("Remove the screen 'Stationery' and its buttons?")).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
  expect(screen.getByLabelText('Screen name')).toHaveValue('Stationery');
  fireEvent.click(screen.getByRole('button', { name: 'Remove screen' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(screen.queryByLabelText('Screen name')).not.toBeInTheDocument();
  expect(savePosShortcutsAction).not.toHaveBeenCalled();
});

it('focuses the empty name and blocks saving', async () => {
  render(<ProductShortcuts {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Manage shortcuts' }));
  const input = screen.getByPlaceholderText('e.g. Drinks');
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.queryByText('Unnamed screen')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save shortcuts' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Give this screen a name');
  expect(input).toHaveFocus();
  expect(savePosShortcutsAction).not.toHaveBeenCalled();
});

it('preserves default backdrop dismissal for other responsive modals', () => {
  const onClose = vi.fn();
  render(<ResponsiveModal open onClose={onClose} ariaLabel="Other modal">Other content</ResponsiveModal>);
  const backdrop = screen.getByRole('dialog').parentElement?.previousElementSibling;
  expect(backdrop).toBeInstanceOf(HTMLButtonElement);
  fireEvent.click(backdrop!);
  expect(onClose).toHaveBeenCalledOnce();
});
