import { describe, expect, it } from 'vitest';
import {
  isInternalControlBillingHistoryEntry,
  parseBillingHistory,
} from './internal-control-billing-notes';

const CONTROL_NOTE_BLOB = [
  '[2026-04-01T10:00:00.000Z] Control note added',
  'Added by: Ada (ADMIN)',
  'Category: BILLING',
  'Internal follow-up about collection',
  '',
  '[2026-04-02T10:00:00.000Z] Payment received',
  'Amount: GHc 349',
  'Paid at: 2026-04-02',
].join('\n');

describe('merchant-visible billing history', () => {
  it('treats a Control note heading as internal', () => {
    expect(isInternalControlBillingHistoryEntry('Control note added')).toBe(true);
    expect(isInternalControlBillingHistoryEntry('Control subscription updated')).toBe(true);
    expect(isInternalControlBillingHistoryEntry('Payment received')).toBe(false);
  });

  it('does not let a Control note heading survive the merchant-visible parser', () => {
    const visible = parseBillingHistory(CONTROL_NOTE_BLOB);
    expect(visible).toHaveLength(1);
    expect(visible[0].title).toBe('Payment received');
    expect(visible.some((entry) => /control note added/i.test(entry.title))).toBe(false);
    expect(CONTROL_NOTE_BLOB).toContain('Control note added');
  });

  it('filters operator fact labels without deleting the stored notes string', () => {
    const stored = '[2026-04-03T12:00:00.000Z] Collection update\nUpdated by: Kojo (MANAGER)\nOwner asked for a receipt';
    const visible = parseBillingHistory(stored);
    expect(visible).toHaveLength(0);
    expect(stored).toContain('Updated by: Kojo (MANAGER)');
  });
});
