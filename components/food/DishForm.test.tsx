import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDishDraft } from '@/lib/food/dish-draft';
import DishForm from './DishForm';

const mocks = vi.hoisted(() => ({ save: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('@/app/actions/food', () => ({ saveDishAction: mocks.save }));

const recipe = [{ productId: 'rice', qty: 2 }];

function renderForm() {
  render(<DishForm productId="bowl" categories={[]} ingredients={[{ id: 'rice', name: 'Rice', unit: 'kg' }]}
    initial={{ ...emptyDishDraft(), name: 'Rice bowl', startingPriceCedis: '20', stockMode: 'COUNTED', recipe }} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ success: true, data: { id: 'bowl' } });
});

describe('dish availability and portion settings', () => {
  it('offers Sold out while counting portions and saves the checked setting', async () => {
    renderForm();
    expect(screen.getByText(/stop orders at the till and online, even if portions are left/)).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sold out' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      stockMode: 'COUNTED', soldOut: true, recipe,
    })));
  });

  it('warns before saving without a recipe and keeps the recipe if counting is restored', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Not counted' }));
    expect(screen.getByRole('status')).toHaveTextContent('will remove the recipe');
    fireEvent.click(screen.getByRole('button', { name: 'Count portions' }));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save dish' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ recipe })));
  });
});
