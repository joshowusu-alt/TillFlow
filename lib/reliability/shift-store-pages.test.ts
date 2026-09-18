import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSoleOrSelectedStoreId } from './selected-store';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('shift pages never fall back to the first store among many', () => {
  const storeA = { id: 'store-a' };
  const storeB = { id: 'store-b' };
  const authorised = [storeA, storeB];

  it('treats Store A as first in created order and still requires an explicit Store B', () => {
    expect(authorised[0].id).toBe('store-a');
    expect(resolveSoleOrSelectedStoreId(authorised)).toBeNull();
    expect(resolveSoleOrSelectedStoreId(authorised, 'store-b')).toBe('store-b');
  });

  it('rejects a foreign store id instead of substituting Store A', () => {
    expect(resolveSoleOrSelectedStoreId(authorised, 'store-foreign')).toBeNull();
  });

  it('keeps sole-store businesses working without an extra picker click', () => {
    expect(resolveSoleOrSelectedStoreId([storeB])).toBe('store-b');
    expect(resolveSoleOrSelectedStoreId([storeB], undefined)).toBe('store-b');
  });

  it('queries tills, open shifts, recent shifts, drawer and variance by the resolved store', () => {
    const shiftsPage = read('app/(protected)/shifts/page.tsx');
    const drawer = read('app/(protected)/shifts/drawer/page.tsx');
    const variance = read('app/(protected)/shifts/variance/page.tsx');
    const varianceDetail = read('app/(protected)/shifts/variance/[id]/page.tsx');

    expect(shiftsPage).toContain('where: { storeId: store.id }');
    expect(shiftsPage).toContain('getOpenShiftsForUserInStore(user.id, store.id)');
    expect(shiftsPage).toContain('getStoreTillOccupancy(store.id)');
    expect(shiftsPage).toContain('storeId={store.id}');
    expect(drawer).toContain('where: { storeId: store.id }');
    expect(drawer).toContain('storeId: store.id');
    expect(drawer).toContain('SelectedStorePicker');
    expect(variance).toContain("shift: { till: { storeId: store.id } }");
    expect(varianceDetail).toContain("shift: { till: { storeId: store.id } }");
    expect(shiftsPage).not.toContain('requireBusinessStore');
    expect(drawer).not.toContain('requireBusinessStore');
    expect(variance).not.toContain('requireBusinessStore');
  });
});
