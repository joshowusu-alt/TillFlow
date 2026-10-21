import { expect, it } from 'vitest';
import { parseShortcutLayout, readShortcutLayout } from './shortcuts';
it('preserves screen and product order and normalises names', () => {
  expect(parseShortcutLayout({ screens: [{ id: 'a', name: ' Main ', productIds: ['p2','p1'] }] })).toEqual({ screens: [{ id: 'a', name: 'Main', productIds: ['p2','p1'] }] });
  expect(readShortcutLayout(null)).toEqual({ screens: [] });
});
it('rejects excessive layouts, duplicate names and duplicate products', () => {
  expect(() => parseShortcutLayout({ screens: Array.from({ length: 13 }, (_, i) => ({ id: String(i), name: String(i), productIds: [] })) })).toThrow();
  expect(() => parseShortcutLayout({ screens: [{ id:'a', name:'Main', productIds:[] }, { id:'b', name:' MAIN ', productIds:[] }] })).toThrow('unique name');
  expect(() => parseShortcutLayout({ screens: [{ id:'a', name:'Main', productIds:['p','p'] }] })).toThrow('different products');
});
