import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuickPurchaseForm from './QuickPurchaseForm';
import { createQuickPurchaseProduct, saveQuickPurchase, setFoodPurchasePhotoRequired } from '@/app/actions/quick-purchases';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

vi.mock('@/app/actions/quick-purchases', () => ({
  createQuickPurchaseProduct: vi.fn(),
  changeNewQuickPurchaseItem: vi.fn(),
  saveQuickPurchase: vi.fn(),
  setFoodPurchasePhotoRequired: vi.fn(),
}));

const piece = { id: 'piece', name: 'piece', pluralName: 'pieces', isBaseUnit: true };
const tea = { id: 'tea', name: 'Tea bread', vatRateBps: 0, units: [piece] };
const sugar = { id: 'sugar', name: 'Sugar bread', vatRateBps: 0, units: [piece] };
const props = {
  storeId: 'store', products: [tea, sugar], units: [piece], tills: [{ id: 'till', name: 'Main till' }],
  suppliers: [{ id: 'supplier', name: 'Bread supplier' }],
  vatEnabled: false, photoRequired: false, role: 'OWNER', businessCashPence: 2500,
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
    vi.mocked(saveQuickPurchase).mockResolvedValue({ success: true, data: { id: 'purchase', total: 5500, cashSource: undefined, tillUsed: false } });
    render(<QuickPurchaseForm {...props} />);
    expect(screen.getByRole('button', { name: 'Choose an item you bought' })).toBeEnabled();
    pick('Tea bread');
    expect(screen.getAllByLabelText('Item')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Add how many for Tea bread' })).toBeEnabled();
    fill('3', '0');
    const missing = screen.getByRole('button', { name: 'Add a cost for Tea bread' });
    fireEvent.click(missing);
    expect(screen.getByLabelText('Cost each (GH₵)')).toHaveFocus();
    expect(saveQuickPurchase).not.toHaveBeenCalled();
    fill('3', '5');
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

  it('refreshes the branch balance after starting another purchase', async () => {
    vi.mocked(saveQuickPurchase).mockResolvedValueOnce({ success: true, data: {
      id: 'purchase', total: 1500, cashSource: 'BUSINESS_CASH', tillUsed: false,
    } });
    render(<QuickPurchaseForm {...props} tills={[]} />);
    pick('Tea bread');
    fill('3', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Business cash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save purchase' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Record another' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Choose an item you bought' })).toBeVisible();
  });

  it('links to the current branch cash page only when the balance is below the total', () => {
    render(<QuickPurchaseForm {...props} tills={[]} storeId="branch+1" />);
    pick('Tea bread');
    fill('5', '5');
    expect(screen.queryByRole('link', { name: 'Record cash given to you' })).not.toBeInTheDocument();
    fill('6', '5');
    expect(screen.getByRole('link', { name: 'Record cash given to you' }))
      .toHaveAttribute('href', '/purchases/cash?storeId=branch%2B1');
  });

  it('requires a supplier only when paying later', () => {
    render(<QuickPurchaseForm {...props} photoRequired />);
    pick('Tea bread');
    fill('3', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Owing' }));
    expect(screen.getByRole('button', { name: "Choose who you're paying later" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: 'supplier' } });
    expect(screen.getByRole('button', { name: 'Save purchase' })).toBeEnabled();
  });

  it.each([
    ['My own money', 'OWNER_CAPITAL', 'my own money'],
    ['Business cash', 'BUSINESS_CASH', 'business cash'],
  ] as const)('explains the selected cash source %s when no till is open', async (label, cashSource, summary) => {
    vi.mocked(saveQuickPurchase).mockResolvedValue({ success: true, data: { id: 'purchase', total: 1500, cashSource, tillUsed: false } });
    render(<QuickPurchaseForm {...props} tills={[]} />);
    pick('Tea bread');
    fill('3', '5');
    expect(screen.getByRole('button', { name: 'Choose where the cash came from' })).toBeEnabled();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Save purchase' }));
    expect(await screen.findByText('Paid by Cash · from ' + summary)).toBeVisible();
    expect(saveQuickPurchase).toHaveBeenLastCalledWith(expect.objectContaining({ cashSource, tillId: '' }));
  });

  it('shows only held business cash and the recorded balance to a manager', () => {
    render(<QuickPurchaseForm {...props} tills={[]} role="MANAGER" />);
    expect(screen.queryByRole('button', { name: 'My own money' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Business cash' })).toBeVisible();
    expect(screen.getByText('You have GH₵25.00 recorded')).toBeVisible();
    expect(screen.getByText('Only the owner can record their own money.')).toBeVisible();
  });

  it.each([
    ['OWNER', 'Not enough business cash recorded. Choose My own money, or record cash given to you first.'],
    ['MANAGER', 'Not enough business cash recorded. Record cash given to you first.'],
  ])('points %s to business cash when the total exceeds the displayed balance', (role, message) => {
    render(<QuickPurchaseForm {...props} tills={[]} role={role} businessCashPence={0} />);
    pick('Tea bread');
    fill('3', '5');
    const source = screen.getByRole('button', { name: 'Business cash' });
    fireEvent.click(source);
    expect(screen.getByText('You have GH₵0.00 recorded')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: message }));
    expect(source).toHaveFocus();
  });

  it('shows a cash shortfall reported by the server after the balance changed', async () => {
    const message = 'Not enough business cash recorded. Record cash given to you first.';
    vi.mocked(saveQuickPurchase).mockResolvedValueOnce({ success: false, error: message });
    render(<QuickPurchaseForm {...props} tills={[]} role="MANAGER" />);
    pick('Tea bread');
    fill('3', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Business cash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save purchase' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows the till as the actual source when it opens after page load', async () => {
    vi.mocked(saveQuickPurchase).mockResolvedValueOnce({ success: true, data: {
      id: 'purchase', total: 1500, tillUsed: true, cashSource: undefined,
    } });
    render(<QuickPurchaseForm {...props} tills={[]} />);
    pick('Tea bread');
    fill('3', '5');
    fireEvent.click(screen.getByRole('button', { name: 'My own money' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save purchase' }));
    expect(await screen.findByText('Paid by Cash · from the till')).toBeVisible();
  });

  it('does not show a photo field even when the old setting is enabled', () => {
    const { container } = render(<QuickPurchaseForm {...props} photoRequired />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText('Receipt photo required (set by owner)')).not.toBeInTheDocument();
  });

  it('creates a missing item and fills the row', async () => {
    vi.mocked(createQuickPurchaseProduct).mockResolvedValue({
      success: true, data: { ...tea, units: [{ ...piece, conversionToBase: 1 }], created: true, barcode: null, defaultCostBasePence: 0,
        sellingPriceBasePence: 0, promoBuyQty: 0, promoGetQty: 0, onHandBase: 0 },
    });
    render(<QuickPurchaseForm {...props} products={[{ ...tea, id: 'similar', name: 'Tea bread tin' }]} />);
    const item = screen.getByLabelText('Item');
    fireEvent.focus(item);
    fireEvent.change(item, { target: { value: 'Tea bread' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add "Tea bread" as new item' }));
    expect(await screen.findByLabelText('Cost each (GH₵)')).toBeVisible();
    expect(item).toHaveValue('Tea bread');
    expect(createQuickPurchaseProduct).toHaveBeenCalledWith({ name: 'Tea bread' }, 'store');
  });
});
