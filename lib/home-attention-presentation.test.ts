import { describe, expect, it } from 'vitest';
import {
  countHomeAttentionActions,
  formatCloseShiftDescription,
  formatCommandCenterActionLabel,
  formatHeroAttentionSubtitle,
  formatHeroStatusPill,
  formatHomeAttentionActionSummary,
} from './home-attention-presentation';

describe('home attention presentation', () => {
  it('counts three Home actions while Command Center can report five issues', () => {
    const flags = {
      openShiftCount: 1,
      openIssueCount: 5,
      reorderNeededCount: 0,
      overdueSupplierInvoiceCount: 1,
      canAccessReorder: true,
    };
    expect(countHomeAttentionActions(flags)).toBe(3);
    expect(formatHomeAttentionActionSummary(3)).toBe('3 areas need your attention today.');
    expect(formatCommandCenterActionLabel(5)).toBe('5 issues in Command Center');
    expect(formatHeroAttentionSubtitle({ actionCount: 3, hasRecordImprovements: true })).toBe(
      '3 areas need your attention today.'
    );
  });

  it('counts one Home action and formats singular copy', () => {
    expect(
      countHomeAttentionActions({
        openShiftCount: 1,
        openIssueCount: 0,
        reorderNeededCount: 0,
        overdueSupplierInvoiceCount: 0,
        canAccessReorder: true,
      })
    ).toBe(1);
    expect(formatHomeAttentionActionSummary(1)).toBe('1 area needs your attention today.');
    expect(formatHeroStatusPill({ actionCount: 1, openShiftCount: 1, hasRecordImprovements: false })).toBe(
      'Your open shift needs closing'
    );
    expect(formatCommandCenterActionLabel(1)).toBe('1 issue in Command Center');
  });

  it('handles no Home actions with honest record-aware hero copy', () => {
    expect(
      countHomeAttentionActions({
        openShiftCount: 0,
        openIssueCount: 0,
        reorderNeededCount: 2,
        overdueSupplierInvoiceCount: 0,
        canAccessReorder: false,
      })
    ).toBe(0);
    expect(formatHomeAttentionActionSummary(0)).toBe('No urgent issues need your attention today.');
    expect(formatHeroAttentionSubtitle({ actionCount: 0, hasRecordImprovements: true })).toBe(
      'No urgent issues today. Some records can still be improved.'
    );
    expect(formatHeroAttentionSubtitle({ actionCount: 0, hasRecordImprovements: false })).toBe(
      'No urgent issues today.'
    );
    expect(formatHeroStatusPill({ actionCount: 0, openShiftCount: 0, hasRecordImprovements: true })).toBe(
      'Records can be improved'
    );
  });

  it('keeps Command Center issue count distinct when greater than Home action count', () => {
    const actionCount = countHomeAttentionActions({
      openShiftCount: 0,
      openIssueCount: 5,
      reorderNeededCount: 0,
      overdueSupplierInvoiceCount: 0,
      canAccessReorder: true,
    });
    expect(actionCount).toBe(1);
    expect(formatHomeAttentionActionSummary(actionCount)).toBe('1 area needs your attention today.');
    expect(formatCommandCenterActionLabel(5)).toBe('5 issues in Command Center');
  });

  it('"areas" wording never overstates a bundled Command Center issue count as a flat total', () => {
    // 1 Home "area" (Command Center) can bundle many underlying issues — the
    // summary must say "1 area", not "1 action"/"1 issue", to avoid implying
    // there is exactly one problem when there may be several.
    const flags = {
      openShiftCount: 0,
      openIssueCount: 4,
      reorderNeededCount: 0,
      overdueSupplierInvoiceCount: 0,
      canAccessReorder: true,
    };
    const actionCount = countHomeAttentionActions(flags);
    expect(actionCount).toBe(1);
    expect(formatHomeAttentionActionSummary(actionCount)).toBe('1 area needs your attention today.');
    expect(formatCommandCenterActionLabel(flags.openIssueCount)).toBe('4 issues in Command Center');
  });

  it('formats Close Shift copy for today, previous day, zero sales, and missing open time', () => {
    expect(
      formatCloseShiftDescription({
        salesCount: 11,
        openedAt: '2026-02-17T08:15:00.000Z',
      })
    ).toMatch(/^Open since .+ · 11 sales in this open shift$/);

    expect(
      formatCloseShiftDescription({
        salesCount: 0,
        openedAt: null,
      })
    ).toBe('0 sales in this open shift');

    expect(
      formatCloseShiftDescription({
        salesCount: 1,
        openedAt: null,
      })
    ).toBe('1 sale in this open shift');
  });
});
