import { describe, it, expect } from 'vitest';
import { projectCashflow, type ForecastInputs } from './forecast';

function makeInputs(overrides: Partial<ForecastInputs> = {}): ForecastInputs {
  return {
    startingCashPence: 1_000_000, // 10,000.00
    arByDay: new Map(),
    apByDay: new Map(),
    avgDailyExpensesPence: 10_000, // 100.00/day
    avgDailyCashSalesPence: 50_000, // 500.00/day
    days: 7,
    ...overrides,
  };
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

describe('projectCashflow', () => {
  it('projects forward with stable cash flow', () => {
    const result = projectCashflow(makeInputs());
    expect(result.days).toHaveLength(7);
    expect(result.startingCashPence).toBe(1_000_000);
    // Each day: +50k cash sales - 10k expenses = +40k net
    // After 7 days: 1M + 7*40k = 1,280,000
    expect(result.days[6].projectedBalancePence).toBe(1_280_000);
    expect(result.summary.daysUntilNegative).toBeNull();
  });

  it('detects when cash goes negative', () => {
    const result = projectCashflow(makeInputs({
      startingCashPence: 50_000,
      avgDailyCashSalesPence: 5_000,
      avgDailyExpensesPence: 20_000,
      days: 14,
    }));
    // Net daily: 5k - 20k = -15k. Starting 50k -> negative on day 4
    expect(result.summary.daysUntilNegative).toBeLessThanOrEqual(4);
    expect(result.summary.lowestPointPence).toBeLessThan(0);
  });

  it('includes AR inflows on their expected dates', () => {
    const arByDay = new Map<string, number>();
    const day3 = futureDate(3);
    arByDay.set(day3, 500_000);

    const result = projectCashflow(makeInputs({ arByDay }));
    // Day 3 should have a big inflow (85% of 500k = 425k + 50k daily)
    const day3Result = result.days[2]; // 0-indexed
    expect(day3Result.expectedInflowPence).toBe(425_000 + 50_000);
  });

  it('includes AP outflows on their expected dates', () => {
    const apByDay = new Map<string, number>();
    const day2 = futureDate(2);
    apByDay.set(day2, 300_000);

    const result = projectCashflow(makeInputs({ apByDay }));
    const day2Result = result.days[1];
    expect(day2Result.expectedOutflowPence).toBe(300_000 + 10_000);
  });

  it('best scenario is always >= expected', () => {
    const result = projectCashflow(makeInputs());
    for (const day of result.days) {
      expect(day.scenarioBestPence).toBeGreaterThanOrEqual(day.projectedBalancePence);
    }
  });

  it('worst scenario is always <= expected', () => {
    const result = projectCashflow(makeInputs());
    for (const day of result.days) {
      expect(day.scenarioWorstPence).toBeLessThanOrEqual(day.projectedBalancePence);
    }
  });

  it('handles zero daily values gracefully', () => {
    const result = projectCashflow(makeInputs({
      avgDailyCashSalesPence: 0,
      avgDailyExpensesPence: 0,
    }));
    // Balance should stay flat
    expect(result.days[6].projectedBalancePence).toBe(1_000_000);
  });
});
