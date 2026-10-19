import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PurchaseFormClient from './PurchaseFormClient';
vi.mock('next/navigation', () => { const params = new URLSearchParams(); return { useSearchParams: () => params }; });
vi.mock('react-dom', async () => ({ ...await vi.importActual<typeof import('react-dom')>('react-dom'), useFormStatus: () => ({ pending: false }) }));
vi.mock('@/app/actions/purchases', () => ({ createPurchaseAction: vi.fn() }));
vi.mock('@/app/actions/products', () => ({ quickCreateProductAction: vi.fn() }));
vi.mock('@/app/(protected)/pos/components/CameraScanner', () => ({ default: () => null }));
beforeEach(() => localStorage.clear());
function mount() {
  render(<PurchaseFormClient storeId="scanner-demo" currency="GHS" vatEnabled={false} suppliers={[]} units={[{ id: 'each', name: 'Book' }]} products={['X','Y'].map(id => ({ id, name: `Book A · Publisher ${id}`, barcode: `00123${id}`, additionalBarcodes: [`ALT-${id}`], defaultCostBasePence: 8000, sellingPriceBasePence: 10000, vatRateBps: 0, units: [{ id: 'each', name: 'Book', conversionToBase: 1, isBaseUnit: true }] }))} />);
}
it('physical scanner Enter selects the matching publisher through its alternate code', () => {
  mount();
  const field = screen.getByLabelText('Scan with USB/Bluetooth reader');
  fireEvent.change(field, { target: { value: 'ALT-Y' } });
  expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(false);
  expect(screen.getByDisplayValue('Book A · Publisher Y')).toBeInTheDocument();
  expect(field).toHaveValue('');
});
it('unknown scans open explicit creation and preserve the scanned identifier', () => {
  mount();
  const field = screen.getByLabelText('Scan with USB/Bluetooth reader');
  fireEvent.change(field, { target: { value: '009999' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(screen.getByText(/No product found for that barcode/)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'New product barcode — scan with USB/Bluetooth reader' })).toHaveValue('009999');
});
