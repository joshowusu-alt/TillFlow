import { describe, expect, it } from 'vitest';
import {
  RELIABILITY_MANUAL_ENTRY_PRODUCT,
  assertManualEntryFormNotTrapped,
  assertPersistedManualEntry,
  classifyManualEntrySubmit,
} from './manual-entry-gate';

describe('manual entry gate identity', () => {
  it('pins REL-MAN-P104-01', () => {
    expect(RELIABILITY_MANUAL_ENTRY_PRODUCT).toEqual({
      name: 'Reliability Manual Entry Gate',
      sku: 'REL-MAN-P104-01',
      barcode: 'RELMANP10401',
      sellingPrice: '3.00',
      defaultCost: '1.50',
    });
  });
});

describe('manual entry submit classification', () => {
  it('creates when absent, resumes when unique, fails on duplicates', () => {
    expect(classifyManualEntrySubmit(0).decision).toBe('create');
    expect(classifyManualEntrySubmit(1).decision).toBe('resume');
    expect(classifyManualEntrySubmit(2).decision).toBe('fail');
  });
});

describe('manual entry persist and trap', () => {
  it('requires exactly one matching persisted product', () => {
    expect(() => assertPersistedManualEntry({ products: [] })).toThrow(/REL-MAN-P104-01/);
    expect(() =>
      assertPersistedManualEntry({
        products: [{ sku: 'REL-MAN-P104-01', name: 'Reliability Manual Entry Gate' }],
      }),
    ).not.toThrow();
    expect(() =>
      assertPersistedManualEntry({
        products: [
          { sku: 'REL-MAN-P104-01', name: 'Reliability Manual Entry Gate' },
          { sku: 'REL-MAN-P104-01', name: 'Reliability Manual Entry Gate' },
        ],
      }),
    ).toThrow(/found 2/);
  });

  it('fails when the hash leaves details closed or the helper clicks the summary', () => {
    expect(() =>
      assertManualEntryFormNotTrapped({
        detailsOpen: false,
        formVisible: false,
        nameFieldVisible: false,
        summaryClicked: false,
      }),
    ).toThrow(/details closed/);
    expect(() =>
      assertManualEntryFormNotTrapped({
        detailsOpen: true,
        formVisible: true,
        nameFieldVisible: true,
        summaryClicked: true,
      }),
    ).toThrow(/clicking the closed details summary/);
    expect(() =>
      assertManualEntryFormNotTrapped({
        detailsOpen: true,
        formVisible: true,
        nameFieldVisible: true,
        summaryClicked: false,
      }),
    ).not.toThrow();
  });
});
