import { describe, expect, it } from 'vitest';
import { completeRecoveryBarcodes, RECOVERY_TABLES, validateRecoverySnapshot } from './backup-restore-contract';
function snapshot() { return { version: '1.4', business: { id: 'b' }, users: [{ id: 'o', businessId: 'b', role: 'OWNER' }], ...Object.fromEntries(RECOVERY_TABLES.map(key => [key, []])) }; }
describe('complete financial recovery contract', () => {
  it('accepts an empty complete same-business snapshot', () => expect(() => validateRecoverySnapshot(snapshot(), 'b', 'o')).not.toThrow());
  it('accepts primary and alias registry entries for their products', () => {
    expect(() => validateRecoverySnapshot({ ...snapshot(), products: [{ id: 'p', businessId: 'b', barcode: 'primary' }], productBarcodes: [{ businessId: 'b', productId: 'p', code: 'primary' }, { businessId: 'b', productId: 'p', code: 'alias' }] }, 'b', 'o')).not.toThrow();
  });
  it('derives SQLite primary registry rows and rejects conflicting ownership', () => {
    const products = [{ id: 'p', businessId: 'b', barcode: 'primary' }];
    expect(() => validateRecoverySnapshot({ ...snapshot(), products, productBarcodes: [] }, 'b', 'o')).not.toThrow();
    expect(completeRecoveryBarcodes('b', products, [])).toEqual([{ businessId: 'b', productId: 'p', code: 'primary' }]);
    expect(() => validateRecoverySnapshot({ ...snapshot(), products: [{ id: 'p', barcode: 'primary' }, { id: 'q', barcode: null }], productBarcodes: [{ businessId: 'b', productId: 'q', code: 'primary' }] }, 'b', 'o')).toThrow('primary barcode');
  });
  it('keeps aliases and already registered primaries exactly once without mutating input', () => {
    const rows = [{ businessId: 'b', productId: 'p', code: 'alias' }, { businessId: 'b', productId: 'p', code: 'primary' }];
    expect(completeRecoveryBarcodes('b', [{ id: 'p', barcode: 'primary' }], rows)).toEqual(rows);
    expect(rows).toHaveLength(2);
  });
  it('rejects duplicate registry codes rather than silently skipping them', () => {
    expect(() => validateRecoverySnapshot({ ...snapshot(), productBarcodes: [{ code: 'same', productId: 'p' }, { code: 'same', productId: 'p' }] }, 'b', 'o')).toThrow('duplicate barcode');
  });
  it('rejects legacy backup missing drawer/replay evidence', () => expect(() => validateRecoverySnapshot({ ...snapshot(), version: '1.3' }, 'b', 'o')).toThrow('complete cash'));
  it('rejects a different business before restore', () => expect(() => validateRecoverySnapshot(snapshot(), 'other', 'o')).toThrow('same business'));
  it('requires the recovering owner', () => expect(() => validateRecoverySnapshot(snapshot(), 'b', 'stranger')).toThrow('owner'));
  it('rejects foreign tenant rows', () => expect(() => validateRecoverySnapshot({ ...snapshot(), cashDrawerEntries: [{ id: 'x', businessId: 'other' }] }, 'b', 'o')).toThrow('another business'));
  it('rejects foreign parent references even if row business is relabelled', () => expect(() => validateRecoverySnapshot({ ...snapshot(), cashDrawerEntries: [{ id: 'x', businessId: 'b', storeId: 'foreign', tillId: 't', createdByUserId: 'o' }] }, 'b', 'o')).toThrow('outside this snapshot'));
});
