import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import CatalogueClassificationNav from './CatalogueClassificationNav';
const categories = [{ id: 'literature', name: 'Christian Literature' }, { id: 'stationery', name: 'Stationery' }];
const divisions = [{ id: 'bibles', name: 'Bibles', categoryId: 'literature', groups: [{ id: 'general', name: 'General Bibles' }, { id: 'study', name: 'Study Bibles' }] }];
const counts = [{ categoryId: 'literature', groupId: 'general', count: 2 }, { categoryId: 'literature', groupId: 'study', count: 1 }, { categoryId: 'stationery', groupId: null, count: 4 }];
const props = { categories, divisions, counts, selection: {}, context: {} };
const open = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

it('starts compact with no category wall and enables descendants only after a parent selection', () => {
  render(<CatalogueClassificationNav {...props} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Category / })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: /^Division / })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^Group / })).toBeDisabled();
  expect(screen.getByText('7 products')).toBeVisible();
});

it('preserves URL context and clears stale descendants when changing a parent', () => {
  render(<CatalogueClassificationNav {...props} selection={{ category: 'literature', division: 'bibles', group: 'general' }} context={{ q: 'Bible', page: '3', issue: 'MISSING_COST' }} />);
  open(/^Category /);
  const category = new URL(screen.getByRole('link', { name: /Stationery/ }).getAttribute('href')!, 'https://example.com');
  expect(Object.fromEntries(category.searchParams)).toEqual({ q: 'Bible', issue: 'MISSING_COST', category: 'stationery' });
  open(/^Group /);
  expect(screen.getByRole('link', { name: /General Bibles/ })).toHaveAttribute('aria-current', 'page');
  const group = new URL(screen.getByRole('link', { name: /Study Bibles/ }).getAttribute('href')!, 'https://example.com');
  expect(Object.fromEntries(group.searchParams)).toMatchObject({ category: 'literature', division: 'bibles', group: 'study', q: 'Bible' });
  expect(screen.getByText('Christian Literature → Bibles → General Bibles')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Choose category' })).not.toBeInTheDocument();
});

it('bounds large catalogues, searches the final category and shows no-match feedback', () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, name: `Category ${String(i).padStart(4, '0')}` }));
  render(<CatalogueClassificationNav {...props} categories={many} />);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  open(/^Category /);
  const choices = screen.getByRole('list', { name: 'Category choices' });
  expect(within(choices).getAllByRole('link')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: /Show more categories/ }));
  expect(within(choices).getAllByRole('link')).toHaveLength(40);
  const search = screen.getByRole('searchbox', { name: 'Search categories' });
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: ' CATEGORY 0999 ' } });
  expect(within(choices).getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: /Category 0999/ })).toHaveAttribute('href', '/products?category=c999');
  fireEvent.change(search, { target: { value: 'not a category' } });
  expect(screen.getByText(/No matching categories/)).toBeVisible();
});

it('keeps a selected late category visible and restores focus when Escape closes the picker', () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, name: `Category ${i}` }));
  render(<CatalogueClassificationNav {...props} categories={many} selection={{ category: 'c999' }} />);
  open(/^Category /);
  expect(screen.getByRole('link', { name: /Category 999/ })).toHaveAttribute('aria-current', 'page');
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Category / })).toHaveFocus();
});

it('searches divisions and groups within their parents and resets search when changing levels', () => {
  render(<CatalogueClassificationNav {...props} selection={{ category: 'literature', division: 'bibles' }} />);
  open(/^Division /);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search divisions' }), { target: { value: 'BIBLES' } });
  expect(screen.getByRole('link', { name: /^Bibles/ })).toHaveAttribute('href', '/products?category=literature&division=bibles');
  open(/^Group /);
  expect(screen.getByRole('searchbox', { name: 'Search groups' })).toHaveValue('');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'study' } });
  expect(screen.queryByRole('link', { name: /General Bibles/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Study Bibles/ })).toBeVisible();
});

it('supports category-only shops and does not force empty descendants', () => {
  render(<CatalogueClassificationNav {...props} selection={{ category: 'stationery' }} />);
  expect(screen.getByText('Category-only products · no divisions set up')).toBeVisible();
  expect(screen.getByRole('button', { name: /^Division / })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^Group / })).toBeDisabled();
});

it('flags unavailable paths and offers a context-preserving clear link', () => {
  render(<CatalogueClassificationNav {...props} selection={{ category: 'stationery', group: 'general' }} context={{ q: 'Bible' }} />);
  expect(screen.getByText('This classification combination is unavailable.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Clear classification filters' })).toHaveAttribute('href', '/products?q=Bible');
  expect(screen.getByRole('button', { name: /^Group / })).toBeDisabled();
});

it('resets an open picker when URL selection changes through navigation', () => {
  const { rerender } = render(<CatalogueClassificationNav {...props} />);
  open(/^Category /);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'stationery' } });
  rerender(<CatalogueClassificationNav {...props} selection={{ category: 'stationery' }} />);
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Category Stationery' })).toHaveAttribute('aria-expanded', 'false');
});
