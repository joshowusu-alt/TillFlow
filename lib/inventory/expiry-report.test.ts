import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildExpiryReport,
  expiryTrackingEnabled,
  formatExpiringSoonDescription,
  shouldShowExpiringSoonCard,
} from './expiry-report';
import { utcCalendarDate } from './batch-dates';

const today = utcCalendarDate(2026, 11, 13)!;
const at = (day: number) => utcCalendarDate(2026, 11, day)!;

describe('expiry card counts and plan gating', () => {
  const report = buildExpiryReport({
    today,
    onHand: [
      { storeId: 's', productId: 'milk', qtyOnHandBase: 8 },
      { storeId: 's', productId: 'bread', qtyOnHandBase: 2 },
    ],
    costs: [
      { storeId: 's', productId: 'milk', avgCostBasePence: 150, productName: 'Milk', defaultCostBasePence: 100 },
      { storeId: 's', productId: 'bread', avgCostBasePence: 0, productName: 'Bread', defaultCostBasePence: 80 },
    ],
    batches: [
      { id: 'sold', storeId: 's', productId: 'milk', qtyReceivedBase: 10, createdAt: at(1), expiryDate: at(10) },
      { id: 'expired', storeId: 's', productId: 'milk', qtyReceivedBase: 3, createdAt: at(8), expiryDate: at(12) },
      { id: 'week', storeId: 's', productId: 'milk', qtyReceivedBase: 4, createdAt: at(10), expiryDate: at(16) },
      { id: 'fortnight', storeId: 's', productId: 'bread', qtyReceivedBase: 2, createdAt: at(12), expiryDate: at(24) },
      { id: 'later', storeId: 's', productId: 'bread', qtyReceivedBase: 2, createdAt: at(11), expiryDate: at(28) },
      { id: 'undated', storeId: 's', productId: 'milk', qtyReceivedBase: 1, createdAt: at(13), expiryDate: null },
    ],
  });

  it('counts expired, 7-day and 14-day batches still estimated on hand', () => {
    expect(report.counts).toEqual({ expired: 1, within7: 1, within14: 2 });
    expect(report.rows.map((row) => row.batchId)).toEqual(['expired', 'week', 'fortnight']);
    expect(report.rows.find((row) => row.batchId === 'expired')).toMatchObject({
      estimatedQtyBase: 3,
      daysLeft: -1,
      valueAtRiskPence: 450,
    });
    expect(report.rows.find((row) => row.batchId === 'week')?.daysLeft).toBe(3);
    expect(report.rows.find((row) => row.batchId === 'fortnight')).toMatchObject({
      estimatedQtyBase: 2,
      valueAtRiskPence: 160,
      bucket: 'within8to14',
    });
  });

  it('lets a newer undated receipt explain on-hand before an older dated one', () => {
    expect(report.rows.find((row) => row.batchId === 'sold')).toBeUndefined();
    const milkLeft = report.rows.filter((row) => row.productId === 'milk').reduce((sum, row) => sum + row.estimatedQtyBase, 0);
    expect(milkLeft).toBeLessThanOrEqual(8);
  });

  it('describes the three windows and hides the card below Growth', () => {
    expect(formatExpiringSoonDescription(report.counts)).toBe(
      '1 already expired, 1 within 7 days, 2 within 14 days',
    );
    expect(expiryTrackingEnabled('STARTER')).toBe(false);
    expect(expiryTrackingEnabled('GROWTH')).toBe(true);
    expect(expiryTrackingEnabled('PRO')).toBe(true);
    expect(shouldShowExpiringSoonCard('STARTER', report.counts)).toBe(false);
    expect(shouldShowExpiringSoonCard('GROWTH', report.counts)).toBe(true);
    expect(shouldShowExpiringSoonCard('PRO', { expired: 0, within7: 0, within14: 0 })).toBe(false);
  });

  it('gates the owner home card the same way as reorder needed', () => {
    const slot = readFileSync(join(process.cwd(), 'components/owner-home/HomeAttentionSlot.tsx'), 'utf8');
    expect(slot).toContain("label: 'Expiring soon'");
    expect(slot).toContain("href: '/reports/expiring'");
    expect(slot).toContain('shouldShowExpiringSoonCard(plan, data.expiry)');
    expect(slot).toContain("hasPlanAccess(plan, 'GROWTH')");
  });
});
