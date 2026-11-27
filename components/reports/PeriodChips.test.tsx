import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PeriodChips, { activeReportPeriod, defaultMovementPeriod, readableReportPeriod, reportPeriodOptions } from './PeriodChips';
import { resolveEqualLengthPeriodPair } from '@/lib/reports/business-movement';
import { resolveAnalyticalRange } from '@/lib/entitlements/range';

describe('report period chips', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const zone = 'Africa/Accra';
  it('uses local dates, Monday weeks, and a complete last month', () => {
    expect(reportPeriodOptions(now, zone)).toEqual([
      { key: 'today', label: 'Today', from: '2026-11-26', to: '2026-11-26' },
      { key: 'week', label: 'This week', from: '2026-11-23', to: '2026-11-26' },
      { key: 'month', label: 'This month', from: '2026-11-01', to: '2026-11-26' },
      { key: 'last-month', label: 'Last month', from: '2026-10-01', to: '2026-10-31' },
    ]);
    expect(reportPeriodOptions(new Date('2027-01-01T00:30:00Z'), zone)[3]).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    expect(reportPeriodOptions(new Date('2026-12-31T22:30:00Z'), 'Africa/Nairobi')[0]).toMatchObject({ from: '2027-01-01', to: '2027-01-01' });
  });
  it('marks default month and explicit Today on the first day, or unmatched dates as Custom', () => {
    const options = reportPeriodOptions(new Date('2026-12-01T12:00:00Z'), zone);
    expect(activeReportPeriod(options, '2026-12-01', '2026-12-01')).toBe('month');
    expect(activeReportPeriod(options, '2026-12-01', '2026-12-01', 'today')).toBe('today');
    expect(activeReportPeriod(options, '2026-11-06', '2026-11-22')).toBe('custom');
    expect(activeReportPeriod(options, '2026-11-01', '2026-11-30', 'custom')).toBe('custom');
    expect(readableReportPeriod('2026-12-01', '2026-12-01')).toBe('1 Dec');
    expect(readableReportPeriod('2026-11-01', '2026-11-27', true)).toMatch(/^1\s*–\s*27 Nov 2026$/);
    expect(readableReportPeriod('2026-11-27', '2026-11-27', true)).toBe('27 Nov 2026');
  });
  it('opens the custom form only on Custom and preserves movement branch selection', () => {
    const props = { from: '2026-11-01', to: '2026-11-26', now, timeZone: zone };
    const html = renderToStaticMarkup(<PeriodChips {...props} />);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('type="date"');
    expect(html).toContain('from=2026-11-23&amp;to=2026-11-26');
    const custom = renderToStaticMarkup(<PeriodChips {...props} movement storeId="branch" selected="custom" />);
    expect(custom).toContain('preset=equal_length_custom&amp;storeId=branch&amp;currentFrom=');
    expect(custom).toContain('name="currentFrom"');
    expect(custom).toContain('name="currentTo"');
    expect(custom).toContain('>Apply<');
    expect(custom).not.toContain('>Update<');
  });
  it('defaults to month-to-date and protects Starter comparison history', () => {
    expect(defaultMovementPeriod(now, zone, 'PRO')).toEqual({ preset: 'equal_length_custom', currentFromKey: '2026-11-01', currentToKey: '2026-11-26' });
    const starter = defaultMovementPeriod(now, zone, 'STARTER');
    expect(starter.currentFromKey).toBe('2026-11-12');
    const pair = resolveEqualLengthPeriodPair({ timeZone: zone, ...starter });
    expect(resolveAnalyticalRange({ plan: 'STARTER', todayLocal: '2026-11-26', requested: { fromLocalDate: pair.comparisonFromKey, toLocalDate: pair.currentToKey, preset: 'CUSTOM' } }).ok).toBe(true);
    const first = resolveEqualLengthPeriodPair({ timeZone: zone, ...defaultMovementPeriod(new Date('2027-01-01T08:00:00Z'), zone, 'STARTER') });
    expect(first).toMatchObject({ currentFromKey: '2027-01-01', currentToKey: '2027-01-01', comparisonFromKey: '2026-12-31', comparisonToKey: '2026-12-31' });
  });
});
