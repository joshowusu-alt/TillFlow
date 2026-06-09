import { describe, expect, it } from 'vitest';
import { buildReferralReport, type ReferralBusinessRow } from './reporting';

function row(overrides: Partial<ReferralBusinessRow> = {}): ReferralBusinessRow {
  return {
    businessId: 'b1',
    businessName: 'Shop',
    referralSource: 'WHATSAPP_GROUP',
    referralStatus: 'TRIAL_STARTED',
    assignedAgent: 'Kofi',
    isPaid: false,
    inTrial: true,
    ...overrides,
  };
}

describe('buildReferralReport', () => {
  it('aggregates by source', () => {
    const report = buildReferralReport([
      row(),
      row({ businessId: 'b2', referralSource: 'WEBSITE', referralStatus: 'PAID', isPaid: true }),
    ]);
    expect(report.bySource.length).toBeGreaterThanOrEqual(2);
    expect(report.totals.withSource).toBe(2);
  });

  it('keeps agent demo and trial totals used by Control', () => {
    const report = buildReferralReport([
      row({ businessId: 'b1', referralStatus: 'DEMO_BOOKED', inTrial: false }),
      row({ businessId: 'b2', referralStatus: 'PAID', isPaid: true }),
    ]);

    expect(report.byAgent).toContainEqual({
      agent: 'Kofi',
      total: 2,
      demoBooked: 2,
      trials: 1,
      paid: 1,
    });
  });
});
