import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PurchaseFormClient from './PurchaseFormClient';
vi.mock('next/navigation', () => { const params = new URLSearchParams(); return { useSearchParams: () => params }; });
vi.mock('react-dom', async () => ({ ...await vi.importActual<typeof import('react-dom')>('react-dom'), useFormStatus: () => ({ pending: false }) }));
vi.mock('@/app/actions/purchases', () => ({ createPurchaseAction: vi.fn() }));
vi.mock('@/app/actions/products', () => ({ quickCreateProductAction: vi.fn() }));
vi.mock('@/app/(protected)/pos/components/CameraScanner', () => ({ default: () => null }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
function mount() {
  return render(<PurchaseFormClient storeId="scanner-demo" currency="GHS" vatEnabled={false} suppliers={[]} units={[{ id: 'each', name: 'Book' }]} products={['X','Y'].map(id => ({ id, name: `Book A · Publisher ${id}`, barcode: `00123${id}`, additionalBarcodes: [`ALT-${id}`], defaultCostBasePence: 8000, sellingPriceBasePence: 10000, vatRateBps: 0, units: [{ id: 'each', name: 'Book', conversionToBase: 1, isBaseUnit: true }] }))} />);
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

it('starts unpaid, shows due dates only while money is owed and reveals payment controls when paying', () => {
  mount();
  const status = screen.getByLabelText('Payment Status');
  expect(status).toHaveValue('UNPAID');
  expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
  expect(screen.queryByLabelText('Where is the cash coming from?')).not.toBeInTheDocument();
  fireEvent.change(status, { target: { value: 'PAID' } });
  expect(screen.queryByLabelText('Due Date')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Where is the cash coming from?')).toBeInTheDocument();
  fireEvent.change(status, { target: { value: 'PART_PAID' } });
  expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
});

it('keeps a restored purchase identity across remounts and creates a new one only on discard', () => {
  localStorage.setItem('tillflow:purchase-draft:scanner-demo', JSON.stringify({
    version: 1, idempotencyKey: 'receipt-retry-original', supplierId: 'supplier-a',
    cart: [{ id: 'line-X', productId: 'X', unitId: 'each', qtyInUnit: 1, unitCostInput: '80' }],
  }));
  const mounted = mount();
  expect(document.querySelector('input[name="idempotencyKey"]')).toHaveValue('receipt-retry-original');
  expect(JSON.parse(localStorage.getItem('tillflow:purchase-draft:scanner-demo')!).idempotencyKey).toBe('receipt-retry-original');
  mounted.unmount();
  sessionStorage.clear(); // A new tab has no session identity; the draft must supply it.
  mount();
  expect(document.querySelector('input[name="idempotencyKey"]')).toHaveValue('receipt-retry-original');
  fireEvent.click(screen.getByRole('button', { name: /discard/i }));
  expect(document.querySelector('input[name="idempotencyKey"]')).not.toHaveValue('receipt-retry-original');
});
