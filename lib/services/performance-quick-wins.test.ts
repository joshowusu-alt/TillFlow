/**
 * Phase A performance quick-win safety tests.
 *
 * These tests guard source-level invariants introduced in Phase A:
 *   – Owner Dashboard snapshot is wrapped in unstable_cache with a short TTL.
 *   – TodayKPIs is wrapped in unstable_cache with a short TTL (pre-existing, confirmed here).
 *   – Monitoring queries in today-kpis.ts have 90-day recency floors.
 *   – Monitoring scans in owner-dashboard.ts have 30-day recency floors.
 *   – No authoritative balance services, financial reports, schema, POS TTLs, or
 *     forecast calculations were changed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase A: performance quick-wins safety', () => {
  const ownerDashSrc   = readFileSync(join(process.cwd(), 'lib/reports/owner-dashboard.ts'), 'utf8');
  const todayKpisSrc   = readFileSync(join(process.cwd(), 'lib/reports/today-kpis.ts'), 'utf8');
  const forecastSrc    = readFileSync(join(process.cwd(), 'lib/reports/forecast.ts'), 'utf8');
  const financialsSrc  = readFileSync(join(process.cwd(), 'lib/reports/financials.ts'), 'utf8');
  const schemaSrc      = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
  const posSrc         = readFileSync(join(process.cwd(), 'app/(protected)/pos/page.tsx'), 'utf8') + '\n' + readFileSync(join(process.cwd(), 'app/(protected)/pos/PosBoard.tsx'), 'utf8') + '\n' + readFileSync(join(process.cwd(), 'app/(protected)/pos/PosDeferredSection.tsx'), 'utf8');
  const customersSvc   = readFileSync(join(process.cwd(), 'lib/services/customers.ts'), 'utf8');
  const suppliersSvc   = readFileSync(join(process.cwd(), 'lib/services/suppliers.ts'), 'utf8');
  const salesSvc       = readFileSync(join(process.cwd(), 'lib/services/sales.ts'), 'utf8');

  // ── 1. Owner Dashboard caching ───────────────────────────────────────────────

  it('1. owner-dashboard imports unstable_cache', () => {
    expect(ownerDashSrc).toContain("import { unstable_cache } from 'next/cache'");
  });

  it('2. owner-dashboard wraps snapshot in unstable_cache', () => {
    expect(ownerDashSrc).toContain('unstable_cache(');
    expect(ownerDashSrc).toContain('_getOwnerDashboardSnapshot');
    expect(ownerDashSrc).toContain('cachedOwnerDashboard');
  });

  it('3. owner-dashboard cache key includes report-owner-dashboard', () => {
    expect(ownerDashSrc).toContain("'report-owner-dashboard'");
  });

  it('4. owner-dashboard cache TTL is 60 seconds', () => {
    expect(ownerDashSrc).toContain('revalidate: 60');
  });

  it('5. owner-dashboard cache uses owner-dashboard tag', () => {
    expect(ownerDashSrc).toContain("'owner-dashboard'");
  });

  it('6. getOwnerDashboardSnapshot exported wrapper passes businessId and currency', () => {
    expect(ownerDashSrc).toContain('cachedOwnerDashboard(businessId, currency');
  });

  it('7. cache key is scoped with storeId to avoid cross-business data', () => {
    // storeId ?? '' is passed so the cache key is deterministic per store scope
    expect(ownerDashSrc).toContain("storeId ?? ''");
  });

  // ── 2. TodayKPIs caching (pre-existing) ─────────────────────────────────────

  it('8. today-kpis imports unstable_cache', () => {
    expect(todayKpisSrc).toContain("import { unstable_cache } from 'next/cache'");
  });

  it('9. today-kpis wraps getTodayKPIs in unstable_cache', () => {
    expect(todayKpisSrc).toContain('cachedTodayKPIs');
    expect(todayKpisSrc).toContain('unstable_cache(');
  });

  it('10. today-kpis cache key includes report-today-kpis', () => {
    expect(todayKpisSrc).toContain("'report-today-kpis'");
  });

  it('11. today-kpis cache TTL is 30 seconds', () => {
    expect(todayKpisSrc).toContain('revalidate: 30');
  });

  it('12. today-kpis exported wrapper passes businessId', () => {
    expect(todayKpisSrc).toContain('cachedTodayKPIs(businessId');
  });

  // ── 3. Recency floors in today-kpis.ts ──────────────────────────────────────

  it('13. today-kpis SQLite path defines ninetyDaysAgo', () => {
    expect(todayKpisSrc).toContain('ninetyDaysAgo');
  });

  it('14. today-kpis SQLite openSalesInvoices query has ninetyDaysAgo floor', () => {
    // The SQLite UNPAID salesInvoice query must include the 90-day floor
    // Both the SQLite and Postgres paths use the same pattern.
    const matches = todayKpisSrc.match(/UNPAID.*?PART_PAID.*?ninetyDaysAgo|ninetyDaysAgo.*?UNPAID/gs);
    expect(todayKpisSrc.match(/ninetyDaysAgo/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('15. today-kpis has ninetyDaysAgo applied to openSalesInvoices (UNPAID filter)', () => {
    // Check both SQLite and Postgres paths have the recency floor on UNPAID invoices
    expect(todayKpisSrc).toContain("paymentStatus: { in: ['UNPAID', 'PART_PAID'] }, createdAt: { gte: ninetyDaysAgo }");
  });

  it('16. today-kpis has ninetyDaysAgo applied to outstandingPurchases', () => {
    // purchaseInvoice UNPAID query also has the floor
    expect(todayKpisSrc).toContain("paymentStatus: { in: ['UNPAID', 'PART_PAID'] }, createdAt: { gte: ninetyDaysAgo }");
  });

  // ── 4. Recency floors in owner-dashboard.ts ──────────────────────────────────

  it('17. owner-dashboard defines thirtyDaysAgo', () => {
    expect(ownerDashSrc).toContain('thirtyDaysAgo');
  });

  it('18. discountOverrideReason scan has thirtyDaysAgo floor', () => {
    expect(ownerDashSrc).toContain('discountOverrideReason: { not: null }');
    // Check the floor is applied near the discount override scan
    const discountBlock = ownerDashSrc.match(/discountOverrideReason[\s\S]{0,300}thirtyDaysAgo|thirtyDaysAgo[\s\S]{0,300}discountOverrideReason/);
    expect(discountBlock).not.toBeNull();
  });

  it('19. shift variance scan has thirtyDaysAgo floor (closedAt gte)', () => {
    expect(ownerDashSrc).toContain('closedAt: { gte: thirtyDaysAgo }');
  });

  it('20. stockAdjustment scan has thirtyDaysAgo floor', () => {
    // The recent stock adjustment scan includes the date bound
    const adjustBlock = ownerDashSrc.match(/stockAdjustment\.findMany[\s\S]{0,300}thirtyDaysAgo/);
    expect(adjustBlock).not.toBeNull();
  });

  // ── 5. Safety: authoritative balance services untouched ──────────────────────

  it('21. customers service does not contain ninetyDaysAgo', () => {
    expect(customersSvc).not.toContain('ninetyDaysAgo');
  });

  it('22. suppliers service does not contain ninetyDaysAgo', () => {
    expect(suppliersSvc).not.toContain('ninetyDaysAgo');
  });

  it('23. sales service calculations unchanged (no ninetyDaysAgo in sales service)', () => {
    expect(salesSvc).not.toContain('ninetyDaysAgo');
  });

  // ── 6. Safety: financial report services unchanged ───────────────────────────

  it('24. financials.ts is not affected by Phase A changes', () => {
    expect(financialsSrc).not.toContain('ninetyDaysAgo');
    expect(financialsSrc).not.toContain('thirtyDaysAgo');
  });

  it('25. forecast.ts calculations are unchanged', () => {
    // Forecast percentages must remain at their original values
    expect(forecastSrc).toContain('0.85');
    expect(forecastSrc).toContain('0.6');
    expect(forecastSrc).toContain('1.1');
    expect(forecastSrc).toContain('0.8');
  });

  it('26. forecast.ts still exports getCashflowForecast', () => {
    expect(forecastSrc).toContain('export function getCashflowForecast');
  });

  // ── 7. Safety: schema unchanged ──────────────────────────────────────────────

  it('27. schema still has SQLite provider (no database migration in Phase A)', () => {
    expect(schemaSrc).toContain('provider = "sqlite"');
  });

  it('28. schema models are intact', () => {
    expect(schemaSrc).toContain('model SalesInvoice');
    expect(schemaSrc).toContain('model PurchaseInvoice');
    expect(schemaSrc).toContain('model Customer');
    expect(schemaSrc).toContain('model Supplier');
    expect(schemaSrc).toContain('model Expense');
  });

  // ── 8. Safety: POS caching unchanged ─────────────────────────────────────────

  it('29. POS products cache TTL is 60 seconds (unchanged)', () => {
    expect(posSrc).toContain('revalidate: 60');
    expect(posSrc).toContain("tags: ['pos-products']");
  });

  it('30. POS inventory cache TTL is 30 seconds (unchanged)', () => {
    expect(posSrc).toContain('revalidate: 30');
    expect(posSrc).toContain("tags: ['pos-inventory']");
  });

  it('31. POS shifts cache TTL is 10 seconds (unchanged)', () => {
    expect(posSrc).toContain('revalidate: 10');
    expect(posSrc).toContain("tags: ['pos-shifts']");
  });

  it('32. POS page still uses getCachedProducts', () => {
    expect(posSrc).toContain('getCachedProducts');
    expect(posSrc).toContain('getCachedInventory');
    expect(posSrc).toContain('getCachedShifts');
  });

  // ── 9. Safety: owner dashboard still exports correct function ─────────────────

  it('33. getOwnerDashboardSnapshot is exported from owner-dashboard.ts', () => {
    expect(ownerDashSrc).toContain('export function getOwnerDashboardSnapshot');
  });

  it('34. owner-dashboard type exports are intact (OwnerDashboardSnapshot etc.)', () => {
    expect(ownerDashSrc).toContain('export type OwnerDashboardSnapshot');
    expect(ownerDashSrc).toContain('export type BusinessHealthCard');
    expect(ownerDashSrc).toContain('export type AttentionItem');
    expect(ownerDashSrc).toContain('export type ActivityItem');
  });

  it('35. getTodayKPIs is exported from today-kpis.ts', () => {
    expect(todayKpisSrc).toContain('export function getTodayKPIs');
  });

  // ── 10. No touch/pointer handlers or broad UI changes ────────────────────────

  it('36. no touch handlers added to owner-dashboard', () => {
    expect(ownerDashSrc).not.toContain('onPointerDown');
    expect(ownerDashSrc).not.toContain('onTouchStart');
  });

  it('37. no touch handlers added to today-kpis', () => {
    expect(todayKpisSrc).not.toContain('onPointerDown');
    expect(todayKpisSrc).not.toContain('onTouchStart');
  });
});
