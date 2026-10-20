import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/app/actions/product-classification', () => ({ createClassificationNodeAction: mocks.create }));
import ClassificationSetup from './ClassificationSetup';
beforeEach(() => vi.clearAllMocks());

it('moves from a saved division directly to adding its first group', async () => {
  mocks.create.mockResolvedValueOnce({ success: true, data: { id: 'division', name: 'Bibles' } })
    .mockResolvedValueOnce({ success: true, data: { id: 'group', name: 'Study Bibles' } });
  render(<ClassificationSetup categories={[{ id: 'category', name: 'Literature' }]} divisions={[]} />);
  fireEvent.change(screen.getByLabelText('Under category'), { target: { value: 'category' } });
  fireEvent.change(screen.getByLabelText('Division name'), { target: { value: 'Bibles' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add division' }));
  await waitFor(() => expect(screen.getByLabelText('Under division')).toHaveValue('division'));
  expect(screen.getByRole('status')).toHaveTextContent('Next, add a group');
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Study Bibles' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
  await waitFor(() => expect(mocks.create).toHaveBeenLastCalledWith('group', 'division', 'Study Bibles'));
  expect(await screen.findByRole('link', { name: 'Go to products' })).toHaveAttribute('href', '/products?tab=products');
});

it('prefills the correct parent when adding a group from the existing hierarchy', () => {
  render(<ClassificationSetup categories={[{ id: 'category', name: 'Household' }]} divisions={[{ id: 'division', categoryId: 'category', name: 'Cleaning', groups: [] }]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add group under Cleaning' }));
  expect(screen.getByLabelText('Under division')).toHaveValue('division');
  expect(screen.getByText(/Add a group here before assigning products/)).toBeVisible();
});
