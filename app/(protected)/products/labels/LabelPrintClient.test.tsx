import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/products/labels', useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/ui/use-list-state', () => ({ useListState: vi.fn() }));
vi.mock('@/lib/ui/list-state', () => ({ readListState: () => null }));
vi.mock('@/app/actions/labels', () => ({ generateLabelsHtmlAction: vi.fn() }));
vi.mock('@/components/PrintLabelsButton', () => ({ default: ({ selectedProducts }: { selectedProducts: unknown[] }) => <button disabled={!selectedProducts.length}>Print Labels</button> }));
import LabelPrintClient from './LabelPrintClient';
const product = { id: 'p', name: 'Fufu Powder', barcode: 'TFTILLFL000002', sku: null, sellingPriceBasePence: 1200, category: null, unit: 'piece' };
const props = { products: [product], categories: [], currency: 'GHS', defaultTemplate: 'PRODUCT_STICKER' as const, labelPrintMode: 'BROWSER_PDF' as const, labelPrinterName: null };
beforeEach(() => vi.clearAllMocks());
it('explains the empty selection and enables printing when the example is selected', () => {
  render(<LabelPrintClient {...props} />);
  expect(screen.getByText('Select products to print')).toBeInTheDocument();
  expect(screen.queryByText('Ready to print')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Print Labels' }).every(button => button.hasAttribute('disabled'))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Select Fufu Powder for printing' }));
  expect(screen.getByText('Ready to print')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Print Labels' }).every(button => !button.hasAttribute('disabled'))).toBe(true);
});
it('preselects the product from its direct Print label link', () => {
  render(<LabelPrintClient {...props} initialSelectedProductId="p" />);
  expect(screen.getByText('Ready to print')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Print Labels' }).every(button => !button.hasAttribute('disabled'))).toBe(true);
});
it('does not treat an unknown product ID as a printable selection', () => {
  render(<LabelPrintClient {...props} initialSelectedProductId="foreign-product" />);
  expect(screen.getByText('Select products to print')).toBeInTheDocument();
});
