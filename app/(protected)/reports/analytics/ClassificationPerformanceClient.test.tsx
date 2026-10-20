import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import ClassificationPerformanceClient from './ClassificationPerformanceClient';
import type { ClassificationSalesRow } from '@/lib/reports/classification-sales';
const categories = [{ id: 'c', name: 'Household', divisions: [{ id: 'd', name: 'fairytale', groups: [{ id: 'g', name: 'Western' }] }] }];
const base = { productCount: 1, qtySold: 2, netSalesPence: 900, costPence: 600, profitPence: 300, marginPercent: 100 / 3, categoryId: 'c', divisionId: null, groupId: null, productId: null };
const rows: ClassificationSalesRow[] = [
  { ...base, key: 'c', level: 'category', name: 'Household', path: 'Household' },
  { ...base, key: 'd', level: 'division', name: 'fairytale', path: 'Household / fairytale', divisionId: 'd' },
  { ...base, key: 'g', level: 'group', name: 'Western', path: 'Household / fairytale / Western', divisionId: 'd', groupId: 'g' },
  { ...base, key: 'p', level: 'product', name: 'Fufu Powder', path: 'Household / fairytale / Western / Fufu Powder', divisionId: 'd', groupId: 'g', productId: 'p' },
  { ...base, key: 'only', level: 'division', name: 'Category only', path: 'Household / No division' },
  { ...base, key: 'soap', level: 'product', name: 'Soap', path: 'Household / Soap', productId: 'soap' },
];
it('drills category to division to group to product and exposes the saved product', () => {
  render(<ClassificationPerformanceClient categories={categories} rows={rows} currency="GHS" />);
  fireEvent.click(screen.getByRole('button', { name: 'Household →' }));
  expect(screen.getByLabelText('Compare by')).toHaveValue('division');
  fireEvent.click(screen.getByRole('button', { name: 'fairytale →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Western →' }));
  expect(screen.getByRole('link', { name: 'Fufu Powder' })).toHaveAttribute('href', '/products/p');
  expect(screen.queryByRole('link', { name: 'Soap' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('table')).getAllByText('GH₵9.00')).toHaveLength(2);
});
it('keeps a Category only drilldown limited to products without a division or group', () => {
  render(<ClassificationPerformanceClient categories={categories} rows={rows} currency="GHS" />);
  fireEvent.click(screen.getByRole('button', { name: 'Household →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Category only →' }));
  expect(screen.getByRole('link', { name: 'Soap' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Fufu Powder' })).not.toBeInTheDocument();
});
