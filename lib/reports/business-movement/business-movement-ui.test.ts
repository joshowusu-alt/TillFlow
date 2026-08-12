import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BUSINESS_MOVEMENT_DEFINITION_VERSION,
  STOCK_AVAILABILITY_READINESS,
  buildChangePair,
  buildLeakageQualitySummary,
  buildMoneyMovementLayer,
  compareSalesMovement,
  containsForbiddenStockLanguage,
  iterBusinessMovementExportCsvChunks,
  moneyPeriodFactsFromCanonicalMetrics,
  resolveBusinessMovementPeriodInput,
  resolveLastFullCalendarMonthPair,
  type BusinessMovementScope,
  type BusinessMovementWithMoneyResult,
  type MoneyPeriodFacts,
} from '@/lib/reports/business-movement';
import { MONEY_RECEIVED_DEFINITION_VERSION, resolveMoneyReceivedAccess } from '@/lib/reports/money-received';

function scope(): BusinessMovementScope {
  const periods = resolveLastFullCalendarMonthPair({
    timeZone: 'Africa/Accra',
    asOf: new Date('2026-08-12T12:00:00.000Z'),
  });
  return {
    businessId: 'biz-1',
    branchIds: null,
    currency: 'GHS',
    periods,
    asOf: new Date('2026-08-12T12:00:00.000Z'),
    definitionVersion: BUSINESS_MOVEMENT_DEFINITION_VERSION,
  };
}

function moneyFacts(partial?: Partial<MoneyPeriodFacts>): MoneyPeriodFacts {
  return {
    moneyReceivedPence: 0,
    refundOutflowsPence: 0,
    saleAmendMoneyOutPence: 0,
    needsMomoConfirmationPence: 0,
    moneyReceivedRecordCount: 0,
    refundRecordCount: 0,
    saleAmendRecordCount: 0,
    needsMomoRecordCount: 0,
    ...partial,
  };
}

function buildResult(): BusinessMovementWithMoneyResult {
  const bmScope = scope();
  const sales = compareSalesMovement({
    scope: bmScope,
    currentHeadline: {
      salesValuePence: 100_000,
      transactionCount: 10,
      unitsSold: 100,
    },
    comparisonHeadline: {
      salesValuePence: 80_000,
      transactionCount: 8,
      unitsSold: 80,
    },
    currentProducts: [
      { id: 'p1', name: 'Frytol 1L', salesValuePence: 20_000, qtyBase: 10 },
      { id: 'p2', name: 'Star Milk', salesValuePence: 5_000, qtyBase: 5 },
    ],
    comparisonProducts: [
      { id: 'p1', name: 'Frytol 1L', salesValuePence: 10_000, qtyBase: 5 },
      { id: 'p2', name: 'Star Milk', salesValuePence: 25_000, qtyBase: 20 },
    ],
    currentBranches: [{ id: 'b1', name: 'Main', salesValuePence: 100_000, transactionCount: 10 }],
    comparisonBranches: [{ id: 'b1', name: 'Main', salesValuePence: 80_000, transactionCount: 8 }],
    currentCashiers: [{ id: 'c1', name: 'Ama', salesValuePence: 60_000, transactionCount: 6 }],
    comparisonCashiers: [{ id: 'c1', name: 'Ama', salesValuePence: 50_000, transactionCount: 5 }],
    topN: 10,
  });

  const currentMoney = moneyFacts({
    moneyReceivedPence: 70_000,
    refundOutflowsPence: 5_000,
    needsMomoConfirmationPence: 3_000,
  });
  const comparisonMoney = moneyFacts({
    moneyReceivedPence: 75_000,
    refundOutflowsPence: 1_000,
    needsMomoConfirmationPence: 500,
  });
  const money = buildMoneyMovementLayer(
    currentMoney,
    comparisonMoney,
    MONEY_RECEIVED_DEFINITION_VERSION,
  );
  const leakage = buildLeakageQualitySummary({
    salesHeadline: sales.headline,
    money,
  });

  return {
    ...sales,
    money,
    leakage,
    moneyQueryFailed: false,
    moneyQueryError: null,
  };
}

describe('Business Movement 6F — period params', () => {
  it('defaults to last full calendar month', () => {
    expect(resolveBusinessMovementPeriodInput({}).preset).toBe('last_full_calendar_month');
  });

  it('accepts equal-length custom when dates valid', () => {
    const period = resolveBusinessMovementPeriodInput({
      preset: 'equal_length_custom',
      currentFrom: '2026-07-01',
      currentTo: '2026-07-31',
    });
    expect(period).toEqual({
      preset: 'equal_length_custom',
      currentFromKey: '2026-07-01',
      currentToKey: '2026-07-31',
    });
  });
});

