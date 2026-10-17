import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ push: vi.fn(), save: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/app/actions/opening-stock', () => ({ createOpeningStockAction: mocks.save }));
vi.mock('@/lib/services/shared', () => ({ resolveEffectiveDefaultCostPence: () => 500 }));
import OpeningStockClient from './OpeningStockClient';
const products = [{ id: 'product', name: 'Fixture product', barcode: null, defaultCostBasePence: 500, productUnits: [{ unitId: 'piece', unit: { id: 'piece', name: 'piece' }, isBaseUnit: true, conversionToBase: 1 }] }];
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue({ success: true, data: { inventoryValuePence: 500, cashPence: 0, totalPence: 500, missingCostCount: 0 } }); });
describe('opening stock onboarding continuation', () => {
  it('returns an incomplete business to setup after a successful save', async () => {
    render(<OpeningStockClient products={products} currency="GHS" existingCapitalPence={0} returnToSetup />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add stock item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Opening Capital' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/onboarding'));
  });
  it('keeps a failed save in the form without navigating', async () => {
    mocks.save.mockResolvedValue({ success: false, error: 'Stock could not be saved' });
    render(<OpeningStockClient products={products} currency="GHS" existingCapitalPence={0} returnToSetup />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add stock item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Opening Capital' }));
    await screen.findByText('Stock could not be saved');
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('retains the result screen for established businesses and discloses missing costs', async () => {
    mocks.save.mockResolvedValue({ success: true, data: { inventoryValuePence: 0, cashPence: 0, totalPence: 0, missingCostCount: 1 } });
    render(<OpeningStockClient products={products} currency="GHS" existingCapitalPence={0} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add stock item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Opening Capital' }));
    await screen.findByText('Opening capital recorded!');
    expect(screen.getByRole('status')).toHaveTextContent('stock value is incomplete');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
