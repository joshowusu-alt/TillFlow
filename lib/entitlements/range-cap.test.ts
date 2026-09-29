import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideSurfaceAccess } from '@/lib/entitlements/decide';
import {
  earliestPermittedLocalDate,
  inclusiveLocalDateCount,
} from '@/lib/entitlements/range';
import type { SurfaceAccessInput } from '@/lib/entitlements/types';

const TZ = 'Africa/Accra';

function atUtc(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

function decideRange(todayIso: string, range: SurfaceAccessInput['range'], plan: 'STARTER' | 'GROWTH' | 'PRO' = 'STARTER') {
  return decideSurfaceAccess({
    surfaceId: 'business_movement',
    action: 'VIEW',
    actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'OWNER', active: true },
    business: {
      id: 'biz-1',
      plan,
      mode: null,
      storeMode: 'SINGLE_STORE',
      addonOnlineStorefront: false,
      isDemo: false,
      billing: 'PAID_ACTIVE',
    },
    scope: { ownedStoreIds: ['store-1'], operationalStoreId: 'store-1' },
    range,
    now: atUtc(todayIso),
    timezone: TZ,
  });
}

describe('analytical range caps', () => {
  it('gives Starter exactly 30 local dates ending 2026-01-31', () => {
    const earliest = earliestPermittedLocalDate('STARTER', '2026-01-31');
    expect(earliest).toBe('2026-01-02');
    expect(inclusiveLocalDateCount(earliest!, '2026-01-31')).toBe(30);
  });

  it('keeps 2026-03-01 month-to-date and rewrites 2026-03-31 to the last 30 days', () => {
    const earlyMonth = decideRange('2026-03-01', {
      fromLocalDate: '2026-03-01',
      toLocalDate: '2026-03-01',
      preset: 'MONTH_TO_DATE',
    });
    expect(earlyMonth).toMatchObject({
      ok: true,
      appliedRange: { fromLocalDate: '2026-03-01', toLocalDate: '2026-03-01', label: 'Month to date' },
    });

    const monthEnd = decideRange('2026-03-31', {
      fromLocalDate: '2026-03-01',
      toLocalDate: '2026-03-31',
      preset: 'MONTH_TO_DATE',
    });
    expect(monthEnd).toMatchObject({
      ok: true,
      appliedRange: { fromLocalDate: '2026-03-02', toLocalDate: '2026-03-31', label: 'Last 30 days' },
    });
    if (monthEnd.ok && monthEnd.appliedRange) {
      expect(inclusiveLocalDateCount(monthEnd.appliedRange.fromLocalDate, monthEnd.appliedRange.toLocalDate)).toBe(30);
    }
  });

  it('counts 30 dates ending on 2024-03-01 across the leap day', () => {
    const earliest = earliestPermittedLocalDate('STARTER', '2024-03-01');
    expect(earliest).toBe('2024-02-01');
    expect(inclusiveLocalDateCount('2024-02-01', '2024-03-01')).toBe(30);
  });

  it('uses the Growth 13-month month start', () => {
    expect(earliestPermittedLocalDate('GROWTH', '2026-09-28')).toBe('2025-09-01');
    expect(earliestPermittedLocalDate('GROWTH', '2026-03-31')).toBe('2025-03-01');
    expect(earliestPermittedLocalDate('PRO', '2026-09-28')).toBeNull();
  });

  it('denies a custom from before the earliest date and returns clampHref', () => {
    const denied = decideRange(
      '2026-09-28',
      { fromLocalDate: '2025-08-31', toLocalDate: '2026-09-28', preset: 'CUSTOM' },
      'GROWTH',
    );
    expect(denied).toEqual({ ok: false, reason: 'RANGE_EXCEEDS_PLAN', clampHref: '?from=2025-09-01' });

    const allowed = decideRange(
      '2026-09-28',
      { fromLocalDate: '2025-09-01', toLocalDate: '2026-09-28', preset: 'CUSTOM' },
      'GROWTH',
    );
    expect(allowed.ok).toBe(true);
  });

  it('does not express the horizon as a millisecond duration', () => {
    const source = readRangeSource();
    expect(source).not.toMatch(/24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(source).not.toContain('86400000');
  });

  it('takes the local date in the business timezone', () => {
    const decision = decideSurfaceAccess({
      surfaceId: 'business_movement',
      action: 'VIEW',
      actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'OWNER', active: true },
      business: {
        id: 'biz-1',
        plan: 'STARTER',
        mode: null,
        storeMode: 'SINGLE_STORE',
        addonOnlineStorefront: false,
        isDemo: false,
        billing: 'PAID_ACTIVE',
      },
      scope: { ownedStoreIds: ['store-1'], operationalStoreId: 'store-1' },
      range: { fromLocalDate: '2026-01-02', toLocalDate: '2026-01-31', preset: 'CUSTOM' },
      now: new Date('2026-02-01T02:00:00.000Z'),
      timezone: 'America/Los_Angeles',
    });
    expect(decision.ok).toBe(true);

    const accra = decideSurfaceAccess({
      surfaceId: 'business_movement',
      action: 'VIEW',
      actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'OWNER', active: true },
      business: {
        id: 'biz-1',
        plan: 'STARTER',
        mode: null,
        storeMode: 'SINGLE_STORE',
        addonOnlineStorefront: false,
        isDemo: false,
        billing: 'PAID_ACTIVE',
      },
      scope: { ownedStoreIds: ['store-1'], operationalStoreId: 'store-1' },
      range: { fromLocalDate: '2026-01-02', toLocalDate: '2026-01-31', preset: 'CUSTOM' },
      now: new Date('2026-02-01T02:00:00.000Z'),
      timezone: 'Africa/Accra',
    });
    expect(accra).toMatchObject({ ok: false, reason: 'RANGE_EXCEEDS_PLAN', clampHref: '?from=2026-01-03' });
  });
});

function readRangeSource() {
  return readFileSync('lib/entitlements/range.ts', 'utf8');
}
