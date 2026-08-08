/**
 * Reporting scope, sales-revenue / money-received contract, and classification tests.
 */
import { describe, expect, it } from 'vitest';
import {
  buildReportingScopeSearchParams,
  isReportingScopeToday,
  ReportingScopeStoreError,
  resolveAuthorisedStoreId,
  resolveReportingScope,
  tradingReportHref,
} from '@/lib/reports/reporting-scope';
import {
  classifySalesPaymentReceipt,
  RECEIPT_CLASSIFICATION_LABELS,
} from '@/lib/reports/money-received-classify';
import { RECEIPT_ORIGIN } from '@/lib/payments/receipt-origin';
import {
  getBusinessCalendarDayBounds,
  getBusinessDayBounds,
  parseBusinessLocalDateKey,
} from '@/lib/notifications/utils';

describe('resolveReportingScope — business timezone Today', () => {
  it('uses Africa/Accra calendar day with inclusive start and exclusive end', () => {
    // 2026-04-01 00:30 Accra = still 2026-03-31 23:30 UTC previous day in UK winter? Accra=GMT.
    const now = new Date('2026-04-01T15:30:00.000Z');
    const scope = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Africa/Accra',
      params: { period: 'today', storeId: 'ALL' },
      defaultPeriod: '7d',
      allowedStoreIds: ['store-a'],
      now,
    });

    expect(scope.periodKey).toBe('today');
    expect(scope.fromInputValue).toBe('2026-04-01');
    expect(scope.toInputValue).toBe('2026-04-01');
    expect(scope.startInclusive.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(scope.endExclusive.toISOString()).toBe('2026-04-02T00:00:00.000Z');
    expect(isReportingScopeToday(scope, now)).toBe(true);
  });

  it('does not fall back to 7d when period=today is supplied (Home drill-down)', () => {
    const now = new Date('2026-08-07T10:00:00.000Z');
    const scope = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Africa/Accra',
      params: {
        period: 'today',
        from: '2026-08-07',
        to: '2026-08-07',
        storeId: 'ALL',
      },
      defaultPeriod: '7d',
      allowedStoreIds: [],
      now,
    });
    expect(scope.periodKey).toBe('today');
    expect(scope.fromInputValue).toBe('2026-08-07');
    expect(tradingReportHref(scope)).toContain('period=today');
    expect(tradingReportHref(scope)).not.toMatch(/period=7d/);
  });

  it('defaults bare Trading Report to rolling 7 local days', () => {
    const now = new Date('2026-08-07T10:00:00.000Z');
    const scope = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Africa/Accra',
      params: {},
      defaultPeriod: '7d',
      allowedStoreIds: [],
      now,
    });
    expect(scope.periodKey).toBe('7d');
    expect(scope.fromInputValue).toBe('2026-08-01');
    expect(scope.toInputValue).toBe('2026-08-07');
  });

  it('PRE-FIX DEFECT: inaccessible storeId must not silently broaden to ALL', () => {
    // This asserts the required fail-closed contract. On the defective head it
    // failed because resolveReportingScope fell back to storeId=ALL.
    expect(() =>
      resolveReportingScope({
        businessId: 'biz-1',
        timeZone: 'Africa/Accra',
        params: { period: 'today', storeId: 'foreign-store' },
        allowedStoreIds: ['store-a'],
        now: new Date('2026-08-07T10:00:00.000Z'),
      }),
    ).toThrow(ReportingScopeStoreError);

    const broadened = (() => {
      try {
        return resolveReportingScope({
          businessId: 'biz-1',
          timeZone: 'Africa/Accra',
          params: { period: 'today', storeId: 'foreign-store' },
          allowedStoreIds: ['store-a'],
          now: new Date('2026-08-07T10:00:00.000Z'),
        }).storeId;
      } catch {
        return null;
      }
    })();
    expect(broadened).not.toBe('ALL');
  });

  it('omitted storeId defaults to ALL; explicit ALL stays ALL', () => {
    const omitted = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Africa/Accra',
      params: { period: 'today' },
      allowedStoreIds: ['store-a', 'store-b'],
      now: new Date('2026-08-07T10:00:00.000Z'),
    });
    expect(omitted.storeId).toBe('ALL');

    const explicitAll = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Africa/Accra',
      params: { period: 'today', storeId: 'ALL' },
      allowedStoreIds: ['store-a'],
      now: new Date('2026-08-07T10:00:00.000Z'),
    });
    expect(explicitAll.storeId).toBe('ALL');
  });

  it('accepts each accessible store and rejects blank, whitespace, unknown and foreign', () => {
    expect(
      resolveAuthorisedStoreId({ storeId: 'store-a', allowedStoreIds: ['store-a', 'store-b'] }),
    ).toBe('store-a');
    expect(
      resolveAuthorisedStoreId({ storeId: 'store-b', allowedStoreIds: ['store-a', 'store-b'] }),
    ).toBe('store-b');

    expect(() =>
      resolveAuthorisedStoreId({ storeId: '', allowedStoreIds: ['store-a'] }),
    ).toThrow(ReportingScopeStoreError);
    expect(() =>
      resolveAuthorisedStoreId({ storeId: '   ', allowedStoreIds: ['store-a'] }),
    ).toThrow(ReportingScopeStoreError);
    expect(() =>
      resolveAuthorisedStoreId({ storeId: 'store-missing', allowedStoreIds: ['store-a'] }),
    ).toThrow(ReportingScopeStoreError);
    expect(() =>
      resolveAuthorisedStoreId({ storeId: 'foreign-store', allowedStoreIds: ['store-a'] }),
    ).toThrow(ReportingScopeStoreError);
    // Deleted/inactive: not present in allowedStoreIds for this business.
    expect(() =>
      resolveAuthorisedStoreId({ storeId: 'store-deleted', allowedStoreIds: ['store-a'] }),
    ).toThrow(ReportingScopeStoreError);
  });

  it('preserves authorised branch selection', () => {
    const scope = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Africa/Accra',
      params: { period: 'today', storeId: 'store-a' },
      allowedStoreIds: ['store-a', 'store-b'],
      now: new Date('2026-08-07T10:00:00.000Z'),
    });
    expect(scope.storeId).toBe('store-a');
    expect(buildReportingScopeSearchParams(scope).get('storeId')).toBe('store-a');
  });

  it('handles UK DST spring-forward local midnight for Europe/London', () => {
    // 2026-03-29 is UK spring-forward (01:00 → 02:00). Local 29 Mar still exists.
    const now = new Date('2026-03-29T12:00:00.000Z');
    const scope = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Europe/London',
      params: { period: 'today' },
      allowedStoreIds: [],
      now,
    });
    expect(scope.fromInputValue).toBe('2026-03-29');
    expect(scope.startInclusive < scope.endExclusive).toBe(true);
    // Exclusive end should be local midnight 30 Mar BST (UTC+1) = 2026-03-29T23:00:00.000Z
    expect(scope.endExclusive.toISOString()).toBe('2026-03-29T23:00:00.000Z');
  });

  it('handles UK DST autumn boundary for Europe/London', () => {
    const now = new Date('2026-10-25T12:00:00.000Z');
    const scope = resolveReportingScope({
      businessId: 'biz-1',
      timeZone: 'Europe/London',
      params: { period: 'today' },
      allowedStoreIds: [],
      now,
    });
    expect(scope.fromInputValue).toBe('2026-10-25');
    expect(scope.startInclusive.toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });
});

