import { describe, it, expect } from 'vitest';
import { computeBusinessAlerts, type AlertInputs } from './alerts';

function makeInputs(overrides: Partial<AlertInputs> = {}): AlertInputs {
  return {
    gpPercent: 25,
    totalSalesPence: 1_000_000,
    arTotalPence: 200_000,
    arOver60Pence: 10_000,
    arOver90Pence: 5_000,
    urgentReorderCount: 1,
    cashVarianceTotalPence: 500,
    cashVarianceThresholdPence: 2000,
    thisWeekExpensesPence: 100_000,
    fourWeekAvgExpensesPence: 100_000,
    forecastNegativeWithin14Days: false,
    lowestProjectedBalancePence: 500_000,
    negativeMarginProductCount: 0,
    momoPendingCount: 0,
    momoPendingThreshold: 5,
    stockoutImminentCount: 0,
    discountOverrideCount: 2,
    discountOverrideThreshold: 10,
    ...overrides,
  };
}

describe('computeBusinessAlerts', () => {
  it('returns no alerts for a healthy business', () => {
    const alerts = computeBusinessAlerts(makeInputs());
    expect(alerts).toHaveLength(0);
  });

  it('fires MARGIN_FALLING when GP < 15%', () => {
    const alerts = computeBusinessAlerts(makeInputs({ gpPercent: 10 }));
    const alert = alerts.find(a => a.id === 'MARGIN_FALLING');
    expect(alert).toBeTruthy();
    expect(alert!.severity).toBe('HIGH');
    expect(alert!.cta.href).toBe('/reports/margins');
  });

  it('does not fire MARGIN_FALLING with no sales', () => {
    const alerts = computeBusinessAlerts(makeInputs({ gpPercent: 0, totalSalesPence: 0 }));
    expect(alerts.find(a => a.id === 'MARGIN_FALLING')).toBeUndefined();
  });

  it('fires AR_AGING when >20% of AR is over 60 days', () => {
    const alerts = computeBusinessAlerts(makeInputs({
      arTotalPence: 1_000_000,
      arOver60Pence: 300_000,
    }));
    const alert = alerts.find(a => a.id === 'AR_AGING');
    expect(alert).toBeTruthy();
    expect(alert!.severity).toBe('HIGH');
  });

  it('fires CASH_VARIANCE_TREND when over threshold', () => {
    const alerts = computeBusinessAlerts(makeInputs({
      cashVarianceTotalPence: 5000,
      cashVarianceThresholdPence: 2000,
    }));
    expect(alerts.find(a => a.id === 'CASH_VARIANCE_TREND')).toBeTruthy();
  });

  it('fires STOCKOUT_IMMINENT for products near stockout', () => {
    const alerts = computeBusinessAlerts(makeInputs({ stockoutImminentCount: 5 }));
    const alert = alerts.find(a => a.id === 'STOCKOUT_IMMINENT');
    expect(alert).toBeTruthy();
    expect(alert!.severity).toBe('HIGH'); // >3 = HIGH
  });

  it('fires STOCKOUT_IMMINENT as MEDIUM for 1-3 products', () => {
    const alerts = computeBusinessAlerts(makeInputs({ stockoutImminentCount: 2 }));
    const alert = alerts.find(a => a.id === 'STOCKOUT_IMMINENT');
    expect(alert).toBeTruthy();
    expect(alert!.severity).toBe('MEDIUM');
  });

  it('fires FORECAST_NEGATIVE when cash goes negative', () => {
    const alerts = computeBusinessAlerts(makeInputs({
      forecastNegativeWithin14Days: true,
      lowestProjectedBalancePence: -50_000,
    }));
    expect(alerts.find(a => a.id === 'FORECAST_NEGATIVE')).toBeTruthy();
  });

  it('fires EXPENSE_SPIKE when 150%+ of 4-week avg', () => {
    const alerts = computeBusinessAlerts(makeInputs({
      thisWeekExpensesPence: 200_000,
      fourWeekAvgExpensesPence: 100_000,
    }));
    expect(alerts.find(a => a.id === 'EXPENSE_SPIKE')).toBeTruthy();
  });

  it('fires NEGATIVE_MARGIN_ITEMS for below-cost products', () => {
    const alerts = computeBusinessAlerts(makeInputs({ negativeMarginProductCount: 3 }));
    expect(alerts.find(a => a.id === 'NEGATIVE_MARGIN_ITEMS')).toBeTruthy();
  });

  it('fires MOMO_PENDING_SPIKE above threshold', () => {
    const alerts = computeBusinessAlerts(makeInputs({
      momoPendingCount: 8,
      momoPendingThreshold: 5,
    }));
    expect(alerts.find(a => a.id === 'MOMO_PENDING_SPIKE')).toBeTruthy();
  });

  it('fires DISCOUNT_OVERRIDE_FREQUENT above threshold', () => {
    const alerts = computeBusinessAlerts(makeInputs({
      discountOverrideCount: 15,
      discountOverrideThreshold: 10,
    }));
    expect(alerts.find(a => a.id === 'DISCOUNT_OVERRIDE_FREQUENT')).toBeTruthy();
  });

  it('sorts alerts by severity: HIGH first', () => {
    const alerts = computeBusinessAlerts(makeInputs({
      gpPercent: 10,
      urgentReorderCount: 5,
      thisWeekExpensesPence: 200_000,
      fourWeekAvgExpensesPence: 100_000,
    }));
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    const highIdx = alerts.findIndex(a => a.severity === 'HIGH');
    const medIdx = alerts.findIndex(a => a.severity === 'MEDIUM');
    if (highIdx >= 0 && medIdx >= 0) {
      expect(highIdx).toBeLessThan(medIdx);
    }
  });
});
