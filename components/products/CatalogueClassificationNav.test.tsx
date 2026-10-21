import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import CatalogueClassificationNav from './CatalogueClassificationNav';
const categories = [{ id: 'literature', name: 'Christian Literature' }, { id: 'stationery', name: 'Stationery' }];
const divisions = [{ id: 'bibles', name: 'Bibles', categoryId: 'literature', groups: [{ id: 'general', name: 'General Bibles' }, { id: 'study', name: 'Study Bibles' }] }];
const counts = [{ categoryId: 'literature', groupId: 'general', count: 2 }, { categoryId: 'literature', groupId: 'study', count: 1 }, { categoryId: 'stationery', groupId: null, count: 4 }];
it('links parent selections without stale children and links groups with complete ancestry', () => {
  render(<CatalogueClassificationNav categories={categories} divisions={divisions} counts={counts} selection={{ category: 'literature', division: 'bibles', group: 'general' }} context={{ q: 'Bible', page: '3', issue: 'MISSING_COST' }} />);
  const nav = screen.getByRole('navigation', { name: 'Browse catalogue classification' });
  expect(within(nav).getByRole('link', { name: /General Bibles/ })).toHaveAttribute('aria-current', 'page');
  const category = new URL(within(nav).getByRole('link', { name: /Stationery/ }).getAttribute('href')!, 'https://example.com');
  expect(category.searchParams.has('division')).toBe(false); expect(category.searchParams.has('group')).toBe(false); expect(category.searchParams.has('page')).toBe(false); expect(category.searchParams.get('q')).toBe('Bible');
  const group = new URL(within(nav).getByRole('link', { name: /Study Bibles/ }).getAttribute('href')!, 'https://example.com');
  expect(Object.fromEntries(group.searchParams)).toMatchObject({ category: 'literature', division: 'bibles', group: 'study' });
  expect(screen.getByText('Christian Literature → Bibles → General Bibles')).toBeVisible();
});
it('supports category-only shops without forcing empty division or group selectors', () => {
  render(<CatalogueClassificationNav categories={categories} divisions={divisions} counts={counts} selection={{ category: 'stationery' }} context={{}} />);
  expect(screen.getByText('Category-only products · no divisions set up')).toBeVisible(); expect(screen.queryByRole('link', { name: /General Bibles/ })).not.toBeInTheDocument();
});
it('flags unavailable paths and offers a context-preserving clear link', () => {
  render(<CatalogueClassificationNav categories={categories} divisions={divisions} counts={counts} selection={{ category: 'stationery', group: 'general' }} context={{ q: 'Bible' }} />);
  expect(screen.getByRole('link', { name: 'Clear classification filters' })).toHaveAttribute('href', '/products?q=Bible');
  expect(screen.queryByRole('link', { current: 'page' })).not.toBeInTheDocument();
});
