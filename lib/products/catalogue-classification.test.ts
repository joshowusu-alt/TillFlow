import { expect, it } from 'vitest';
import { catalogueCount, catalogueHref, catalogueSelection } from './catalogue-classification';
const categories = [{ id: 'literature', name: 'Christian Literature' }, { id: 'stationery', name: 'Stationery' }];
const divisions = [{ id: 'bibles', name: 'Bibles', categoryId: 'literature', groups: [{ id: 'general', name: 'General Bibles' }, { id: 'study', name: 'Study Bibles' }] }, { id: 'office', name: 'Office', categoryId: 'stationery', groups: [{ id: 'pens', name: 'Pens' }] }];
const counts = [{ categoryId: 'literature', groupId: 'general', count: 3 }, { categoryId: 'literature', groupId: 'study', count: 2 }, { categoryId: 'literature', groupId: null, count: 1 }, { categoryId: 'stationery', groupId: 'pens', count: 4 }, { categoryId: null, groupId: null, count: 2 }];
it('counts product rows at each level, including category-only and uncategorised products', () => {
  expect(catalogueCount(counts, divisions, {})).toBe(12);
  expect(catalogueCount(counts, divisions, { category: 'literature' })).toBe(6);
  expect(catalogueCount(counts, divisions, { category: 'literature', division: 'bibles' })).toBe(5);
  expect(catalogueCount(counts, divisions, { category: 'literature', division: 'bibles', group: 'general' })).toBe(3);
  expect(catalogueCount(counts, divisions, { division: 'missing' })).toBe(0);
});
it('recognises direct child links and derives their full ancestry for display', () => {
  const result = catalogueSelection(categories, divisions, { group: 'general' });
  expect(result).toMatchObject({ valid: true, category: { id: 'literature' }, division: { id: 'bibles' }, group: { id: 'general' } });
  expect(catalogueSelection(categories, divisions, { division: 'bibles' })).toMatchObject({ valid: true, category: { id: 'literature' } });
});
it('does not present unknown or conflicting URL filters as a valid selected path', () => {
  for (const raw of [{ category: 'foreign' }, { division: 'foreign' }, { group: 'foreign' }, { category: 'stationery', division: 'bibles' }, { division: 'office', group: 'general' }]) expect(catalogueSelection(categories, divisions, raw).valid).toBe(false);
});
it('removes stale descendants and pagination while retaining search and issue context', () => {
  const context = { category: 'literature', division: 'bibles', group: 'general', page: '8', q: 'KJV & purple', issue: 'MISSING_COST', tab: 'products' };
  const parent = new URL(catalogueHref(context, { category: 'stationery' }), 'https://example.com');
  expect(Object.fromEntries(parent.searchParams)).toEqual({ q: 'KJV & purple', issue: 'MISSING_COST', tab: 'products', category: 'stationery' });
  const group = new URL(catalogueHref(context, { category: 'literature', division: 'bibles', group: 'study' }), 'https://example.com');
  expect(group.searchParams.get('group')).toBe('study'); expect(group.searchParams.has('page')).toBe(false);
});
