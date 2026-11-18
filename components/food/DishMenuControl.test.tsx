import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DishMenuControl from './DishMenuControl';

const { toggle, refresh } = vi.hoisted(() => ({ toggle: vi.fn(), refresh: vi.fn() }));
vi.mock('@/app/actions/food', () => ({ setDishOnMenuAction: toggle }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

it('confirms before removal and lets the owner restore the dish', async () => {
  toggle.mockResolvedValue({ success: true, data: { id: 'fufu' } });
  const view = render(<DishMenuControl id="fufu" name="Fufu" removed={false} switchControl />);
  fireEvent.click(screen.getByRole('switch', { name: 'Remove from menu' }));
  expect(screen.getByText('Remove Fufu from the menu? Past sales stay in your reports.')).toBeVisible();
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove from menu' }));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(toggle).toHaveBeenLastCalledWith('fufu', false);

  view.rerender(<DishMenuControl id="fufu" name="Fufu" removed />);
  fireEvent.click(screen.getByRole('button', { name: 'Put back on menu' }));
  await waitFor(() => expect(toggle).toHaveBeenLastCalledWith('fufu', true));
});