describe('business calendar day helpers', () => {
  it('parses YYYY-MM-DD and rejects impossible dates', () => {
    expect(parseBusinessLocalDateKey('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseBusinessLocalDateKey('2026-02-31')).toBeNull();
    expect(parseBusinessLocalDateKey('not-a-date')).toBeNull();
  });

  it('places 23:59 Accra inside Today and 00:00 next day outside', () => {
    const bounds = getBusinessDayBounds(new Date('2026-08-07T12:00:00.000Z'), 'Africa/Accra');
    const late = new Date('2026-08-07T23:59:59.000Z');
    const next = new Date('2026-08-08T00:00:00.000Z');
    expect(late >= bounds.dayStart && late < bounds.dayEndExclusive).toBe(true);
    expect(next >= bounds.dayEndExclusive).toBe(true);
  });

  it('builds calendar bounds for an explicit local date', () => {
    const bounds = getBusinessCalendarDayBounds({ year: 2026, month: 8, day: 7 }, 'Africa/Accra');
    expect(bounds.dayStart.toISOString()).toBe('2026-08-07T00:00:00.000Z');
    expect(bounds.dayEndExclusive.toISOString()).toBe('2026-08-08T00:00:00.000Z');
  });
});

describe('classifySalesPaymentReceipt', () => {
  it('uses persisted RECEIVED_AT_SALE without timestamps', () => {
    const result = classifySalesPaymentReceipt({
      amountPence: 5000,
      receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE,
    });
    expect(result.classification).toBe('RECEIVED_AT_SALE');
    expect(result.paymentState).toBe('CONFIRMED');
    expect(RECEIPT_CLASSIFICATION_LABELS.RECEIVED_AT_SALE).toBe('Received at sale');
  });

  it('uses persisted LATER_CREDIT_COLLECTION even within five minutes of a sale', () => {
    const result = classifySalesPaymentReceipt({
      amountPence: 7000,
      receiptOrigin: RECEIPT_ORIGIN.LATER_CREDIT_COLLECTION,
    });
    expect(result.classification).toBe('LATER_CREDIT_COLLECTION');
  });

  it('maps historical NULL to UNCLASSIFIED and never invents sale-time meaning', () => {
    const result = classifySalesPaymentReceipt({
      amountPence: 1000,
      receiptOrigin: null,
    });
    expect(result.classification).toBe('UNCLASSIFIED');
    expect(RECEIPT_CLASSIFICATION_LABELS.UNCLASSIFIED).toBe('Historical — not classified');
  });

  it('does not infer origin from payment timing fields (none accepted)', () => {
    const result = classifySalesPaymentReceipt({
      amountPence: 9000,
      receiptOrigin: RECEIPT_ORIGIN.RECEIVED_AT_SALE,
    });
    // Explicit at-sale origin wins even if a caller might also know timestamps.
    expect(result.classification).toBe('RECEIVED_AT_SALE');
    expect(result).not.toHaveProperty('deltaMs');
  });

  it('marks negative amounts as REVERSAL while preserving persisted origin', () => {
    const result = classifySalesPaymentReceipt({
      amountPence: -2000,
      receiptOrigin: RECEIPT_ORIGIN.UNCLASSIFIED,
    });
    expect(result.paymentState).toBe('REVERSAL');
    expect(result.classification).toBe('UNCLASSIFIED');
  });
});

describe('Home navigation contract helpers', () => {
  it('builds Trading Report deep links that preserve period and branch', () => {
    const href = tradingReportHref({
      periodKey: 'today',
      fromInputValue: '2026-08-07',
      toInputValue: '2026-08-07',
      storeId: 'ALL',
    });
    expect(href).toBe(
      '/reports/dashboard?period=today&from=2026-08-07&to=2026-08-07&storeId=ALL',
    );
  });
});
