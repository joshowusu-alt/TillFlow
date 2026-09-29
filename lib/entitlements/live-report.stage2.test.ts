import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decideSurfaceAccess } from '@/lib/entitlements/decide';
import { buildSurfaceAccessInput } from '@/lib/entitlements/live-report';
import type { SurfaceAccessInput } from '@/lib/entitlements/types';

const NOW = new Date('2026-09-28T12:00:00.000Z');

function input(overrides: Partial<SurfaceAccessInput> = {}): SurfaceAccessInput {
  return {
    surfaceId: 'trading_report',
    action: 'VIEW',
    actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'OWNER', active: true },
    now: NOW,
    timezone: 'Africa/Accra',
    ...overrides,
    business: {
      id: 'biz-1',
      plan: 'GROWTH',
      mode: null,
      storeMode: 'MULTI_STORE',
      addonOnlineStorefront: false,
      isDemo: false,
      billing: 'PAID_ACTIVE',
      ...overrides.business,
    },
    scope: {
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-a',
      ...overrides.scope,
    },
  };
}

describe('live report decision wiring', () => {
  it('does not copy selectedPlan into the decision input', () => {
    const built = buildSurfaceAccessInput({
      surfaceId: 'trading_report',
      action: 'VIEW',
      user: { id: 'user-1', businessId: 'biz-1', role: 'OWNER', active: true },
      business: {
        id: 'biz-1',
        plan: 'STARTER',
        mode: 'BASIC',
        storeMode: 'SINGLE_STORE',
        addonOnlineStorefront: false,
        isDemo: false,
        selectedPlan: 'PRO',
      } as never,
      billing: 'PAID_ACTIVE',
      ownedStoreIds: ['store-a'],
      cookieStoreId: 'store-a',
      now: NOW,
      timezone: 'Africa/Accra',
    });
    expect(built.business.plan).toBe('STARTER');
    expect(JSON.stringify(built)).not.toContain('selectedPlan');
    expect(JSON.stringify(built)).not.toContain('PRO');
  });

  it('gives the page view and the export route the same store denial', () => {
    const searchScope = {
      ownedStoreIds: ['store-a', 'store-b'],
      operationalStoreId: 'store-a',
      requestedStoreId: 'store-foreign',
    };
    const view = decideSurfaceAccess(input({ surfaceId: 'weekly_digest', scope: searchScope }));
    const exported = decideSurfaceAccess(
      input({ surfaceId: 'export_weekly_digest', action: 'EXPORT', scope: searchScope }),
    );
    expect(view).toMatchObject({ ok: false, reason: 'SCOPE_STORE_INVALID' });
    expect(exported).toMatchObject({ ok: false, reason: 'SCOPE_STORE_INVALID' });
  });

  it('denies a cashier the trading report and its data decision the same way', () => {
    const cashier = input({
      actor: { kind: 'USER', userId: 'user-1', businessId: 'biz-1', role: 'CASHIER', active: true },
    });
    expect(decideSurfaceAccess(cashier)).toMatchObject({ ok: false, reason: 'ROLE_FORBIDDEN' });
  });

  it('lets a restricted account view a report and blocks the export', () => {
    const view = decideSurfaceAccess(input({ business: { billing: 'PAYMENT_RESTRICTED' } as never }));
    const exported = decideSurfaceAccess(
      input({ surfaceId: 'export_weekly_digest', action: 'EXPORT', business: { billing: 'READ_ONLY' } as never }),
    );
    expect(view).toMatchObject({ ok: true, readOnly: true });
    expect(exported).toMatchObject({ ok: false, reason: 'BILLING_RESTRICTED' });
  });

  it('denies cancelled report viewing', () => {
    expect(decideSurfaceAccess(input({ business: { billing: 'CANCELLED' } as never }))).toMatchObject({
      ok: false,
      reason: 'BILLING_CANCELLED',
    });
  });

  it('stops Growth from consolidating and lets Pro consolidate only when classified', () => {
    const growth = decideSurfaceAccess(input({ scope: { requestedStoreId: 'ALL' } }));
    const pro = decideSurfaceAccess(
      input({
        business: { plan: 'PRO' } as never,
        scope: { requestedStoreId: 'ALL' },
      }),
    );
    const accounting = decideSurfaceAccess(
      input({
        surfaceId: 'income_statement',
        business: { plan: 'PRO' } as never,
        scope: { requestedStoreId: 'ALL' },
      }),
    );
    expect(growth).toMatchObject({ ok: false, reason: 'SCOPE_CONSOLIDATED_FORBIDDEN' });
    expect(pro.ok).toBe(true);
    expect(accounting).toMatchObject({ ok: false, reason: 'SCOPE_STORE_INVALID' });
  });

  it('rejects accounting storeId before a report would run', () => {
    for (const surfaceId of ['income_statement', 'balance_sheet', 'cash_flow_statement', 'export_financials']) {
      const decision = decideSurfaceAccess(
        input({
          surfaceId,
          action: surfaceId === 'export_financials' ? 'EXPORT' : 'VIEW',
          scope: { requestedStoreId: 'store-a' },
        }),
      );
      expect(decision).toMatchObject({ ok: false, reason: 'SCOPE_STORE_INVALID' });
    }
  });

  it('rejects a missing, foreign, or empty store on a dimensional report', () => {
    expect(
      decideSurfaceAccess(input({ scope: { operationalStoreId: null } })),
    ).toMatchObject({ ok: false, reason: 'SCOPE_STORE_UNSELECTED' });
    expect(
      decideSurfaceAccess(input({ scope: { requestedStoreId: 'store-foreign' } })),
    ).toMatchObject({ ok: false, reason: 'SCOPE_STORE_INVALID' });
    expect(
      decideSurfaceAccess(input({ scope: { requestedStoreId: '' } })),
    ).toMatchObject({ ok: false, reason: 'SCOPE_STORE_INVALID' });
  });

  it('rejects another business id', () => {
    expect(
      decideSurfaceAccess(input({ scope: { subjectBusinessId: 'biz-2' } })),
    ).toMatchObject({ ok: false, reason: 'SCOPE_TENANT_MISMATCH' });
  });

  it('fails closed on an unknown surface and an unknown action', () => {
    expect(decideSurfaceAccess(input({ surfaceId: 'not_a_report' }))).toMatchObject({
      ok: false,
      reason: 'CATALOGUE_UNKNOWN',
    });
    expect(decideSurfaceAccess(input({ action: 'DELETE' }))).toMatchObject({
      ok: false,
      reason: 'CATALOGUE_UNKNOWN',
    });
  });

  it('does not treat SYSTEM as an ordinary report actor', () => {
    expect(
      decideSurfaceAccess(
        input({
          actor: {
            kind: 'SYSTEM',
            authenticatedJob: 'OWNER_DAILY_SUMMARY_ENQUEUE',
            invocationId: 'job-1',
          },
        }),
      ),
    ).toMatchObject({ ok: false, reason: 'UNAUTHENTICATED' });
  });

  it('places the live gate before each report query', () => {
    const pairs = [
      ['app/(protected)/reports/income-statement/page.tsx', 'getIncomeStatement'],
      ['app/(protected)/reports/balance-sheet/page.tsx', 'getBalanceSheet'],
      ['app/(protected)/reports/cashflow/page.tsx', 'getCashflow'],
      ['app/(protected)/reports/weekly-digest/page.tsx', 'getWeeklyDigestData'],
      ['app/api/reports/financials/route.ts', 'getIncomeStatement'],
      ['app/api/reports/weekly-digest/route.ts', 'getWeeklyDigestData'],
    ];
    for (const [file, query] of pairs) {
      const source = readFileSync(file, 'utf8');
      const gate = source.indexOf('openLiveReport') >= 0 ? source.indexOf('openLiveReport') : source.indexOf('guardLiveReport');
      expect(gate).toBeGreaterThanOrEqual(0);
      expect(gate).toBeLessThan(source.indexOf(query));
    }
  });
});
