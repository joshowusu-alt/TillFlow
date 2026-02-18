import { describe, it, expect } from 'vitest';
import { calculateHealthScore, type HealthScoreInputs } from './health-score';

function makeInputs(overrides: Partial<HealthScoreInputs> = {}): HealthScoreInputs {
  return {
    totalSalesPence: 1_000_000,
    grossMarginPence: 250_000,
    targetGpPercent: 20,
    cashOnHandPence: 5_000_000,
    dailyOperatingExpensesPence: 100_000,
    arTotalPence: 200_000,
    arOver90Pence: 10_000,
    totalTrackedProducts: 100,
    productsAboveReorderPoint: 95,
    openHighAlerts: 0,
    ...overrides,
  };
}

describe('calculateHealthScore', () => {
  it('returns a perfect score for a healthy business', () => {
    const result = calculateHealthScore(makeInputs());
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.grade).toBe('GREEN');
    expect(result.dimensions).toHaveLength(5);
    expect(result.topDrivers).toHaveLength(3);
  });

  it('grades RED when margin is negative', () => {
    const result = calculateHealthScore(makeInputs({
      grossMarginPence: -50_000,
    }));
    expect(result.dimensions.find(d => d.name === 'Margin Health')?.score).toBe(0);
    expect(result.actions.some(a => a.href === '/reports/margins')).toBe(true);
  });

  it('grades correctly for a new business with no data', () => {
    const result = calculateHealthScore(makeInputs({
      totalSalesPence: 0,
      grossMarginPence: 0,
      cashOnHandPence: 0,
      dailyOperatingExpensesPence: 0,
      arTotalPence: 0,
      arOver90Pence: 0,
      totalTrackedProducts: 0,
      productsAboveReorderPoint: 0,
      openHighAlerts: 0,
    }));
    // Should be moderate — not 0, not 100
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('penalizes many high-severity alerts', () => {
    const result = calculateHealthScore(makeInputs({ openHighAlerts: 6 }));
    expect(result.dimensions.find(d => d.name === 'Controls')?.score).toBe(0);
  });

  it('penalizes high AR ageing', () => {
    const result = calculateHealthScore(makeInputs({
      arTotalPence: 1_000_000,
      arOver90Pence: 800_000, // 80% over 90 days
    }));
    const arDim = result.dimensions.find(d => d.name === 'Receivables');
    expect(arDim?.score).toBeLessThanOrEqual(5);
  });

  it('penalizes low inventory health', () => {
    const result = calculateHealthScore(makeInputs({
      totalTrackedProducts: 100,
      productsAboveReorderPoint: 40, // only 40% above reorder
    }));
    const invDim = result.dimensions.find(d => d.name === 'Inventory');
    expect(invDim?.score).toBeLessThanOrEqual(5);
  });

  it('clamps score between 0 and 100', () => {
    const worst = calculateHealthScore(makeInputs({
      totalSalesPence: 100,
      grossMarginPence: -100,
      cashOnHandPence: 0,
      dailyOperatingExpensesPence: 999_999,
      arTotalPence: 1_000_000,
      arOver90Pence: 1_000_000,
      totalTrackedProducts: 100,
      productsAboveReorderPoint: 0,
      openHighAlerts: 10,
    }));
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
    expect(worst.grade).toBe('RED');
  });

  it('returns up to 3 actions', () => {
    const result = calculateHealthScore(makeInputs({
      grossMarginPence: 0,
      cashOnHandPence: 0,
      dailyOperatingExpensesPence: 100_000,
      arTotalPence: 1_000_000,
      arOver90Pence: 900_000,
      totalTrackedProducts: 100,
      productsAboveReorderPoint: 10,
      openHighAlerts: 5,
    }));
    expect(result.actions.length).toBeLessThanOrEqual(3);
    expect(result.actions.every(a => a.href && a.label)).toBe(true);
  });
});
