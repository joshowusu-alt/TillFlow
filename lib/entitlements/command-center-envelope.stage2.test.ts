import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSurfaceAccess } from '@/lib/entitlements/decide';
import { requestedStoreId } from '@/lib/entitlements/live-report';
import { commandCenterRequestedRange, earliestPermittedLocalDate } from '@/lib/entitlements/range';
import type { SurfaceAccessInput } from '@/lib/entitlements/types';
import { localDateInstant } from '@/lib/reports/reporting-clock';

function commandCenter(plan: 'STARTER' | 'GROWTH' | 'PRO', range: SurfaceAccessInput['range'], scope?: SurfaceAccessInput['scope']) {
  return decideSurfaceAccess({
    surfaceId: 'command_center',
    action: 'VIEW',
    actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'OWNER', active: true },
    business: {
      id: 'biz-1',
      plan,
      mode: null,
      storeMode: plan === 'PRO' ? 'MULTI_STORE' : 'SINGLE_STORE',
      addonOnlineStorefront: false,
      isDemo: false,
      billing: 'PAID_ACTIVE',
    },
    scope: {
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-a',
      ...scope,
    },
    range,
    now: new Date('2026-01-31T15:00:00.000Z'),
    timezone: 'Africa/Accra',
  });
}

describe('Command Center authorised envelope', () => {
  it('keeps Starter on 31 January inside the 30-date horizon and refuses a 35-date request', () => {
    const requested = commandCenterRequestedRange({
      plan: 'STARTER',
      todayLocal: '2026-01-31',
      includeSupplierMonth: false,
    });
    expect(requested.fromLocalDate).toBe('2026-01-17');
    expect(requested.fromLocalDate >= earliestPermittedLocalDate('STARTER', '2026-01-31')!).toBe(true);
    expect(commandCenter('STARTER', requested).ok).toBe(true);
    expect(commandCenter('STARTER', {
      fromLocalDate: '2025-12-27',
      toLocalDate: '2026-01-31',
      preset: 'CUSTOM',
    })).toMatchObject({ ok: false, reason: 'RANGE_EXCEEDS_PLAN' });
  });

  it('authorises the tenant month for Growth and Pro without a hidden 35-date start', () => {
    const growth = commandCenterRequestedRange({
      plan: 'GROWTH',
      todayLocal: '2026-01-31',
      includeSupplierMonth: true,
    });
    expect(growth.fromLocalDate).toBe('2026-01-01');
    expect(commandCenter('GROWTH', growth).ok).toBe(true);
    const pro = commandCenterRequestedRange({
      plan: 'PRO',
      todayLocal: '2026-01-31',
      includeSupplierMonth: true,
    });
    expect(pro.fromLocalDate).toBe('2026-01-01');
    expect(commandCenter('PRO', pro, { requestedStoreId: 'ALL' }).ok).toBe(true);
  });

  it('subtracts calendar days across the New York spring-forward day', () => {
    const requested = commandCenterRequestedRange({
      plan: 'STARTER',
      todayLocal: '2026-03-08',
      includeSupplierMonth: false,
    });
    expect(requested.fromLocalDate).toBe('2026-02-22');
    expect(localDateInstant('2026-03-08', 'start', 'America/New_York')?.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(localDateInstant('2026-02-22', 'start', 'America/New_York')?.toISOString()).toBe('2026-02-22T05:00:00.000Z');
  });

  it('denies Growth consolidation and duplicate store parameters before a query', () => {
    expect(commandCenter('GROWTH', commandCenterRequestedRange({
      plan: 'GROWTH',
      todayLocal: '2026-01-31',
      includeSupplierMonth: true,
    }), { requestedStoreId: 'ALL' })).toMatchObject({ ok: false, reason: 'SCOPE_CONSOLIDATED_FORBIDDEN' });
    expect(requestedStoreId({ storeId: ['store-a', 'store-b'] })).toBe('');
    expect(requestedStoreId({ storeId: ['store-a', 'store-a'] })).toBe('store-a');
    const page = readFileSync(join(process.cwd(), 'app/(protected)/reports/command-center/page.tsx'), 'utf8');
    const denial = page.indexOf('if (!opened.ok) return opened.denial');
    const query = page.indexOf('getCommandCenterKpis(');
    expect(denial).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(denial);
    expect(page).toContain('commandCenterRequestedRange');
    expect(page).toContain('storeIds: branch.storeIds');
  });
});
