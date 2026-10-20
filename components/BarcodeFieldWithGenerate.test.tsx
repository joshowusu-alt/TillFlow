import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/app/actions/products', () => ({ generateBarcodeAction: vi.fn() }));
vi.mock('./BarcodeScanInput', () => ({ default: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => <input aria-label="Barcode" value={value} onChange={event => onChange(event.target.value)} /> }));
import BarcodeFieldWithGenerate from './BarcodeFieldWithGenerate';
it('retains the saved internal barcode print path after reopening a product', () => {
  render(<BarcodeFieldWithGenerate productId="product-1" defaultValue="TFTILLFL000002" />);
  expect(screen.getByRole('link', { name: 'Barcode saved — print this product’s label' })).toHaveAttribute('href', '/products/labels?select=product-1');
});
it('does not call an unsaved replacement a saved barcode', () => {
  render(<BarcodeFieldWithGenerate productId="product-2" defaultValue="TFTILLFL000003" />);
  fireEvent.change(screen.getByLabelText('Barcode'), { target: { value: 'different' } });
  expect(screen.queryByRole('link', { name: 'Barcode saved — print this product’s label' })).toBeNull();
});
