import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuickPurchaseForm from './QuickPurchaseForm';
import { createQuickPurchaseProduct, saveQuickPurchase, setFoodPurchasePhotoRequired } from '@/app/actions/quick-purchases';

vi.mock('@/app/actions/quick-purchases', () => ({
  createQuickPurchaseProduct: vi.fn(),
  saveQuickPurchase: vi.fn(),
  setFoodPurchasePhotoRequired: vi.fn(),
}));

const piece = { id: 'piece', name: 'piece', pluralName: 'pieces', isBaseUnit: true };
const tea = { id: 'tea', name: 'Tea bread', vatRateBps: 0, units: [piece] };
const sugar = { id: 'sugar', name: 'Sugar bread', vatRateBps: 0, units: [piece] };
const props = {
  storeId: 'store', products: [tea, sugar], units: [piece], tills: [{ id: 'till', name: 'Main till' }],
  suppliers: [{ id: 'supplier', name: 'Bread supplier' }], today: '2026-11-16',
  vatEnabled: false, photoRequired: false, canManage: true,
};
function pick(name: string, row = 0) {
  fireEvent.focus(screen.getAllByLabelText('Item')[row]);
  fireEvent.click(screen.getByRole('button', { name }));
}
function fill(qty: string, cost: string, row = 0) {
  fireEvent.change(screen.getAllByLabelText(/How many/)[row], { target: { value: qty } });
  fireEvent.change(screen.getAllByLabelText('Cost each (GH₵)')[row], { target: { value: cost } });
}

describe('food quick purchases', () => {
  it('validates incomplete rows, sends two complete items and ignores an empty row', async () => {
    vi.mocked(saveQuickPurchase).mockResolvedValue({ success: true, data: { id: 'purchase', total: 5500 } });
    render(<QuickPurchaseForm {...props} />);
    pick('Tea bread');
    expect(screen.getByRole('button', { name: 'Add how many for Tea bread' })).toBeEnabled();
    fill('3', '');
    const missing = screen.getByRole('button', { name: 'Add a cost for Tea bread' });
    fireEvent.click(missing);
    expect(screen.getByLabelText('Cost each (GH₵)')).toHaveFocus();
    expect(saveQuickPurchase).not.toHaveBeenCalled();
    fill('3', '5');
    fireEvent.click(screen.getByRole('button', { name: '+ Add another item' }));
    pick('Sugar bread', 1);
    fill('4', '10', 1);
    fireEvent.click(screen.getByRole('button', { name: '+ Add another item' }));
    expect(screen.getByText('2 items · GH₵55.00')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save purchase' }));
    expect(await screen.findByRole('heading', { name: 'Purchase saved' })).toBeVisible();
    expect(screen.getByText('Stock updated: Tea bread +3, Sugar bread +4')).toBeVisible();
    expect(saveQuickPurchase).toHaveBeenCalledWith(expect.objectContaining({
      payment: 'Cash', supplierId: '', document: '',
      rows: [
        expect.objectContaining({ productId: 'tea', quantity: '3', cost: '5' }),
        expect.objectContaining({ productId: 'sugar', quantity: '4', cost: '10' }),
      ],
    }));
  });

  it('requires a supplier only when paying later and hides the photo switch for cashiers', () => {
    render(<QuickPurchaseForm {...props} canManage={false} photoRequired />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    pick('Tea bread');
    fill('3', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Pay later' }));
    expect(screen.getByRole('button', { name: "Choose who you're paying later" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: 'supplier' } });
    expect(screen.getByRole('button', { name: 'Add a photo of the receipt' })).toBeEnabled();
  });

  it('opens the photo requirement panel and updates the form when the owner enables it', async () => {
    vi.mocked(setFoodPurchasePhotoRequired).mockResolvedValue({ success: true });
    render(<QuickPurchaseForm {...props} />);
    fireEvent.click(screen.getByText('Settings'));
    fireEvent.click(screen.getByRole('switch', { name: 'Require an invoice photo for every purchase', hidden: true }));
    expect(await screen.findByText('Receipt photo required (set by owner)')).toBeVisible();
  });

  it('creates a missing item and fills the row', async () => {
    vi.mocked(createQuickPurchaseProduct).mockResolvedValue({
      success: true, data: { ...tea, units: [{ ...piece, conversionToBase: 1 }], barcode: null, defaultCostBasePence: 0,
        sellingPriceBasePence: 0, promoBuyQty: 0, promoGetQty: 0, onHandBase: 0 },
    });
    render(<QuickPurchaseForm {...props} products={[]} />);
    const item = screen.getByLabelText('Item');
    fireEvent.focus(item);
    fireEvent.change(item, { target: { value: 'Tea bread' } });
    fireEvent.click(screen.getByRole('button', { name: "Add 'Tea bread' as a new item" }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Unit')).toHaveValue('piece');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add item' }));
    expect(await screen.findByLabelText('Cost each (GH₵)')).toBeVisible();
    expect(item).toHaveValue('Tea bread');
    expect(createQuickPurchaseProduct).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tea bread', ingredient: true }), 'store');
  });
});