describe('Business Movement 6F — export COMPLETE_STREAM', () => {
  it('streams COMPLETE_STREAM with required sections and no stock causation', async () => {
    const result = buildResult();
    let csv = '';
    for await (const chunk of iterBusinessMovementExportCsvChunks(result, {
      businessName: 'Demo Shop',
    })) {
      csv += chunk;
    }

    expect(csv).toContain('exportCompleteness,COMPLETE_STREAM');
    expect(csv).toContain('Business Movement');
    expect(csv).toContain('owner_insight');
    expect(csv).toContain('product_mover');
    expect(csv).toContain('branch');
    expect(csv).toContain('cashier');
    expect(csv).toContain('leakage_note');
    expect(csv).toContain('Historical stock availability is not yet reliable');
    expect(csv).not.toContain('PARTIAL_EXPORT_CAP');
    expect(containsForbiddenStockLanguage(csv)).toBe(false);
    expect(csv).toContain(String(result.money.moneyReceived.current));
    expect(csv.match(/COMPLETE_STREAM/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('Money Received values match canonical composition', () => {
    const fromCanonical = moneyPeriodFactsFromCanonicalMetrics({
      moneyReceivedPence: 70_000,
      refundOutflowsPence: 5_000,
      needsMomoConfirmationPence: 3_000,
      moneyReceivedRecordCount: 4,
      refundRecordCount: 1,
      needsMomoRecordCount: 2,
      saleAmendMoneyOutPence: 0,
      saleAmendRecordCount: 0,
    });
    const layer = buildMoneyMovementLayer(
      fromCanonical,
      moneyFacts({ moneyReceivedPence: 75_000 }),
      MONEY_RECEIVED_DEFINITION_VERSION,
    );
    expect(layer.moneyReceived).toEqual(buildChangePair(70_000, 75_000));
    expect(layer.moneyReceivedDefinitionVersion).toBe(MONEY_RECEIVED_DEFINITION_VERSION);

    const result = buildResult();
    expect(result.money.moneyReceived.current).toBe(70_000);
    expect(result.money.refundOutflows.current).toBe(5_000);
    expect(result.money.needsMomoConfirmation.current).toBe(3_000);
  });
});

describe('Business Movement 6F — access helper', () => {
  it('Owner and Manager allowed; Cashier denied', () => {
    expect(
      resolveMoneyReceivedAccess({
        actor: { role: 'OWNER', businessId: 'biz-a' },
        authorisedStoreIds: ['s1'],
      }).ok,
    ).toBe(true);
    expect(
      resolveMoneyReceivedAccess({
        actor: { role: 'MANAGER', businessId: 'biz-a' },
        authorisedStoreIds: ['s1'],
      }).ok,
    ).toBe(true);
    const cashier = resolveMoneyReceivedAccess({
      actor: { role: 'CASHIER', businessId: 'biz-a' },
      authorisedStoreIds: ['s1'],
    });
    expect(cashier.ok).toBe(false);
    if (!cashier.ok) expect(cashier.reason).toBe('ROLE_DENIED');
  });
});

describe('Business Movement 6F — surface wiring', () => {
  it('page route renders required sections and insight labels', () => {
    const root = process.cwd();
    const page = readFileSync(
      join(root, 'app/(protected)/reports/business-movement/page.tsx'),
      'utf8',
    );
    const exportRoute = readFileSync(
      join(root, 'app/(protected)/exports/business-movement/route.ts'),
      'utf8',
    );
    const nav = readFileSync(join(root, 'lib/navigation-config.ts'), 'utf8');
    const hub = readFileSync(join(root, 'app/(protected)/reports/page.tsx'), 'utf8');

    expect(page).toContain('title="Business Movement"');
    expect(page).toContain("requireBusiness(['MANAGER', 'OWNER'])");
    expect(page).toContain('Owner summary');
    expect(page).toContain('Fact');
    expect(page).toContain('Evidence');
    expect(page).toContain('Signal');
    expect(page).toContain('Recommended check');
    expect(page).toContain('Historical stock availability is not yet reliable');
    expect(page).toContain('does not attribute sales movement to stock-outs');
    expect(page).toContain('Product movers');
    expect(page).toContain('Branch movement');
    expect(page).toContain('Cashier movement');
    expect(page).toContain('Leakage / quality notes');
    expect(page).toContain('Deterministic ranking — not AI advice');
    expect(containsForbiddenStockLanguage(page)).toBe(false);
    expect(STOCK_AVAILABILITY_READINESS).toBe('NOT_RELIABLE');

    expect(exportRoute).toContain('COMPLETE_STREAM');
    expect(exportRoute).toContain('requireExportUser');
    expect(nav).toContain('/reports/business-movement');
    expect(hub).toContain('/reports/business-movement');
  });
});
