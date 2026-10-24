import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const { state } = vi.hoisted(() => ({ state: vi.fn() }));
vi.mock('@/lib/ui/use-list-state', () => ({ useListState: state }));
import ProductListStateSync from './ProductListStateSync';
it('persists the complete selected classification with search and pagination', () => {
  render(<ProductListStateSync q="Bible" page={2} tab="products" category="literature" division="bibles" group="general" />);
  expect(state).toHaveBeenCalledWith('/products', expect.objectContaining({ q: 'Bible', page: 2, filters: { issue: undefined, category: 'literature', division: 'bibles', group: 'general' } }));
});
it('does not restore a stored classification after an explicit empty-search clear', () => {
  render(<ProductListStateSync q="" page={1} tab="products" resetClassification />);
  expect(state).toHaveBeenLastCalledWith('/products', expect.objectContaining({ restoreOnBareRoute: false }));
});
