import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), category: vi.fn() }));
vi.mock('@/app/actions/product-classification', () => ({ saveClassificationSetupAction: mocks.create }));
vi.mock('@/app/actions/categories', () => ({ quickCreateCategoryAction: mocks.category }));
import ClassificationSetup from './ClassificationSetup';
beforeEach(() => vi.resetAllMocks());
const categories = [{ id: 'category', name: 'Literature' }, { id: 'other', name: 'Household' }];
const divisions = [{ id: 'division', categoryId: 'category', name: 'Bibles', groups: [{ id: 'group', name: 'General Bibles' }] },
  { id: 'other-division', categoryId: 'other', name: 'Cleaning', groups: [{ id: 'other-group', name: 'Detergents' }] }];

it('shows all three levels and only the selected parents children, with a link to their products', () => {
  render(<ClassificationSetup categories={categories} divisions={divisions} />);
  expect(screen.getByRole('region', { name: 'Categories' })).toBeVisible();
  const divisionColumn = screen.getByRole('region', { name: 'Divisions' });
  const groupColumn = screen.getByRole('region', { name: 'Groups' });
  expect(within(divisionColumn).getByRole('button', { name: 'Bibles' })).toBeVisible();
  expect(within(divisionColumn).queryByRole('button', { name: 'Cleaning' })).toBeNull();
  fireEvent.click(within(groupColumn).getByRole('button', { name: 'General Bibles' }));
  expect(screen.getByRole('link', { name: 'View products in this group' })).toHaveAttribute('href', '/products?tab=products&category=category&division=division&group=group');
  fireEvent.click(screen.getByRole('button', { name: 'Household' }));
  expect(within(divisionColumn).getByRole('button', { name: 'Cleaning' })).toBeVisible();
  expect(within(groupColumn).queryByRole('button', { name: 'General Bibles' })).toBeNull();
  expect(within(groupColumn).getByRole('button', { name: 'Detergents' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'View products in this division' })).toHaveAttribute('href', '/products?tab=products&category=other&division=other-division');
});

it('creates a category, division and group in sequence without reselecting their parents', async () => {
  mocks.create.mockResolvedValueOnce({ success: true, data: { id: 'new-category', name: 'Books' } }).mockResolvedValueOnce({ success: true, data: { id: 'new-division', name: 'Bibles' } })
    .mockResolvedValueOnce({ success: true, data: { id: 'new-group', name: 'Study Bibles' } });
  render(<ClassificationSetup categories={[]} divisions={[]} />);
  expect(screen.getByRole('button', { name: 'Add division' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add group' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
  fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Books' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
  await screen.findByLabelText('Division name');
  fireEvent.change(screen.getByLabelText('Division name'), { target: { value: 'Bibles' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save division' }));
  await screen.findByLabelText('Group name');
  expect(mocks.create).toHaveBeenLastCalledWith('division', 'new-category', 'Bibles');
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Study Bibles' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
  await waitFor(() => expect(mocks.create).toHaveBeenLastCalledWith('group', 'new-division', 'Study Bibles'));
  expect(await screen.findByRole('link', { name: 'View products in this group' })).toHaveAttribute('href', '/products?tab=products&category=new-category&division=new-division&group=new-group');
  expect(screen.getByRole('button', { name: 'Study Bibles' })).toHaveAttribute('aria-pressed', 'true');
});

it('preserves the selected parent and typed name after a failed save', async () => {
  mocks.create.mockResolvedValue({ success: false, error: 'A group with this name already exists.' });
  render(<ClassificationSetup categories={categories} divisions={divisions} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add group' }));
  fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'General Bibles' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  expect(screen.getByLabelText('Group name')).toHaveValue('General Bibles');
  expect(mocks.create).toHaveBeenCalledWith('group', 'division', 'General Bibles');
});

it('restores the selected parents and next editor after a successful server navigation', () => {
  render(<ClassificationSetup categories={categories} divisions={divisions} initialCategoryId="other" initialDivisionId="other-division" initialAdd="group" saved="division" />);
  expect(screen.getByRole('button', { name: 'Household' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Cleaning' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Group name')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Division saved');
});

it('clears child searches when switching parent while retaining the category search', () => {
  render(<ClassificationSetup categories={categories} divisions={divisions} />);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search divisions' }), { target: { value: 'not here' } });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search groups' }), { target: { value: 'not here' } });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search categories' }), { target: { value: 'Household' } });
  fireEvent.click(screen.getByRole('button', { name: 'Household' }));
  expect(screen.getByRole('searchbox', { name: 'Search divisions' })).toHaveValue('');
  expect(screen.getByRole('searchbox', { name: 'Search groups' })).toHaveValue('');
  expect(screen.getByRole('searchbox', { name: 'Search categories' })).toHaveValue('Household');
  expect(screen.getByRole('button', { name: 'Cleaning' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Detergents' })).toBeVisible();
});
