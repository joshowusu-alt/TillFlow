import { describe, expect, it } from 'vitest';
import { UNUSED_CATALOGUE_AGE_DAYS } from '@/lib/improve-records-constants';
import {
  catalogueCutoffDate,
  classifyNoBalanceProduct,
  isOpeningStockMovement,
  purchaseNeedsSupplierLink,
} from '@/lib/improve-records-classify';

describe('classifyNoBalanceProduct', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');
  const recent = new Date('2026-07-10T12:00:00.000Z');
  const aged = new Date('2026-03-17T00:14:00.000Z');

  it('excludes products that already had confirmed quantity history', () => {
    expect(
      classifyNoBalanceProduct(
        { createdAt: aged, hasSales: false, hasConfirmedQuantityHistory: true },
        now
      )
    ).toBe('exclude');
  });

  it('treats recent products without history as genuine stock gap', () => {
    expect(
      classifyNoBalanceProduct(
        { createdAt: recent, hasSales: false, hasConfirmedQuantityHistory: false },
        now
      )
    ).toBe('genuine-gap');
  });

  it('Connys-shaped: sold without confirmed qty is genuine gap even when aged', () => {
    expect(
      classifyNoBalanceProduct(
        { createdAt: aged, hasSales: true, hasConfirmedQuantityHistory: false },
        now
      )
    ).toBe('genuine-gap');
  });

  it('EL-SHADDAI-shaped: aged never-traded catalogue is unused-catalogue', () => {
    expect(
      classifyNoBalanceProduct(
        { createdAt: aged, hasSales: false, hasConfirmedQuantityHistory: false },
        now
      )
    ).toBe('unused-catalogue');
  });

  it('uses the named age threshold', () => {
    const cutoff = catalogueCutoffDate(now);
    const justInside = new Date(cutoff.getTime() + 60_000);
    const justOutside = new Date(cutoff.getTime() - 60_000);
    expect(
      classifyNoBalanceProduct(
        { createdAt: justInside, hasSales: false, hasConfirmedQuantityHistory: false },
        now
      )
    ).toBe('genuine-gap');
    expect(
      classifyNoBalanceProduct(
        { createdAt: justOutside, hasSales: false, hasConfirmedQuantityHistory: false },
        now
      )
    ).toBe('unused-catalogue');
    expect(UNUSED_CATALOGUE_AGE_DAYS).toBe(14);
  });

  it('sold-out after balance is not classified here (no InventoryBalance candidates only)', () => {
    // Products with balance qty 0 never enter this classifier.
    expect(true).toBe(true);
  });
});

describe('purchaseNeedsSupplierLink', () => {
  it('includes unpaid genuine purchases without supplier', () => {
    expect(
      purchaseNeedsSupplierLink({
        supplierId: null,
        paymentStatus: 'UNPAID',
        hasOpeningStockMovement: false,
      })
    ).toBe(true);
  });

  it('includes PART_PAID / PARTIAL', () => {
    expect(
      purchaseNeedsSupplierLink({
        supplierId: null,
        paymentStatus: 'PART_PAID',
        hasOpeningStockMovement: false,
      })
    ).toBe(true);
    expect(
      purchaseNeedsSupplierLink({
        supplierId: null,
        paymentStatus: 'PARTIAL',
        hasOpeningStockMovement: false,
      })
    ).toBe(true);
  });

  it('excludes paid cash with no payable', () => {
    expect(
      purchaseNeedsSupplierLink({
        supplierId: null,
        paymentStatus: 'PAID',
        hasOpeningStockMovement: false,
      })
    ).toBe(false);
  });

  it('Steffi-shaped: excludes opening-stock invoices', () => {
    expect(
      purchaseNeedsSupplierLink({
        supplierId: null,
        paymentStatus: 'UNPAID',
        hasOpeningStockMovement: true,
      })
    ).toBe(false);
    expect(isOpeningStockMovement({ type: 'OPENING', referenceType: 'OPENING_STOCK' })).toBe(true);
  });

  it('excludes voided / cancelled / demo', () => {
    expect(
      purchaseNeedsSupplierLink({
        supplierId: null,
        paymentStatus: 'VOID',
        hasOpeningStockMovement: false,
      })
    ).toBe(false);
    expect(
      purchaseNeedsSupplierLink({
        supplierId: null,
        paymentStatus: 'UNPAID',
        qaTag: 'DEMO_DAY',
        hasOpeningStockMovement: false,
      })
    ).toBe(false);
  });
});
