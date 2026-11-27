import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReceiptClient from './ReceiptClient';
import { ensureQzConnection, printRawEscPos } from '@/lib/qz';

vi.mock('@/lib/qz', () => ({ ensureQzConnection: vi.fn(), printRawEscPos: vi.fn() }));
vi.mock('@/lib/print-telemetry', () => ({ reportPrintEvent: vi.fn() }));
vi.mock('@/components/DeleteFoodSaleButton', () => ({ default: () => null }));

const props = {
  business: { id: 'fixture', name: 'Demo business', currency: 'GHS', vatEnabled: true, receiptTemplate: 'THERMAL_80', printMode: 'DIRECT_ESC_POS' },
  store: { id: 'main', name: 'Main' }, cashier: { name: 'Cashier' },
  customer: { name: 'Customer', phone: '0000000000' },
  invoice: { id: 'fixture-sale', createdAt: '2026-11-27T12:00:00Z', subtotalPence: 3000, vatPence: 500, totalPence: 3500, changeDuePence: 1500 },
  lines: [{ name: 'Rice', qtyLabel: '1', unitPricePence: 3500, lineTotalPence: 3500, displayDiscountPence: 100 }],
  payments: [{ method: 'CASH', amountPence: 3500 }],
};

beforeEach(() => {
  vi.spyOn(window, 'print').mockImplementation(() => {});
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla Windows Chrome');
  vi.mocked(ensureQzConnection).mockRejectedValue(new Error('QZ Tray unavailable'));
  vi.mocked(printRawEscPos).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Sale Complete printing', () => {
  it.each(['iPhone Safari', 'iPad Safari', 'Android Chrome'])('uses browser printing without QZ on %s', async userAgent => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    render(<ReceiptClient {...props} />);
    expect(ensureQzConnection).not.toHaveBeenCalled();
    expect(screen.queryByText(/Direct print unavailable/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry Direct Print' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Print Receipt' }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('offers one fallback and desktop retry only after failure, then clears it after success', async () => {
    render(<ReceiptClient {...props} />);
    await screen.findByText(/Direct print unavailable/);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings#printing');
    expect(screen.queryByText(/Direct print enabled|QZ Tray is not running/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Print Receipt' }));
    expect(window.print).toHaveBeenCalledTimes(1);
    vi.mocked(ensureQzConnection).mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Retry Direct Print' }));
    await waitFor(() => expect(printRawEscPos).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Direct print unavailable/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry Direct Print' })).toBeNull();
  });

  it('keeps printed labels bold, with no colored or translucent text classes', () => {
    const { container } = render(<ReceiptClient {...props} business={{ ...props.business, printMode: 'BROWSER_DIALOG' }} />);
    const content = container.querySelector('.receipt-content')!;
    expect(content).toBeTruthy();
    for (const element of content.querySelectorAll('[class]')) {
      if (element.closest('.no-print')) continue;
      expect(element.className).not.toMatch(/text-(?:black\/|slate-|gray-|emerald-|amber-|yellow-|white|red-|green-)|opacity-|font-(?:thin|light|extralight)/);
    }
    for (const label of ['Sales Receipt', 'Receipt Details', 'Cashier', 'Items', 'Totals', 'Payments', 'Net subtotal', 'Paid (cash)']) {
      const elements = Array.from(content.querySelectorAll('.font-bold')).filter(element => element.textContent === label);
      expect(elements.length, label).toBeGreaterThan(0);
    }
    expect(ensureQzConnection).not.toHaveBeenCalled();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
